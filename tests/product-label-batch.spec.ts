import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Page, TestInfo } from "@playwright/test";

async function verifyPdf(page: Page, testInfo: TestInfo, count: number, name: string) {
  await page.emulateMedia({ media: "print" });
  const dimensions = await page.locator(".warehouse-product-print-batch article").evaluateAll(labels => labels.map(label => ({
    width: label.getBoundingClientRect().width,
    height: label.getBoundingClientRect().height,
    overflow: label.scrollHeight > label.clientHeight || label.scrollWidth > label.clientWidth,
  })));
  expect(dimensions).toHaveLength(count);
  expect(dimensions.every(d => Math.abs(d.width - 70 * 96 / 25.4) < 1 && Math.abs(d.height - 50 * 96 / 25.4) < 1 && !d.overflow)).toBeTruthy();
  const pdf = await page.pdf({ path: testInfo.outputPath(`${name}.pdf`), preferCSSPageSize: true, displayHeaderFooter: false, printBackground: true });
  const structure = pdf.toString("latin1");
  expect(structure.match(/\/Type\s*\/Page\b/g)).toHaveLength(count);
  const boxes = [...structure.matchAll(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/g)];
  expect(boxes.length).toBeGreaterThan(0);
  expect(boxes.every(m => Math.abs(+m[1] - 70 * 72 / 25.4) < 1 && Math.abs(+m[2] - 50 * 72 / 25.4) < 1)).toBeTruthy();
  await testInfo.attach(name, { body: pdf, contentType: "application/pdf" });
  await page.emulateMedia({ media: "screen" });
}

test.beforeEach(async ({ request, page }) => {
  const reset = await request.post("/api/test/reset");
  expect(reset.ok()).toBeTruthy();
  await page.addInitScript(() => {
    (window as any).printOutputs = [];
    window.print = () => {
      const root = document.querySelector(".warehouse-product-print-batch")
        ?? document.querySelector(".warehouse-label-print-sheet");
      (window as any).printOutputs.push(Array.from(root?.querySelectorAll(".inbound-product-label") ?? []).map(label => ({
        text: label.textContent,
        barcode: label.querySelector("svg")?.getAttribute("aria-label"),
        ready: Boolean(label.querySelector("svg rect")),
      })));
    };
  });
});

test("prints all immutable items, with ready barcodes, before accepting an operator outcome", async ({ page, request }, testInfo) => {
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Preview labels" }).click();
  const created = page.waitForResponse(r => r.url().endsWith("/api/warehouse/labels") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Print labels", exact: true }).click();
  const { job } = await (await created).json();
  await expect.poll(() => page.evaluate(() => (window as any).printOutputs.length)).toBe(1);
  const labels = await page.evaluate(() => (window as any).printOutputs[0]);
  expect(labels).toHaveLength(18);
  expect(labels.filter((l: any) => l.barcode === "Code 128 barcode DMPGWMOF001")).toHaveLength(12);
  expect(labels.filter((l: any) => l.barcode === "Code 128 barcode DMPGWMAF002")).toHaveLength(6);
  expect(labels.every((l: any) => l.ready)).toBeTruthy();
  await expect(page.getByRole("button", { name: "Preview labels", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Print labels", exact: true })).toBeDisabled();
  await verifyPdf(page, testInfo, 18, "mixed-sku-18-labels");
  expect((await (await request.get(`/api/warehouse/labels/${job.id}`, { headers: { "x-drivemate-role": "partner" } })).json()).job.status).toBe("pending");
  await page.getByRole("button", { name: "Cancel print", exact: true }).click();
  await expect(page.getByText("Receipt locked", { exact: true })).toBeVisible();
});

test("reprint renders the audited copies again and remains pending until physical confirmation", async ({ page, request }, testInfo) => {
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Print labels", exact: true }).click();
  await page.getByRole("button", { name: "Confirm printed", exact: true }).click();
  await expect(page.getByText("Receipt unlocked", { exact: true })).toBeVisible();
  await page.getByLabel("Reprint reason").fill("Labels damaged during local QA.");
  const reprinted = page.waitForResponse(r => r.url().includes("/api/warehouse/labels/") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Reprint labels", exact: true }).click();
  const { job, items } = await (await reprinted).json();
  await expect.poll(() => page.evaluate(() => (window as any).printOutputs.length)).toBe(2);
  const outputs = await page.evaluate(() => (window as any).printOutputs);
  expect(outputs[1]).toEqual(outputs[0]);
  expect(items).toHaveLength(18);
  expect(items.every((item: any) => item.sourceItemId)).toBeTruthy();
  expect(job.reprintOfJobId).toBeTruthy();
  expect((await (await request.get(`/api/warehouse/labels/${job.id}`, { headers: { "x-drivemate-role": "partner" } })).json()).job.status).toBe("pending");
  await verifyPdf(page, testInfo, 18, "reprint-18-labels");
});

test("incomplete API items never open print or enable Printed, but can still be cancelled", async ({ page }) => {
  await page.route("**/api/warehouse/labels", async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, items: body.items.slice(0, 1) } });
  });
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Print labels", exact: true }).click();
  await expect(page.getByText("The saved product label batch is incomplete or cannot be printed.")).toBeVisible();
  expect(await page.evaluate(() => (window as any).printOutputs)).toEqual([]);
  await expect(page.getByRole("button", { name: "Confirm printed", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel print", exact: true }).click();
  await expect(page.getByText("Receipt locked", { exact: true })).toBeVisible();
});

test("a failed native print call cannot be confirmed as Printed", async ({ page }) => {
  await page.goto("/warehouse");
  await page.evaluate(() => { window.print = () => { throw new Error("Local printer unavailable"); }; });
  await page.getByRole("button", { name: "Print labels", exact: true }).click();
  await expect(page.getByText("Local printer unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm printed", exact: true })).toBeDisabled();
  await expect(page.locator(".warehouse-product-print-batch")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel print", exact: true }).click();
  await expect(page.getByText("Receipt locked", { exact: true })).toBeVisible();
});

test("scope changes replace the output and read-only History does not lose the pending outcome", async ({ page }, testInfo) => {
  await page.goto("/warehouse");
  await page.getByLabel("Source scope C002", { exact: true }).check();
  await expect(page.getByText("24 labels", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Print labels", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).printOutputs.length)).toBe(1);
  let output = await page.evaluate(() => (window as any).printOutputs[0]);
  expect(output).toHaveLength(24);
  expect(output.every((l: any) => l.barcode === "Code 128 barcode DMPGWMOF001")).toBeTruthy();
  await verifyPdf(page, testInfo, 24, "selected-scope-24-labels");
  await page.getByRole("link", { name: "Receipt history", exact: true }).click();
  await expect(page.locator(".warehouse-product-print-batch")).toHaveCount(0);
  await page.getByRole("link", { name: "Label print", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm printed", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Cancel print", exact: true }).click();
  await page.getByRole("button", { name: "Full shipment", exact: true }).click();
  await expect(page.getByText("42 labels", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Print labels", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).printOutputs.length)).toBe(2);
  output = await page.evaluate(() => (window as any).printOutputs[1]);
  expect(output).toHaveLength(42);
  expect(output.filter((l: any) => l.barcode === "Code 128 barcode DMPGWMOF001")).toHaveLength(36);
  expect(output.filter((l: any) => l.barcode === "Code 128 barcode DMPGWMAF002")).toHaveLength(6);
  await verifyPdf(page, testInfo, 42, "aggregated-full-42-labels");
});

test("the full 119 SKU shipment outputs exactly 706 nonblank label pages, including both carton groups", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const csv = (file: string) => {
    const [header, ...rows] = readFileSync(file, "utf8").trim().replace(/^\uFEFF/, "").split(/\r?\n/).map(r => r.split(","));
    return rows.map(row => Object.fromEntries(header.map((key, i) => [key, row[i]])));
  };
  const source = csv("docs/operations/inbound/2026-09-03-gwm-706-unit-inbound-master-data-v3-lines.csv");
  const barcodes = new Map(csv("docs/operations/product-master/2026-09-04-gwm-product-barcode-backfill.csv").map(r => [r.sku, r.barcode]));
  const lines = source.map(row => ({ sku: row.sku, productBarcode: barcodes.get(row.sku), expectedQuantity: +row.expected_quantity }));
  const cartons = [...new Set(source.map(row => row.source_scope_number))].map(number => {
    const row = source.find(r => r.source_scope_number === number)!;
    return { sourceCartonNumber: number, kind: row.scope_kind, physicalCartonCount: +row.physical_carton_count, memberCartonNumbers: row.member_carton_numbers.split("|") };
  });
  // External boundary fixture only: no Production calls and no live job is created.
  const scope = { shipmentId: "shipment-test-1", cartonNumbers: cartons.map(c => c.sourceCartonNumber), lines };
  const job = { id: "local-706-job", templateId: "unit_product", payloadSnapshot: scope, requestedQuantity: 706, status: "pending", createdAt: "2026-09-05T00:00:00Z" };
  let sequence = 0;
  const items = lines.flatMap(line => Array.from({ length: line.expectedQuantity }, (_, copy) => ({
    id: `local-item-${++sequence}`, jobId: job.id, sequence, createdAt: job.createdAt,
    payloadSnapshot: { shipmentId: scope.shipmentId, sku: line.sku, productBarcode: line.productBarcode, copy: copy + 1 },
  })));
  await page.route("**/api/warehouse/labels?*", route => route.fulfill({ json: { ok: true, shipment: { shipmentId: scope.shipmentId, pallets: [], cartons }, scope, printGate: { ok: false } } }));
  await page.route("**/api/warehouse/labels", route => route.fulfill({ status: 201, json: { ok: true, job, items } }));
  await page.goto("/warehouse");
  await expect(page.getByText("706 labels", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Print labels", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).printOutputs.length)).toBe(1);
  const labels = await page.evaluate(() => (window as any).printOutputs[0]);
  expect(labels).toHaveLength(706);
  expect(new Set(labels.map((l: any) => l.barcode)).size).toBe(119);
  for (const row of source) {
    expect(labels.filter((l: any) => l.barcode === `Code 128 barcode ${barcodes.get(row.sku)}`)).toHaveLength(+row.expected_quantity);
  }
  expect(labels.filter((l: any) => l.barcode === "Code 128 barcode DMPGWM0064")).toHaveLength(10);
  expect(labels.filter((l: any) => l.barcode === "Code 128 barcode DMPGWM0065")).toHaveLength(10);
  expect(labels.every((l: any) => l.ready)).toBeTruthy();
  await verifyPdf(page, testInfo, 706, "full-shipment-706-labels");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  }
  await page.screenshot({ path: testInfo.outputPath("batch-screen-1440.png") });
});
