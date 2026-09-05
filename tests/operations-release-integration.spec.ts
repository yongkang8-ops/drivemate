import { expect, test } from "@playwright/test";

const headers = { "x-drivemate-role": "partner" };

test("complete labels, History filters and navigation preserve the pending outcome without changing inventory", async ({ page, request }, info) => {
  expect((await request.post("/api/test/reset")).ok()).toBeTruthy();
  const beforeResponse = await request.get("/api/warehouse-state", { headers });
  expect(beforeResponse.ok()).toBeTruthy();
  const before = await beforeResponse.json();
  expect(before.inventory.length).toBeGreaterThan(0);
  expect(Array.isArray(before.stockMovements)).toBe(true);

  await page.addInitScript(() => {
    (window as Window & { printSizes?: number[] }).printSizes = [];
    window.print = () => {
      const labels = document.querySelectorAll(".warehouse-product-print-batch article");
      (window as Window & { printSizes?: number[] }).printSizes!.push(labels.length);
    };
  });
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Full shipment", exact: true }).click();
  await expect(page.getByText("42 labels", { exact: true })).toBeVisible();
  const created = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/api/warehouse/labels"));
  await page.getByRole("button", { name: "Print labels", exact: true }).click();
  const { job, items } = await (await created).json();
  expect(items).toHaveLength(42);
  expect(await page.evaluate(() => (window as Window & { printSizes?: number[] }).printSizes)).toEqual([42]);
  await expect(page.locator(".warehouse-product-print-batch article")).toHaveCount(42);

  await page.getByRole("link", { name: "Receipt history", exact: true }).click();
  await expect(page).toHaveURL(/view=receipt_history/);
  await expect(page.getByRole("heading", { name: "Receipt history", exact: true })).toBeInViewport();
  await expect(page.locator(".warehouse-product-print-batch")).toHaveCount(0);
  await expect(page.getByLabel("Source scope", { exact: true })).toHaveValue("");
  await page.getByLabel("Source scope", { exact: true }).selectOption("C002");
  await page.getByLabel("Display timezone", { exact: true }).selectOption("Asia/Shanghai");
  await page.getByLabel("Date from", { exact: true }).fill("2020-01-01");
  await page.getByLabel("Action", { exact: true }).selectOption("print_cancelled");
  await expect(page.getByLabel("Source scope", { exact: true })).toHaveValue("C002");
  await expect(page.locator(".inbound-history-scope-summary")).toContainText("1 source scope");
  const pendingResponse = await request.get(`/api/warehouse/labels/${job.id}`, { headers });
  expect((await pendingResponse.json()).job.status).toBe("pending");

  await page.goBack();
  await expect(page).not.toHaveURL(/view=receipt_history/);
  // Back returns to the prior Label print entry, without rebuilding or reprinting the job.
  await expect(page.getByRole("button", { name: "Confirm printed", exact: true })).toBeEnabled();
  await expect(page.locator(".warehouse-product-print-batch")).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { printSizes?: number[] }).printSizes)).toEqual([42]);
  await page.getByRole("button", { name: "Cancel print", exact: true }).click();
  await page.getByRole("link", { name: "Receipt history", exact: true }).click();
  await page.getByLabel("Source scope", { exact: true }).selectOption("C002");
  await expect(page.getByText(job.id, { exact: true })).toBeVisible();
  await page.getByLabel("Display timezone", { exact: true }).selectOption("Asia/Shanghai");
  await page.getByLabel("Date from", { exact: true }).fill("2020-01-01");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByLabel("Source scope", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Display timezone", { exact: true })).toHaveValue("Asia/Shanghai");
  await expect(page.getByText(job.id, { exact: true })).toHaveCount(1);
  await page.setViewportSize({ width: 768, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.locator("#receipt-history").screenshot({ path: info.outputPath("combined-cancel-history-768.png") });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Receipt history", exact: true })).toBeVisible();
  await expect(page.getByText(job.id, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Receive stock", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm receipt", exact: true })).toHaveCount(0);

  const afterResponse = await request.get("/api/warehouse-state", { headers });
  expect(afterResponse.ok()).toBeTruthy();
  const after = await afterResponse.json();
  expect(after.inventory).toEqual(before.inventory);
  expect(after.stockMovements).toEqual(before.stockMovements);
  const savedResponse = await request.get(`/api/warehouse/labels/${job.id}`, { headers });
  expect(savedResponse.ok()).toBeTruthy();
  const saved = await savedResponse.json();
  expect(saved.job.status).toBe("cancelled");
  expect(saved.job.requestedQuantity).toBe(42);
  expect(saved.items).toHaveLength(42);
});
