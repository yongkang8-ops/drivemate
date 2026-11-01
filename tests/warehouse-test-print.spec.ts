import { expect, test } from "@playwright/test";
import { buildProductLabelContent } from "../lib/warehouseLabelContent";
test("persisted formal task blocks test printing after refresh and can be reviewed", async ({
  page,
}) => {
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Print labels", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm printed", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Test print", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Review pending formal print", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel print", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Test print", exact: true }),
  ).toBeEnabled();
});
test("administrator recovers another operators task by job ID after refresh", async ({
  page,
  request,
}) => {
  const preview = await (
    await request.get("/api/warehouse/labels?shipmentId=shipment-test-1", {
      headers: { "x-drivemate-role": "warehouse_staff" },
    })
  ).json();
  const saved = await request.post("/api/warehouse/test-labels", {
    headers: { "x-drivemate-role": "warehouse_staff" },
    data: {
      requestId: "44444444-4444-4444-8444-444444444444",
      selection: { shipmentId: "shipment-test-1" },
      items: [{ sku: preview.scope.lines[0].sku, copies: 2 }],
    },
  });
  const { job } = await saved.json();
  await page.route("**/api/warehouse/test-labels**", (route) =>
    route.continue({
      headers: { ...route.request().headers(), "x-drivemate-role": "admin" },
    }),
  );
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Test print", exact: true }).click();
  await page
    .getByRole("button", { name: `Open test ${job.id}`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Recovered task");
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await page.getByRole("button", { name: "Test print", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(`Test task ${job.id}`);
  expect(
    (
      await (
        await request.get(
          "/api/warehouse/test-labels?shipmentId=shipment-test-1",
          { headers: { "x-drivemate-role": "admin" } },
        )
      ).json()
    ).total,
  ).toBe(1);
});
test("known job recovery can retry a failed read after reload", async ({
  page,
  request,
}) => {
  const preview = await (
    await request.get("/api/warehouse/labels?shipmentId=shipment-test-1", {
      headers: { "x-drivemate-role": "warehouse_staff" },
    })
  ).json();
  const saved = await request.post("/api/warehouse/test-labels", {
    headers: { "x-drivemate-role": "warehouse_staff" },
    data: {
      requestId: "55555555-5555-4555-8555-555555555555",
      selection: { shipmentId: "shipment-test-1" },
      items: [{ sku: preview.scope.lines[0].sku, copies: 2 }],
    },
  });
  const { job } = await saved.json();
  let calls = 0;
  await page.route(`**/api/warehouse/test-labels/${job.id}`, (route) =>
    ++calls === 1 ? route.abort("failed") : route.continue(),
  );
  await page.goto(
    `/warehouse?shipmentId=shipment-test-1&testPrintJob=${job.id}`,
  );
  await page.getByRole("button", { name: "Test print", exact: true }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("status")).toContainText("could not be loaded");
  await panel.getByRole("button", { name: "Check saved request" }).click();
  await expect(panel).toContainText(`Test task ${job.id}`);
});
test("a second unknown creation reconciles the new request rather than the previous task", async ({
  page,
}) => {
  let posts = 0;
  await page.route("**/api/warehouse/test-labels", async (route) => {
    posts++;
    if (posts === 2) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Test print", exact: true }).click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("checkbox").first().check();
  await panel.getByRole("button", { name: "Create test task" }).click();
  await panel.getByLabel("Test result reason").fill("Calibration cancelled");
  await panel.getByRole("button", { name: "Cancel test", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("cancelled");
  await panel.getByRole("button", { name: "Start another test" }).click();
  await panel.getByRole("button", { name: "Create test task" }).click();
  await expect(panel.getByRole("status")).toContainText("unknown");
  await panel.getByRole("button", { name: "Check saved request" }).click();
  await expect(
    panel.getByRole("button", { name: "Open test print dialog" }),
  ).toBeVisible();
});
test.beforeEach(async ({ page, request }) => {
  await request.post("/api/test/reset");
  await page.addInitScript(() => {
    (window as any).testPrintCalls = 0;
    window.print = () => {
      (window as any).testPrintCalls++;
    };
  });
});
test("three-SKU fixture produces six marked 70x50mm pages without changing barcode values", async ({
  page,
}, info) => {
  const products = ["QA-A", "QA-B", "QA-C"].map((sku, i) =>
    buildProductLabelContent({
      sku,
      barcode: `DMPQA${i}`,
      labelProfile: {
        schemaVersion: 1,
        displayName: "OIL FILTER",
        vehicleMakes: ["GWM"],
        partReference: `PN${i}`,
        position: { status: "not_applicable" },
      },
    }),
  );
  await page.route("**/api/warehouse/labels?*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: { ...body, labelProducts: products },
    });
  });
  await page.route("**/api/warehouse/test-labels", async (route) => {
    const body = route.request().postDataJSON();
    const labels = body.items
      .flatMap((item: { sku: string; copies: number }) =>
        Array.from({ length: item.copies }, () => ({
          sku: item.sku,
          barcode: products.find((p) => p.sku === item.sku)!.content!
            .productBarcode,
          labelContent: products.find((p) => p.sku === item.sku)!.content,
        })),
      )
      .map((label: object, i: number) => ({
        ...label,
        itemId: `item-${i}`,
        sequence: i + 1,
      }));
    await route.fulfill({
      status: 201,
      json: {
        ok: true,
        job: {
          id: "11111111-1111-4111-8111-111111111111",
          requestId: body.requestId,
          shipmentId: "shipment-test-1",
          requestKey: "fixture",
          status: "pending",
          createdAt: "2026-11-01T00:00:00Z",
          createdBy: "qa",
          labels,
        },
      },
    });
  });
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Test print", exact: true }).click();
  const panel = page.getByRole("dialog");
  for (const box of await panel.getByRole("checkbox").all()) await box.check();
  await panel
    .getByRole("button", { name: "Create test task", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Open test print dialog", exact: true })
    .click();
  const labels = page.locator(".warehouse-test-print-batch article");
  await expect(labels).toHaveCount(6);
  for (const code of ["DMPQA0", "DMPQA1", "DMPQA2"])
    await expect(
      labels.getByRole("img", {
        name: `Code 128 barcode ${code}`,
        includeHidden: true,
      }),
    ).toHaveCount(2);
  await page.emulateMedia({ media: "print" });
  const dimensions = await labels.evaluateAll((nodes) =>
    nodes.map((node) => ({
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height,
      overflow: node.scrollHeight > node.clientHeight,
    })),
  );
  expect(
    dimensions.every(
      (d) =>
        Math.abs(d.width - (70 * 96) / 25.4) < 1 &&
        Math.abs(d.height - (50 * 96) / 25.4) < 1 &&
        !d.overflow,
    ),
  ).toBe(true);
  await labels.first().screenshot({path:info.outputPath('test-label.png')});
  if (info.project.use.browserName !== "webkit") {
    const pdf = await page.pdf({
      path: info.outputPath("six-test-labels.pdf"),
      preferCSSPageSize: true,
      printBackground: true,
    });
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(6);
  }
});
test("lost creation response is reconciled without a duplicate and survives refresh", async ({
  page,
  request,
}) => {
  let posts = 0;
  await page.route("**/api/warehouse/test-labels", async (route) => {
    posts++;
    await route.fetch();
    await route.abort("failed");
  });
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Test print", exact: true }).click();
  let panel = page.getByRole("dialog");
  await panel.getByRole("checkbox").first().check();
  await panel.getByRole("button", { name: "Create test task" }).click();
  await expect(panel.getByRole("status")).toContainText("unknown");
  await panel.getByRole("button", { name: "Check saved request" }).click();
  await expect(
    panel.getByRole("button", { name: "Open test print dialog" }),
  ).toBeEnabled();
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await page.getByRole("button", { name: "Test print", exact: true }).click();
  panel = page.getByRole("dialog");
  await expect(panel).toContainText("Recovered task");
  expect(posts).toBe(1);
  const result = await request.get(
    "/api/warehouse/test-labels?shipmentId=shipment-test-1",
    { headers: { "x-drivemate-role": "warehouse_staff" } },
  );
  expect((await result.json()).total).toBe(1);
});
test("lost outcome response is recovered without repeating a write", async ({
  page,
}) => {
  let outcomes = 0;
  await page.route("**/api/warehouse/test-labels/*", async (route) => {
    if (route.request().method() === "POST") {
      outcomes++;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Test print", exact: true }).click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("checkbox").first().check();
  await panel.getByRole("button", { name: "Create test task" }).click();
  await panel.getByLabel("Test result reason").fill("Printer unavailable");
  await panel.getByRole("button", { name: "Record test failed" }).click();
  await expect(panel.getByRole("status")).toContainText(
    "could not be confirmed",
  );
  await panel.getByRole("button", { name: "Check saved request" }).click();
  await expect(panel.getByRole("status")).toContainText("failed");
  expect(outcomes).toBe(1);
});
test("an unsent request can be recovered after reload using the same request ID", async ({
  page,
}) => {
  let firstId = "";
  let sent = false;
  await page.route("**/api/warehouse/test-labels", async (route) => {
    const body = route.request().postDataJSON();
    if (!sent) {
      firstId = body.requestId;
      await route.abort("failed");
    } else {
      expect(body.requestId).toBe(firstId);
      await route.continue();
    }
  });
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Test print", exact: true }).click();
  let panel = page.getByRole("dialog");
  await panel.getByRole("checkbox").first().check();
  await panel.getByRole("button", { name: "Create test task" }).click();
  await expect(panel.getByRole("status")).toContainText("unknown");
  page.on("dialog", (d) => d.accept());
  await page.reload();
  sent = true;
  await page.getByRole("button", { name: "Test print", exact: true }).click();
  panel = page.getByRole("dialog");
  await expect(panel.getByRole("status")).toContainText("No saved task");
  await panel.getByRole("checkbox").first().check();
  await panel.getByRole("button", { name: "Retry selected request" }).click();
  await expect(
    panel.getByRole("button", { name: "Open test print dialog" }),
  ).toBeEnabled();
});
test("mobile dialog contains focus and keeps controls within the viewport", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/warehouse");
  const trigger = page.getByRole("button", { name: "Test print", exact: true });
  await trigger.click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  expect(
    await panel.evaluate(
      (element) =>
        element.getBoundingClientRect().right <= innerWidth &&
        element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await panel.getByRole("button", { name: "Close test print" }).focus();
  await page.keyboard.press("Shift+Tab");
  expect(
    await panel.evaluate((element) => element.contains(document.activeElement)),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("test-panel-mobile.png") });
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
test("test print renders a separate marked batch and never unlocks receipt", async ({
  page,
  request,
}) => {
  await page.goto("/warehouse?shipmentId=shipment-test-1");
  await page.getByRole("button", { name: "Test print", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Test print", exact: true });
  await expect(panel).toBeVisible();
  await panel.getByRole("checkbox").nth(0).check();
  await panel.getByRole("checkbox").nth(1).check();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/warehouse/test-labels") &&
      r.request().method() === "POST",
  );
  await panel
    .getByRole("button", { name: "Create test task", exact: true })
    .click();
  const { job } = await (await response).json();
  await panel
    .getByRole("button", { name: "Open test print dialog", exact: true })
    .click();
  await expect(page.locator(".warehouse-test-print-batch article")).toHaveCount(
    4,
  );
  await expect(page.locator(".warehouse-test-print-batch")).toContainText(
    "TEST — NOT FOR STOCK",
  );
  expect(await page.evaluate(() => (window as any).testPrintCalls)).toBe(1);
  expect(
    (
      await (
        await request.get(`/api/warehouse/test-labels/${job.id}`, {
          headers: { "x-drivemate-role": "warehouse_staff" },
        })
      ).json()
    ).job.status,
  ).toBe("pending");
  await panel
    .getByRole("button", { name: "Confirm test printed", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("printed");
  await panel
    .getByRole("button", { name: "Close test print", exact: true })
    .click();
  await expect(page.getByText("Receipt locked", { exact: true })).toBeVisible();
  expect(
    (
      await request.get(`/api/warehouse/labels/${job.id}`, {
        headers: { "x-drivemate-role": "warehouse_staff" },
      })
    ).status(),
  ).toBeGreaterThanOrEqual(400);
});
test("pending formal print blocks test entry; cancellation and test history remain distinct", async ({
  page,
}) => {
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Print labels", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Test print", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancel print", exact: true }).click();
  await page.getByRole("button", { name: "Test print", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Test print", exact: true });
  await panel.getByRole("checkbox").first().check();
  await panel
    .getByRole("button", { name: "Create test task", exact: true })
    .click();
  await panel.getByLabel("Test result reason").fill("Paper not installed");
  await panel.getByRole("button", { name: "Cancel test", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("cancelled");
  await panel
    .getByRole("button", { name: "Close test print", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Test print", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("cancelled");
});
