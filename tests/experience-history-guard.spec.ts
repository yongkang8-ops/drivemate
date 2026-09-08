import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

const headers = { "x-drivemate-role": "partner" };

test("native Back restores list scroll position after session revalidation and asynchronous rows", async ({ page, request }) => {
  await request.post("/api/inventory/locations", { headers, data: { locationCodes: Array.from({ length: 45 }, (_, i) => `BNE-QA-SCROLL-${String(i).padStart(2, "0")}`) } });
  await page.route("**/api/auth/session", async route => {
    await new Promise(resolve => setTimeout(resolve, 120));
    await route.fulfill({ json: { authenticated: true, profile: { role: "admin", displayName: "QA admin" } } });
  });
  await page.goto("/inventory");
  await expect(page.getByRole("button", { name: "Edit BNE-QA-SCROLL-20", exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 1000, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(1000);
  await expect.poll(() => page.evaluate(() => history.state?.dmViewport?.y)).toBe(1000);
  const originalY = await page.evaluate(() => scrollY);
  expect(originalY).toBeGreaterThan(500);
  await page.goto("/partner");
  await expect(page.getByLabel("Find shipment, SKU or reference", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Edit BNE-QA-SCROLL-20", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(y => Math.abs(scrollY - y), originalY)).toBeLessThan(5);
});

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

async function createSecondConfirmedShipment(request: APIRequestContext) {
  await request.post("/api/test/reset?shipments=multiple");
  const created = await request.post("/api/prearrival/shipments/shipment-test-2/revisions", {
    headers,
    data: {
      schemaVersion: 3,
      shipmentId: "shipment-test-2",
      cartons: [{
        sourceCartonNumber: "QA-B",
        kind: "carton",
        physicalCartonCount: 1,
        memberCartonNumbers: ["QA-B"],
        sourcePalletNumber: null,
        lines: [{ sku: "DM-GWM-AF-002", expectedQuantity: 7 }],
      }],
    },
  });
  expect(created.ok()).toBeTruthy();
  const body = await created.json();
  expect((await request.post(`/api/prearrival/revisions/${body.revision.id}/confirm`, { headers })).ok()).toBeTruthy();
}

async function makeWarehouseReceiptDirty(page: Page, request: APIRequestContext) {
  const created = await request.post("/api/warehouse/labels", {
    headers,
    data: { selection: { shipmentId: "shipment-test-1", cartonNumbers: ["C001"] }, templateId: "unit_product" },
  });
  expect(created.status()).toBe(201);
  const { job } = await created.json();
  expect((await request.post(`/api/warehouse/labels/${job.id}`, {
    headers,
    data: { action: "outcome", outcome: "printed" },
  })).ok()).toBeTruthy();
  await page.goto("/partner");
  await page.getByRole("navigation", { name: "Partner operations navigation", exact: true })
    .getByRole("link", { name: "Inbound operations", exact: true }).click();
  await expect(page.getByLabel("Shipment", { exact: true })).toBeVisible();
  if (await page.getByLabel("Shipment", { exact: true }).inputValue() !== "shipment-test-1") {
    await page.getByLabel("Shipment", { exact: true }).selectOption("shipment-test-1");
  }
  await expect(page).toHaveURL(/\/warehouse\?shipmentId=shipment-test-1$/);
  await page.getByRole("link", { name: "Receive stock", exact: true }).click();
  await page.getByRole("button", { name: "Counted quantity", exact: true }).click();
  await page.getByLabel("Scan product barcode", { exact: true }).fill("DMPGWMOF001");
  await page.getByLabel("Scan product barcode", { exact: true }).press("Enter");
  await page.getByLabel("Actual quantity for DM-GWM-OF-001", { exact: true }).fill("1");
}

test("cancelled cross-route Back keeps the dirty warehouse URL and draft, then accepted Back navigates once", async ({ page, request }) => {
  await makeWarehouseReceiptDirty(page, request);
  const originalUrl = page.url();
  let prompts = 0;
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/warehouse\?shipmentId=shipment-test-1$/);
  expect(prompts).toBe(0);
  await page.goForward();
  await expect(page).toHaveURL(originalUrl);
  await expect(page.getByLabel("Actual quantity for DM-GWM-OF-001", { exact: true })).toHaveValue("1");

  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/warehouse\?shipmentId=shipment-test-1$/);
  page.once("dialog", async (dialog) => {
    prompts += 1;
    await dialog.dismiss();
  });
  await page.evaluate(() => history.back());
  await expect.poll(() => prompts).toBe(1);
  await expect(page).toHaveURL(/\/warehouse\?shipmentId=shipment-test-1$/);
  expect(prompts).toBe(1);

  page.once("dialog", async (dialog) => {
    prompts += 1;
    await dialog.accept();
  });
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/partner$/);
  expect(prompts).toBe(2);
});

test("warehouse initial shipment and subsequent selection restore correctly through Back and Forward", async ({ page, request }) => {
  await createSecondConfirmedShipment(request);
  await page.goto("/warehouse");
  await expect(page.getByLabel("Shipment", { exact: true })).toHaveValue("shipment-test-2");
  await expect(page).toHaveURL(/shipmentId=shipment-test-2/);

  await page.evaluate(() => {
    history.replaceState({ ...history.state, __NA: true, qaNextField: "preserved" }, "", location.href);
  });
  await page.getByLabel("Shipment", { exact: true }).selectOption("shipment-test-1");
  await expect(page).toHaveURL(/shipmentId=shipment-test-1/);
  expect(await page.evaluate(() => history.state.qaNextField)).toBe("preserved");

  await page.goBack();
  await expect(page).toHaveURL(/shipmentId=shipment-test-2/);
  await expect(page.getByLabel("Shipment", { exact: true })).toHaveValue("shipment-test-2");
  expect(await page.evaluate(() => history.state.qaNextField)).toBe("preserved");

  await page.goForward();
  await expect(page).toHaveURL(/shipmentId=shipment-test-1/);
  await expect(page.getByLabel("Shipment", { exact: true })).toHaveValue("shipment-test-1");
  expect(await page.evaluate(() => history.state.qaNextField)).toBe("preserved");
});

test("clean browser history navigation does not prompt or duplicate traversal", async ({ page }) => {
  let prompts = 0;
  page.on("dialog", async (dialog) => {
    prompts += 1;
    await dialog.dismiss();
  });
  await page.goto("/partner");
  await page.getByRole("navigation", { name: "Partner operations navigation", exact: true })
    .getByRole("link", { name: "Inventory & locations", exact: true }).click();
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.getByRole("heading", { name: "Location management", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/partner$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/inventory$/);
  expect(prompts).toBe(0);
});

  test("dirty native Forward cancels without losing input and then accepts once", async ({ page }) => {
    await page.goto("/partner");
    await page.getByRole("navigation", { name: "Partner operations navigation", exact: true }).getByRole("link", { name: "Inventory & locations", exact: true }).click();
    await expect(page.getByLabel("Location code batch")).toBeVisible();
    await page.getByRole("navigation", { name: "Partner operations navigation", exact: true }).getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page).toHaveURL(/\/partner$/);
    await page.goBack();
    await expect(page.getByLabel("Location code batch")).toBeVisible();
    await page.getByLabel("Location code batch").fill("BNE-A01-03");
    let prompts = 0;
    page.once("dialog", async dialog => { prompts++; await dialog.dismiss(); });
    await page.evaluate(() => history.forward());
    await expect.poll(() => prompts).toBe(1);
    await expect(page).toHaveURL(/\/inventory$/);
    await expect(page.getByLabel("Location code batch")).toHaveValue("BNE-A01-03");
    page.once("dialog", async dialog => { prompts++; await dialog.accept(); });
    await page.evaluate(() => history.forward());
    await expect(page).toHaveURL(/\/partner$/);
    expect(prompts).toBe(2);
  });

test("multiple mounted dirty editors produce one prompt and preserve both drafts on cancel", async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "admin", displayName: "QA Administrator" } } }));
  await page.goto("/partner");
  await page.getByRole("navigation", { name: "Partner operations navigation", exact: true }).getByRole("link", { name: "Administration", exact: true }).click();
  const modules = page.getByRole("navigation", { name: "Admin modules" });
  await modules.getByRole("link", { name: "Products & fitment", exact: true }).click();
  await page.getByLabel("New SKU", { exact: true }).fill("QA-UNSAVED");
  await modules.getByRole("link", { name: "Purchasing", exact: true }).click();
  await page.getByLabel("Authoritative PI (.xlsx)").setInputFiles({ name: "draft.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("unsaved selection") });
  let prompts = 0;
  page.once("dialog", async dialog => { prompts++; await dialog.dismiss(); });
  await page.evaluate(() => history.go(-3));
  await expect.poll(() => prompts).toBe(1);
  await expect(page).toHaveURL(/\/admin#purchasing$/);
  expect(await page.getByLabel("Authoritative PI (.xlsx)").evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe("draft.xlsx");
  await modules.getByRole("link", { name: "Products & fitment", exact: true }).click();
  await expect(page.getByLabel("New SKU", { exact: true })).toHaveValue("QA-UNSAVED");
  expect(prompts).toBe(1);
});

test("dirty refresh and native link each warn only once and cancel retains the draft", async ({ page }) => {
  await page.goto("/inventory");
  await page.getByLabel("Location code batch").fill("BNE-A01-03");
  let prompts = 0;
  page.on("dialog", async dialog => { expect(dialog.type()).toBe("beforeunload"); prompts++; await dialog.dismiss(); });
  await page.evaluate(() => location.reload());
  await expect.poll(() => prompts).toBe(1);
  await expect(page.getByLabel("Location code batch")).toHaveValue("BNE-A01-03");
  await page.getByRole("navigation", { name: "Partner operations navigation", exact: true }).getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect.poll(() => prompts).toBe(2);
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.getByLabel("Location code batch")).toHaveValue("BNE-A01-03");
});

test("dirty shipment Back cancels at the original history position, accepts, then Forward restores shipment", async ({ page, request }) => {
  await createSecondConfirmedShipment(request);
  await makeWarehouseReceiptDirty(page, request);
  await page.goBack();
  await expect(page).toHaveURL(/\/warehouse\?shipmentId=shipment-test-1$/);
  let prompts = 0;
  page.once("dialog", async dialog => { prompts++; await dialog.dismiss(); });
  await page.evaluate(() => history.back());
  await expect.poll(() => prompts).toBe(1);
  await expect(page).toHaveURL(/\/warehouse\?shipmentId=shipment-test-1$/);
  await expect(page.getByLabel("Shipment", { exact: true })).toHaveValue("shipment-test-1");
  await page.getByRole("link", { name: "Receive stock", exact: true }).click();
  await expect(page.getByLabel("Actual quantity for DM-GWM-OF-001", { exact: true })).toHaveValue("1");
  await page.goBack();
  page.once("dialog", async dialog => { prompts++; await dialog.accept(); });
  await page.evaluate(() => history.back());
  await expect(page.getByLabel("Shipment", { exact: true })).toHaveValue("shipment-test-2");
  await expect(page).toHaveURL(/shipmentId=shipment-test-2$/);
  await page.goForward();
  await expect(page.getByLabel("Shipment", { exact: true })).toHaveValue("shipment-test-1");
  await expect(page).toHaveURL(/shipmentId=shipment-test-1$/);
  expect(prompts).toBe(2);
});
