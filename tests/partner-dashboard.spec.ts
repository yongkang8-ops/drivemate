import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("partners can review the saved inbound operation snapshot in either display timezone", async ({ page }) => {
  await page.goto("/partner");

  await expect(page.getByRole("heading", { name: "Inbound pipeline command board" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inbound shipment board" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attention queue" })).toBeVisible();
  await expect(page.getByText("Label print confirmation required")).toBeVisible();
  await expect(page.getByText("Prepare labels", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Display timezone")).toHaveValue("Australia/Brisbane");

  await page.getByLabel("Display timezone").selectOption("Asia/Shanghai");
  await expect(page.getByText("China Standard Time", { exact: true })).toBeVisible();
});

test("the dashboard reflects a label-confirmed receipt that remains in system staging", async ({ page }) => {
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

  await page.goto("/partner");
  await expect(page.getByText("In staging", { exact: true })).toBeVisible();
  const operationStatus = page.getByLabel("Operation status for BNE-TEST-001");
  await expect(operationStatus.getByText("Receipt confirmed", { exact: true })).toBeVisible();
  await expect(operationStatus.getByText("Putaway pending", { exact: true })).toBeVisible();
  await expect(page.locator(".partner-metric-grid article").nth(2).getByText("18", { exact: true })).toBeVisible();
});

test("an unconfirmed Packing List stays visible but blocked before label preparation", async ({
  page,
  request,
}) => {
  await request.post("/api/test/reset?packingList=empty");
  await page.goto("/partner");

  await expect(page.getByText("Packing List required", { exact: true })).toBeVisible();
  await expect(page.getByText("Packing List not confirmed", { exact: true })).toBeVisible();
  await expect(page.getByText("Labels blocked", { exact: true })).toBeVisible();
  await expect(page.getByText("Receipt blocked", { exact: true })).toBeVisible();
  await expect(page.getByText("Putaway blocked", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open pre-arrival", exact: true })).toHaveAttribute(
    "href",
    "/prearrival?shipmentId=shipment-test-1",
  );
  await expect(page.getByText("Prepare labels", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/ready for label preparation/i)).toHaveCount(0);
  await expect(page.locator(".partner-metric-grid article").nth(0).getByText("0", { exact: true })).toBeVisible();
  await expect(page.locator(".partner-metric-grid article").nth(1).getByText("0", { exact: true })).toBeVisible();
});
