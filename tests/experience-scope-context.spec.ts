import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset?shipments=multiple");
  const headers = { "x-drivemate-role": "partner" };
  const revision = await request.post("/api/prearrival/shipments/shipment-test-2/revisions", { headers, data: {
    schemaVersion: 3, shipmentId: "shipment-test-2", cartons: [
      { sourceCartonNumber: "10#", kind: "carton", physicalCartonCount: 1, memberCartonNumbers: ["10#"], sourcePalletNumber: "P#A", lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 2 }] },
      { sourceCartonNumber: "20#", kind: "carton", physicalCartonCount: 1, memberCartonNumbers: ["20#"], sourcePalletNumber: "P#B", lines: [{ sku: "DM-GWM-AF-002", expectedQuantity: 7 }] },
    ],
  } });
  expect(revision.ok()).toBeTruthy();
  const body = await revision.json();
  expect((await request.post(`/api/prearrival/revisions/${body.revision.id}/confirm`, { headers })).ok()).toBeTruthy();
});

test("canonical source selection survives reload and native workspace Back", async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: {
    authenticated: true, profile: { role: "partner", displayName: "QA Partner" },
  } }));
  await page.goto("/warehouse?shipmentId=shipment-test-2");
  await page.getByLabel("Source scope 20#", { exact: true }).check();
  await expect(page).toHaveURL(/cartonNumber=20%23/);
  await page.reload();
  await expect(page.getByLabel("Source scope 20#", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Source scope 10#", { exact: true })).not.toBeChecked();
  await page.getByRole("navigation", { name: "Workspace navigation", exact: true }).getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/partner$/);
  await page.goBack();
  await expect(page.getByLabel("Source scope 20#", { exact: true })).toBeChecked();
});

test("scope Back and Forward restore selections and shipment switching clears scope", async ({ page }) => {
  await page.goto("/warehouse?shipmentId=shipment-test-2");
  await page.getByLabel("Source scope 20#", { exact: true }).check();
  await page.getByRole("button", { name: "Full shipment", exact: true }).click();
  await expect(page).toHaveURL(/scope=all/);
  await page.goBack();
  await expect(page.getByLabel("Source scope 20#", { exact: true })).toBeChecked();
  await page.goForward();
  await expect(page).toHaveURL(/scope=all/);
  await page.getByLabel("Shipment", { exact: true }).selectOption("shipment-test-1");
  await expect(page).toHaveURL(/shipmentId=shipment-test-1/);
  expect(new URL(page.url()).searchParams.has("cartonNumber")).toBe(false);
  expect(new URL(page.url()).searchParams.getAll("palletNumber")).not.toContain("P#A");
  expect(new URL(page.url()).searchParams.has("scope")).toBe(false);
});

test("unknown scope is recoverable and cannot enable full shipment printing", async ({ page }) => {
  await page.goto("/warehouse?shipmentId=shipment-test-2&cartonNumber=UNKNOWN%23");
  await expect(page.getByText("The requested scope is not valid for this shipment. Choose a scope below to continue.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print labels", exact: true })).toBeDisabled();
  await page.getByLabel("Source scope 20#", { exact: true }).check();
  await expect(page).toHaveURL(/cartonNumber=20%23/);
  await expect(page.getByRole("button", { name: "Print labels", exact: true })).toBeEnabled();
});

test("canonical pallet URL survives reload", async ({ page }) => {
  await page.goto("/warehouse?shipmentId=shipment-test-2&palletNumber=P%23B");
  await expect(page.getByLabel("Pallet P#B", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Pallet P#A", { exact: true })).not.toBeChecked();
  await page.reload();
  await expect(page.getByLabel("Pallet P#B", { exact: true })).toBeChecked();
});

test("dirty scope Back cancels without losing receipt counts, then accepts and preserves Forward", async ({ page, request }) => {
  const headers = { "x-drivemate-role": "partner" };
  const created = await request.post("/api/warehouse/labels", { headers, data: { selection: { shipmentId: "shipment-test-2", cartonNumbers: ["10#"] }, templateId: "unit_product" } });
  expect(created.ok()).toBeTruthy();
  const { job } = await created.json();
  expect((await request.post(`/api/warehouse/labels/${job.id}`, { headers, data: { action: "outcome", outcome: "printed" } })).ok()).toBeTruthy();
  await page.goto("/warehouse?shipmentId=shipment-test-2");
  await page.getByRole("button", { name: "Full shipment", exact: true }).click();
  await page.getByLabel("Source scope 10#", { exact: true }).check();
  const scopeUrl = page.url();
  await page.getByRole("link", { name: "Receive stock", exact: true }).click();
  await page.getByRole("button", { name: "Counted quantity", exact: true }).click();
  await page.getByLabel("Scan product barcode", { exact: true }).fill("DMPGWMOF001");
  await page.getByLabel("Scan product barcode", { exact: true }).press("Enter");
  await page.getByLabel("Actual quantity for DM-GWM-OF-001", { exact: true }).fill("1");
  await page.goBack();
  await expect(page).toHaveURL(scopeUrl);
  let prompts = 0;
  page.once("dialog", async dialog => { prompts++; await dialog.dismiss(); });
  await page.evaluate(() => history.back());
  await expect.poll(() => prompts).toBe(1);
  await expect(page).toHaveURL(scopeUrl);
  await page.getByRole("link", { name: "Receive stock", exact: true }).click();
  await expect(page.getByLabel("Actual quantity for DM-GWM-OF-001", { exact: true })).toHaveValue("1");
  await page.goBack();
  page.once("dialog", async dialog => { prompts++; await dialog.accept(); });
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/scope=all/);
  await page.goForward();
  await expect(page).toHaveURL(scopeUrl);
  await expect(page.getByLabel("Source scope 10#", { exact: true })).toBeChecked();
  expect(prompts).toBe(2);
});
