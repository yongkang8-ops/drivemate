import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("an operator prints the selected pallet labels and unlocks receipt only after confirming the physical outcome", async ({ page }) => {
  await page.goto("/warehouse");

  await page.getByLabel("Shipment").selectOption("shipment-test-1");
  await page.getByLabel("Pallet P001").check();
  await page.getByRole("button", { name: "Preview labels" }).click();
  await expect(page.getByText("DM-GWM-OF-001", { exact: true })).toBeVisible();
  await expect(page.getByText("18 labels")).toBeVisible();

  await page.getByRole("button", { name: "Print labels" }).click();
  await expect(page.getByText("Awaiting physical confirmation")).toBeVisible();
  await page.getByRole("button", { name: "Confirm printed" }).click();

  await expect(page.getByText("Receipt unlocked", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Receive stock" }).click();
  await expect(page.getByRole("heading", { name: "Receive stock" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm receipt" })).toBeDisabled();
});

test("a cancelled print task leaves receipt locked for the selected scope", async ({ page }) => {
  await page.goto("/warehouse");

  await page.getByLabel("Pallet P001").check();
  await page.getByRole("button", { name: "Preview labels" }).click();
  await page.getByRole("button", { name: "Print labels" }).click();
  await page.getByRole("button", { name: "Cancel print" }).click();

  await expect(page.getByText("Receipt locked")).toBeVisible();
  await expect(page.getByRole("link", { name: "Receive stock" })).toHaveAttribute("aria-disabled", "true");
});

test("a confirmed print unlocks counted-quantity receipt into the system staging location", async ({ page }) => {
  await page.goto("/warehouse");

  await page.getByRole("button", { name: "Preview labels" }).click();
  await page.getByRole("button", { name: "Print labels" }).click();
  await page.getByRole("button", { name: "Confirm printed" }).click();
  await page.getByRole("link", { name: "Receive stock" }).click();
  await page.getByRole("button", { name: "Counted quantity" }).click();

  await page.getByLabel("Scan product barcode").fill("DMPGWMOF001");
  await page.getByLabel("Scan product barcode").press("Enter");
  await page.getByLabel("Actual quantity for DM-GWM-OF-001").fill("11");
  await expect(page.getByRole("button", { name: "Add receipt line" })).toBeDisabled();
  await page.getByLabel("Difference reason for DM-GWM-OF-001").fill("Supplier short packed one unit.");
  await expect(page.getByRole("button", { name: "Add receipt line" })).toBeEnabled();
  await page.getByRole("button", { name: "Add receipt line" }).click();

  await page.getByLabel("Scan product barcode").fill("DMPGWMAF002");
  await page.getByLabel("Scan product barcode").press("Enter");
  await page.getByLabel("Actual quantity for DM-GWM-AF-002").fill("6");
  await page.getByRole("button", { name: "Add receipt line" }).click();

  await expect(page.getByRole("button", { name: "Confirm receipt" })).toBeEnabled();
  await page.getByRole("button", { name: "Confirm receipt" }).click();
  await expect(page.getByText("Receipt confirmed. Actual quantities are recorded in system staging.")).toBeVisible();
  await expect(page.getByText("BNE-RECEIVING-STAGING", { exact: true })).toHaveCount(1);
});
