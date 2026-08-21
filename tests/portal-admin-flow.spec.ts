import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("trade portal submits an order and admin can see operating state", async ({
  page,
}) => {
  await page.goto("/portal");

  await page.getByRole("button", { name: "Search matching parts" }).click();
  await expect(page.getByRole("status")).toContainText("matching parts found");
  await expect(page.getByRole("row", { name: /DM-GWM-OF-001/ })).toBeVisible();

  await page.getByRole("button", { name: "Add" }).first().click();
  await expect(page.getByRole("status")).toContainText("added to order pad");
  await expect(
    page.getByRole("row", {
      name: /DM-GWM-OF-001\s+Genuine Engine Oil Filter\s+1/,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Submit order" }).click();
  await expect(page.getByRole("status")).toContainText(
    /Order SO-\d+ submitted/,
  );
  await expect(
    page.getByRole("row", {
      name: /SO-\d+\s+submitted\s+JOB-1842\s+DM-GWM-OF-001 x 1/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /order confirmation\s+OC-SO-\d+/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Open OC-SO-\d+/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /statement\s+STMT-\d{4}-\d{2}-acct-demo/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Open STMT-\d{4}-\d{2}-acct-demo/ }),
  ).toBeVisible();

  await page.goto("/admin");
  await page.getByRole("button", { name: "Refresh admin state" }).click();
  await expect(page.getByText("Operating state refreshed.")).toBeVisible();
  await expect(
    page.getByRole("row", {
      name: /DM-GWM-OF-001\s+GWM Cannon Alpha 2024-on\s+GW4D24/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /BNE-2026-06-PILOT\s+DM-GWM-OF-001/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", {
      name: /PRICE-GWM-SERVICE-FILTERS\s+DM-GWM-OF-001/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /RFQ-GWM-ALPHA-FUEL-FILTER\s+GWM/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /demo-admin-user\s+admin/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", {
      name: /SO-\d+\s+submitted\s+JOB-1842\s+1\s+.*demo-trade-user/,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).first().click();
  await page
    .getByRole("textbox", { name: "Barcode", exact: true })
    .fill("DMP-GWM-OF-001-UI");
  await page
    .getByRole("textbox", { name: "OEM part number", exact: true })
    .fill("GWM-OEM-OF-UI");
  await page.getByRole("button", { name: "Save SKU master" }).click();
  await expect(
    page.getByText("DM-GWM-OF-001 master data saved."),
  ).toBeVisible();
  await expect(
    page.getByRole("row", {
      name: /DM-GWM-OF-001\s+DMP-GWM-OF-001-UI\s+GWM-OEM-OF-UI/,
    }),
  ).toBeVisible();

  await page
    .getByRole("textbox", { name: "New SKU", exact: true })
    .fill("DM-GWM-UI-099");
  await page.getByLabel("New brand").selectOption("GWM");
  await page.getByLabel("New part name").fill("UI Test Service Part");
  await page.getByLabel("New category").fill("Service Filter");
  await page.getByLabel("New barcode").fill("DMPGWMUI099");
  await page.getByLabel("New OEM part number").fill("GWM-OEM-UI-099");
  await page.getByLabel("New SKU status").selectOption("active");
  await page.getByRole("button", { name: "Create SKU master" }).click();
  await expect(
    page.getByText("DM-GWM-UI-099 master data created."),
  ).toBeVisible();
  await expect(
    page.getByRole("row", {
      name: /DM-GWM-UI-099\s+DMPGWMUI099\s+GWM-OEM-UI-099/,
    }),
  ).toBeVisible();

  await page.getByLabel("Fitment SKU").selectOption("DM-GWM-UI-099");
  await page.getByRole("textbox", { name: "Make", exact: true }).fill("GWM");
  await page
    .getByRole("textbox", { name: "Model", exact: true })
    .fill("Cannon Alpha");
  await page.getByLabel("Year from").fill("2024");
  await page
    .getByRole("textbox", { name: "Engine", exact: true })
    .fill("GW4D24");
  await page.getByLabel("Fitment confidence").selectOption("confirm_vin");
  await page.getByRole("button", { name: "Create fitment rule" }).click();
  await expect(
    page.getByText("DM-GWM-UI-099 fitment rule created."),
  ).toBeVisible();
  await expect(
    page.getByRole("row", {
      name: /DM-GWM-UI-099\s+GWM Cannon Alpha 2024-on\s+GW4D24/,
    }),
  ).toBeVisible();

  await page.goto("/warehouse");
  await expect(page.getByText("Warehouse state loaded.")).toBeVisible();
  await page.getByLabel("Scan SKU / barcode").first().fill("DMPGWMUI099");
  await page.getByRole("button", { name: "Receive stock" }).click();
  await expect(
    page.getByText(/DM-GWM-UI-099 received into BNE receiving/),
  ).toBeVisible();
  await expect(
    page.getByRole("row", {
      name: /DM-GWM-UI-099\s+Inbound\s+5\s+BNE-2026-06-GWM-01\s+BNE receiving/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", {
      name: /SO-\d+\s+submitted\s+JOB-1842\s+DM-GWM-OF-001 x 1\s+demo-trade-user/,
    }),
  ).toBeVisible();
  await page
    .getByPlaceholder("One scanned SKU per line, e.g. DMPGWMOF001 x 1")
    .fill("DM-GWM-OF-001 x 1");
  await page.getByLabel("Charge ex GST").fill("12.00");
  await page.getByLabel("Carrier").fill("Test Courier");
  await page.getByLabel("Tracking").fill("TRACK-UI-001");
  await page.getByRole("button", { name: "Confirm dispatch" }).click();
  await expect(page.getByText(/Order SO-\d+ dispatched/)).toBeVisible();

  await page.goto("/portal");
  await page.getByRole("button", { name: "Search matching parts" }).click();
  await expect(
    page.getByRole("row", {
      name: /DM-GWM-UI-099\s+GWM\s+UI Test Service Part\s+confirm_vin\s+5/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /delivery record\s+DEL-SO-\d+/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /invoice\s+INV-SO-\d+/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Open DEL-SO-\d+/ }),
  ).toBeVisible();

  await page.goto("/admin");
  await page.getByRole("button", { name: "Refresh admin state" }).click();
  await expect(
    page.getByRole("row", {
      name: /SO-\d+\s+dispatched\s+JOB-1842\s+1\s+.*demo-trade-user/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", {
      name: /DM-GWM-UI-099\s+Inbound\s+5\s+BNE receiving\s+BNE-2026-06-GWM-01/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", {
      name: /DM-GWM-OF-001\s+Dispatch\s+1\s+BNE dispatch\s+SO-\d+.*demo-warehouse-user/,
    }),
  ).toBeVisible();
});
