import { expect, test } from "@playwright/test";

const partnerHeaders = { "x-drivemate-role": "partner" };

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("test fixture exposes an existing shipment before its first packing list", async ({
  request,
}) => {
  const reset = await request.post("/api/test/reset?packingList=empty");
  expect(reset.ok()).toBeTruthy();

  const list = await request.get("/api/prearrival/shipments", {
    headers: partnerHeaders,
  });
  await expect(list.json()).resolves.toMatchObject({
    ok: true,
    shipments: [
      expect.objectContaining({
        shipmentId: "shipment-test-1",
        packingListStatus: "not_started",
      }),
    ],
  });

  const secondShipment = await request.get(
    "/api/prearrival/shipments?shipmentId=shipment-test-2",
    { headers: partnerHeaders },
  );
  expect(secondShipment.status()).toBe(404);
});

test("opens the shipment requested in the query when the list order differs", async ({
  page,
  request,
}) => {
  const reset = await request.post("/api/test/reset?shipments=multiple");
  expect(reset.ok()).toBeTruthy();

  const list = await request.get("/api/prearrival/shipments", {
    headers: partnerHeaders,
  });
  await expect(list.json()).resolves.toMatchObject({
    ok: true,
    shipments: [
      expect.objectContaining({
        shipmentId: "shipment-test-2",
        shipmentReference: "TEST-FIXTURE-002",
      }),
      expect.objectContaining({ shipmentId: "shipment-test-1" }),
    ],
  });

  await page.goto("/prearrival?shipmentId=shipment-test-1");

  await expect(page.getByLabel("Shipment")).toHaveValue("shipment-test-1");
  await expect(page.locator(".prearrival-shipment-bar strong")).toHaveText("BNE-TEST-001");
});

test("Partner initializes the first packing list and unlocks the Warehouse label queue", async ({
  page,
  request,
}) => {
  await request.post("/api/test/reset?packingList=empty");
  await page.goto("/prearrival");

  await expect(
    page.getByRole("heading", { name: "Packing List setup required" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Prepare AU labels" })).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByText("No SKU lines are available until a working copy is opened.")).toBeVisible();

  await page.getByRole("button", { name: "Create first Packing List" }).click();
  await page.getByLabel("Pallet number").fill("P001");
  await page.getByLabel("Carton number").fill("C001");
  await page.getByLabel("SKU", { exact: true }).fill("DM-GWM-OF-001");
  await page.getByLabel("Expected quantity", { exact: true }).fill("12");

  await page.getByRole("button", { name: "Add SKU line" }).click();
  await expect(page.getByRole("button", { name: "Remove SKU line 2" })).toBeVisible();
  await page.getByLabel("SKU 2").fill("DM-GWM-AF-002");
  await page.getByLabel("Expected quantity 2").fill("6");

  await page.getByRole("button", { name: "Add carton" }).click();
  await page.getByLabel("Carton number").fill("C002");
  await page.getByLabel("SKU", { exact: true }).fill("DM-GWM-OF-001");
  await page.getByLabel("Expected quantity", { exact: true }).fill("24");

  await page.getByRole("button", { name: "Add pallet" }).click();
  await page.getByLabel("Pallet number").fill("P002");
  await page.getByLabel("Carton number").fill("C003");
  await page.getByLabel("SKU", { exact: true }).fill("DM-GWM-AF-002");
  await page.getByLabel("Expected quantity", { exact: true }).fill("10");

  await page.getByRole("button", { name: "Confirm Packing List" }).click();
  await expect(page.getByText("Packing List v1 confirmed")).toBeVisible();
  await expect(page.getByRole("link", { name: "Prepare AU labels" })).toBeVisible();
  const tableOverflow = await page.locator(".prearrival-table-shell").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(tableOverflow.scrollWidth).toBeLessThanOrEqual(tableOverflow.clientWidth);

  await page.getByRole("link", { name: "Prepare AU labels" }).click();
  await expect(page.getByRole("heading", { name: "Label print" })).toBeVisible();
  await expect(page.getByText("42 expected units")).toBeVisible();
});

test("first Packing List validation stays local and cancel clears errors", async ({
  page,
  request,
}) => {
  const reset = await request.post("/api/test/reset?packingList=empty");
  expect(reset.ok()).toBeTruthy();

  let revisionPostCount = 0;
  page.on("request", (pendingRequest) => {
    if (
      pendingRequest.method() === "POST"
      && /\/api\/prearrival\/shipments\/[^/]+\/revisions$/.test(
        new URL(pendingRequest.url()).pathname,
      )
    ) {
      revisionPostCount += 1;
    }
  });

  await page.goto("/prearrival");
  await page.getByRole("button", { name: "Create first Packing List" }).click();
  await page.getByRole("button", { name: "Confirm Packing List" }).click();

  const errorSummary = page.locator('.prearrival-error-summary[role="alert"]');
  await expect(errorSummary).toHaveText(
    "Complete the highlighted Packing List fields before confirming.",
  );
  await expect(page.getByText("Enter the pallet number.", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter the carton number.", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter a recognised SKU.", { exact: true })).toBeVisible();
  expect(revisionPostCount).toBe(0);

  await page.getByLabel("Pallet number").fill("P001");
  await expect(page.getByText("Enter the pallet number.", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Cancel working copy" }).click();
  await expect(errorSummary).toHaveCount(0);
  await expect(
    page.getByText("Packing-list revision could not be created.", { exact: true }),
  ).toHaveCount(0);
});

test("operations copy does not describe saved records as sample data", async ({ page }) => {
  await page.goto("/prearrival");
  await expect(page.getByRole("heading", { name: "Pre-arrival shipments" })).toBeVisible();
  await expect(page.getByText("Sample data only", { exact: true })).toHaveCount(0);

  await page.goto("/warehouse");
  await expect(page.getByRole("heading", { name: "Inbound operations" })).toBeVisible();
  await expect(page.getByText("Sample data only", { exact: true })).toHaveCount(0);
});

test("Partner creates and confirms a pre-arrival packing-list revision", async ({
  page,
}) => {
  await page.goto("/prearrival");

  await expect(page.getByRole("heading", { name: "Pre-arrival shipments" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Packing structure" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Carton C001 expected contents/ })).toBeVisible();
  await expect(page.getByText("v1 confirmed")).toBeVisible();

  await page.getByRole("button", { name: "Create revision" }).click();
  await page.getByLabel("Pallet number").fill("P001");
  await page.getByLabel("Carton number").fill("C001");
  await page.getByLabel("SKU", { exact: true }).fill("DM-GWM-OF-001");
  await page.getByLabel("Expected quantity", { exact: true }).fill("13");
  await page.getByRole("button", { name: "Confirm packing list" }).click();

  await expect(page.getByText("Packing list v2 confirmed")).toBeVisible();
  await expect(page.getByText("13 Ready")).toBeVisible();
  await expect(page.getByRole("link", { name: "Prepare AU labels" })).toHaveAttribute(
    "href",
    /\/warehouse\?shipmentId=shipment-test-1/,
  );
});

test("pre-arrival APIs require Partner access and retain a confirmed revision", async ({
  request,
}) => {
  const publicRead = await request.get("/api/prearrival/shipments");
  expect(publicRead.status()).toBe(403);

  const list = await request.get("/api/prearrival/shipments", {
    headers: partnerHeaders,
  });
  expect(list.ok()).toBeTruthy();
  await expect(list.json()).resolves.toMatchObject({
    ok: true,
    shipments: [expect.objectContaining({ shipmentId: "shipment-test-1" })],
  });

  const create = await request.post(
    "/api/prearrival/shipments/shipment-test-1/revisions",
    {
      headers: partnerHeaders,
      data: {
        shipmentId: "shipment-test-1",
        pallets: [
          {
            sourcePalletNumber: "P001",
            cartons: [
              {
                sourceCartonNumber: "C001",
                lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 13 }],
              },
            ],
          },
        ],
      },
    },
  );
  expect(create.status()).toBe(201);
  const createBody = await create.json();
  expect(createBody).toMatchObject({ ok: true, revision: { status: "draft" } });

  const confirm = await request.post(
    `/api/prearrival/revisions/${createBody.revision.id}/confirm`,
    { headers: partnerHeaders },
  );
  expect(confirm.ok()).toBeTruthy();
  await expect(confirm.json()).resolves.toMatchObject({
    ok: true,
    revision: { version: 2, status: "confirmed" },
  });
});
