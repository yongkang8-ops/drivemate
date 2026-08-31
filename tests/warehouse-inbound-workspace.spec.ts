import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("Warehouse routes an unconfirmed shipment back to Packing List setup", async ({
  page,
  request,
}) => {
  await request.post("/api/test/reset?packingList=empty");
  await page.goto("/warehouse");

  await expect(
    page.getByRole("heading", { name: "Packing List confirmation required" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Pre-arrival" })).toHaveAttribute(
    "href",
    "/prearrival?shipmentId=shipment-test-1",
  );
  await expect(page.getByRole("button", { name: "Print labels" })).toHaveCount(0);
  await expect(page.getByText("Pre-arrival shipment was not found.")).toHaveCount(0);
});

async function confirmReceipt(page: Page) {
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Preview labels" }).click();
  await page.getByRole("button", { name: "Print labels" }).click();
  await page.getByRole("button", { name: "Confirm printed" }).click();
  await page.getByRole("link", { name: "Receive stock" }).click();
  await page.getByRole("button", { name: "Counted quantity" }).click();

  await page.getByLabel("Scan product barcode").fill("DMPGWMOF001");
  await page.getByLabel("Scan product barcode").press("Enter");
  await page.getByLabel("Actual quantity for DM-GWM-OF-001").fill("12");
  await page.getByRole("button", { name: "Add receipt line" }).click();
  await page.getByLabel("Scan product barcode").fill("DMPGWMAF002");
  await page.getByLabel("Scan product barcode").press("Enter");
  await page.getByLabel("Actual quantity for DM-GWM-AF-002").fill("6");
  await page.getByRole("button", { name: "Add receipt line" }).click();
  await page.getByRole("button", { name: "Confirm receipt" }).click();
  await expect(page.getByText("Receipt confirmed. Actual quantities are recorded in system staging.")).toBeVisible();
}

async function createActiveDestination(request: APIRequestContext) {
  const response = await request.post("/api/inventory/locations", {
    headers: { "x-drivemate-role": "partner" },
    data: { locationCodes: ["BNE-A01-03"] },
  });
  expect(response.status()).toBe(201);
}

test("confirmed receipt unlocks scan-led putaway from the system staging location", async ({ page, request }) => {
  await createActiveDestination(request);
  await page.goto("/warehouse");
  await expect(page.getByRole("link", { name: "Put away" })).toHaveAttribute("aria-disabled", "true");

  await confirmReceipt(page);

  await expect(page.getByRole("link", { name: "Put away" })).not.toHaveAttribute("aria-disabled", "true");
  await page.getByRole("link", { name: "Put away" }).click();
  await expect(page.getByRole("heading", { name: "Put away" })).toBeVisible();
  await expect(page.getByText("BNE-RECEIVING-STAGING", { exact: true })).toBeVisible();

  await page.getByLabel("Scan product barcode").fill("DMPGWMOF001");
  await page.getByLabel("Scan destination location").fill("DMLOC:BNE-A01-03");
  await page.getByLabel("Move quantity").fill("2");
  await page.getByRole("button", { name: "Confirm put away" }).click();

  await expect(page.getByText("Moved 2 units from BNE-RECEIVING-STAGING to BNE-A01-03.")).toBeVisible();
  await expect(page.getByText("The system moves 2 units from internal staging to BNE-A01-03 and records an inventory movement.")).toBeVisible();
});

test("putaway keeps confirmation disabled until the scanned DMLOC is a saved active physical destination", async ({ page }) => {
  await confirmReceipt(page);
  await page.getByRole("link", { name: "Put away" }).click();

  await page.getByLabel("Scan product barcode").fill("DMPGWMOF001");
  await page.getByLabel("Scan destination location").fill("DMLOC:BNE-Z99-01");

  await expect(page.getByText("Scanned destination is not an active physical putaway location.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm put away" })).toBeDisabled();
});
