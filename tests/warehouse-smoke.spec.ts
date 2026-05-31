import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("warehouse receiving and dispatch update browser inventory state", async ({ page }) => {
  await page.goto("/warehouse");
  await expect(page.getByRole("status")).toContainText("Warehouse state loaded");

  await page.getByLabel("Receive quantity").fill("5");
  await page.getByLabel("Scan SKU / barcode").first().fill("DMPGWMOF001");
  await page.getByLabel("Scan SKU / barcode").first().press("Enter");

  await expect(page.getByRole("status")).toContainText("received into");
  await expect(page.getByRole("row", { name: /DM-GWM-OF-001\s+Inbound\s+5/ })).toBeVisible();

  await page.getByLabel("Move quantity").fill("1");
  await page.getByLabel("Scan putaway SKU").fill("DMPGWMOF001");
  await page.getByLabel("Scan putaway SKU").press("Enter");

  await expect(page.getByRole("status")).toContainText("moved to");
  await expect(page.getByRole("row", { name: /DM-GWM-OF-001\s+Putaway\s+1/ })).toBeVisible();

  await page.getByLabel("Dispatch quantity").fill("1");
  await page.getByLabel("Scan SKU / barcode").nth(1).fill("DMPGWMOF001");
  await page.getByLabel("Scan SKU / barcode").nth(1).press("Enter");

  await expect(page.getByRole("status")).toContainText("dispatched for");
  await expect(page.getByRole("row", { name: /DM-GWM-OF-001\s+Dispatch\s+1/ })).toBeVisible();

  await page.getByLabel("Return quantity").fill("2");
  await page.getByLabel("Scan returned SKU").fill("OF-GWM-001");
  await page.getByLabel("Scan returned SKU").press("Enter");

  await expect(page.getByRole("status")).toContainText("recorded as Quarantine");
  await expect(page.getByRole("row", { name: /DM-GWM-OF-001\s+Quarantine\s+2/ })).toBeVisible();

  await page.getByLabel("Adjustment quantity").fill("1");
  await page.getByLabel("Scan adjustment SKU").fill("DMPGWMOF001");
  await page.getByLabel("Scan adjustment SKU").press("Enter");

  await expect(page.getByRole("status")).toContainText("adjusted at");
  await expect(page.getByRole("row", { name: /DM-GWM-OF-001\s+Adjustment\s+1/ })).toBeVisible();
});
