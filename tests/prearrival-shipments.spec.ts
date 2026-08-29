import { expect, test } from "@playwright/test";

const partnerHeaders = { "x-drivemate-role": "partner" };

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
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
