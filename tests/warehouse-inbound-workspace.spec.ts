import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { replaceTranslatedText } from "./helpers/replaceTranslatedText";

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

test("keeps every Warehouse module accessible before Packing List confirmation", async ({
  page,
  request,
}) => {
  await request.post("/api/test/reset?packingList=empty");
  await page.goto("/warehouse");

  for (const name of ["Label print", "Receive stock", "Put away", "Receipt history"]) {
    await expect(page.getByRole("link", { name })).not.toHaveAttribute("aria-disabled", "true");
  }

  await page.getByRole("link", { name: "Label print" }).click();
  await expect(page.getByRole("heading", { name: "Label print" })).toBeVisible();
  await expect(page.getByText("Confirm this Shipment's Packing List to make product-label quantities available.")).toBeVisible();

  await page.getByRole("link", { name: "Receive stock" }).click();
  await expect(page.getByRole("heading", { name: "Receive stock" })).toBeVisible();
  await expect(page.getByText("Confirmed source quantities and a physically confirmed label print are required before receipt can be recorded.")).toBeVisible();

  await page.getByRole("link", { name: "Put away" }).click();
  await expect(page.getByRole("heading", { name: "Put away" })).toBeVisible();
  await expect(page.getByText("A confirmed receipt in BNE-RECEIVING-STAGING is required before destination scanning can begin.")).toBeVisible();

  await page.getByRole("link", { name: "Receipt history" }).click();
  await expect(page.getByRole("heading", { name: "Receipt history" })).toBeVisible();
  await expect(page.getByText("No audit events match this view")).toBeVisible();
  await expect(page.getByLabel("Source scope")).toHaveValue("");

  await expect(page.getByRole("button", { name: "Print labels" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirm receipt" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirm put away" })).toHaveCount(0);
});

test("translated scope switches between the full shipment, a single carton and a group", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const shipmentId = "shipment-test-1";
  const headers = { "x-drivemate-role": "partner" };
  const rev = await request.post(`/api/prearrival/shipments/${shipmentId}/revisions`, {
    headers, data: { schemaVersion: 3, shipmentId, cartons: [
      { sourceCartonNumber: "34#", kind: "carton", physicalCartonCount: 1, memberCartonNumbers: ["34#"], sourcePalletNumber: null, lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 2 }] },
      { sourceCartonNumber: "7#8#9#", kind: "carton_group", physicalCartonCount: 3, memberCartonNumbers: ["7#", "8#", "9#"], sourcePalletNumber: null, lines: [{ sku: "DM-GWM-AF-002", expectedQuantity: 6 }] },
    ] },
  });
  expect(rev.status()).toBe(201);
  const { revision } = await rev.json();
  const confirmation = await request.post(`/api/prearrival/revisions/${revision.id}/confirm`, { headers });
  await expect(confirmation).toBeOK();
  await page.goto("/warehouse");
  const scope = page.locator(".inbound-scope-summary");
  const range = page.locator(".inbound-range-row");
  await expect(scope).toHaveText("2 source scopes · 4 physical cartons · 1 group");
  await replaceTranslatedText(page.locator(".inbound-main"));
  await page.getByRole("checkbox", { name: "Source scope 34#", exact: true }).check();
  await expect(range).toContainText("2 labels");
  await expect(scope).toHaveText("1 source scope · 1 physical carton");
  await expect(page.locator(".inbound-queue-row")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Print labels", exact: true })).toBeEnabled();
  await replaceTranslatedText(page.locator(".inbound-main"));
  await page.getByRole("button", { name: "Full shipment", exact: true }).click();
  await expect(range).toContainText("8 labels");
  await expect(scope).toHaveText("2 source scopes · 4 physical cartons · 1 group");
  await page.getByLabel("Find source scope or member carton").fill("8#");
  await page.getByLabel("Find source scope or member carton").press("Enter");
  await expect(range).toContainText("6 labels");
  await expect(range).toContainText("7#8#9#");
  await page.getByRole("button", { name: "Full shipment", exact: true }).click();
  await expect(range).toContainText("8 labels");
  await page.getByRole("link", { name: "Receipt history", exact: true }).click();
  const historySummary = page.locator(".inbound-history-scope-summary");
  await expect(historySummary).toHaveText("2 source scopes · 4 physical cartons · 1 group");
  await replaceTranslatedText(page.locator(".inbound-main"));
  await page.getByLabel("Source scope", { exact: true }).selectOption("34#");
  await expect(historySummary).toHaveText("1 source scope · 1 physical carton");
  expect(errors).toEqual([]);
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
  await page.getByRole("link", { name: "Put away", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Put away", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm put away", exact: true })).toHaveCount(0);

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

test("resolves a member carton to its canonical source group for Warehouse operations", async ({
  page,
  request,
}) => {
  const payload = {
    schemaVersion: 3,
    shipmentId: "shipment-test-1",
    cartons: [{
      sourceCartonNumber: "7#8#9#",
      kind: "carton_group",
      physicalCartonCount: 3,
      memberCartonNumbers: ["7#", "8#", "9#"],
      sourcePalletNumber: null,
      lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 10 }],
    }],
  };
  const created = await request.post(
    "/api/prearrival/shipments/shipment-test-1/revisions",
    { headers: { "x-drivemate-role": "partner" }, data: payload },
  );
  expect(created.status()).toBe(201);
  const body = await created.json();
  await request.post(`/api/prearrival/revisions/${body.revision.id}/confirm`, {
    headers: { "x-drivemate-role": "partner" },
  });

  await page.goto("/warehouse");
  await page.getByLabel("Find source scope or member carton").fill("UNKNOWN-99");
  await page.getByLabel("Find source scope or member carton").press("Enter");
  await expect(page.locator("#warehouse-scope-feedback")).toContainText("No carton or source group matches UNKNOWN-99.");

  await page.getByLabel("Find source scope or member carton").fill("8#");
  const canonicalRequest = page.waitForRequest((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname === "/api/warehouse/labels"
      && url.searchParams.getAll("cartonNumber").includes("7#8#9#");
  });
  await page.getByLabel("Find source scope or member carton").press("Enter");
  await canonicalRequest;

  await expect(page.getByText("Member carton 8# resolved to source group 7#8#9#.", { exact: true })).toBeVisible();
  await expect(page.locator(".inbound-scope-bar p")).toContainText("7#8#9#");
  await expect(page.locator(".inbound-scope-bar p")).toContainText("10 expected units");

  const printRequest = page.waitForRequest((candidate) => (
    candidate.method() === "POST"
    && new URL(candidate.url()).pathname === "/api/warehouse/labels"
  ));
  await page.getByRole("button", { name: "Print labels" }).click();
  expect((await printRequest).postDataJSON()).toMatchObject({
    selection: {
      shipmentId: "shipment-test-1",
      cartonNumbers: ["7#8#9#"],
    },
  });

  for (const width of [390, 701, 768, 880, 1280]) {
    await page.setViewportSize({ width, height: 1024 });
    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    await expect(page.getByRole("region", { name: "Source carton scopes" })).toBeVisible();
  }
});
