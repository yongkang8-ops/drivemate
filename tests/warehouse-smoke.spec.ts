import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("warehouse receiving and dispatch update browser inventory state", async ({
  page,
}) => {
  await page.goto("/warehouse");
  await expect(page.getByText("Warehouse state loaded.")).toBeVisible();

  await page.getByLabel("Receive quantity").fill("5");
  await page.getByLabel("Scan SKU / barcode").first().fill("DMPGWMOF001");
  await page.getByLabel("Scan SKU / barcode").first().press("Enter");

  await expect(page.getByText(/received into/)).toBeVisible();
  await expect(
    page.getByRole("row", { name: /DM-GWM-OF-001\s+Inbound\s+5/ }),
  ).toBeVisible();

  await page.getByLabel("Move quantity").fill("1");
  await page.getByLabel("Scan putaway SKU").fill("DMPGWMOF001");
  await page.getByLabel("Scan putaway SKU").press("Enter");

  await expect(page.getByText(/moved to/)).toBeVisible();
  await expect(
    page.getByRole("row", { name: /DM-GWM-OF-001\s+Putaway\s+1/ }),
  ).toBeVisible();

  await page.getByLabel("Dispatch quantity").fill("1");
  await page.getByLabel("Scan SKU / barcode").nth(1).fill("DMPGWMOF001");
  await page.getByLabel("Scan SKU / barcode").nth(1).press("Enter");

  await expect(page.getByText(/dispatched for/)).toBeVisible();
  await expect(
    page.getByRole("row", { name: /DM-GWM-OF-001\s+Dispatch\s+1/ }),
  ).toBeVisible();

  await page.getByLabel("Return quantity").fill("2");
  await page.getByLabel("Scan returned SKU").fill("OF-GWM-001");
  await page.getByLabel("Scan returned SKU").press("Enter");

  await expect(page.getByText(/recorded as Quarantine/)).toBeVisible();
  await expect(
    page.getByRole("row", { name: /DM-GWM-OF-001\s+Quarantine\s+2/ }),
  ).toBeVisible();

  await page.getByLabel("Adjustment quantity").fill("1");
  await page.getByLabel("Scan adjustment SKU").fill("DMPGWMOF001");
  await page.getByLabel("Scan adjustment SKU").press("Enter");

  await expect(page.getByText(/adjusted at/)).toBeVisible();
  await expect(
    page.getByRole("row", { name: /DM-GWM-OF-001\s+Adjustment\s+1/ }),
  ).toBeVisible();
});
