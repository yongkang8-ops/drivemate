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

test("a stale shipment response cannot overwrite the latest selection", async ({
  page,
  request,
}) => {
  await request.post("/api/test/reset?shipments=multiple");
  await page.goto("/prearrival?shipmentId=shipment-test-1");
  await expect(page.getByLabel("Shipment")).toHaveValue("shipment-test-1");

  let releaseStaleRequest!: () => void;
  let reportStaleRequest!: () => void;
  const staleGate = new Promise<void>((resolve) => { releaseStaleRequest = resolve; });
  const staleStarted = new Promise<void>((resolve) => { reportStaleRequest = resolve; });
  await page.route(/\/api\/prearrival\/shipments\?shipmentId=/, async (route) => {
    const shipmentId = new URL(route.request().url()).searchParams.get("shipmentId");
    if (shipmentId === "shipment-test-2") {
      reportStaleRequest();
      await staleGate;
    }
    const response = await route.fetch();
    await route.fulfill({ response });
  });

  await page.getByLabel("Shipment").selectOption("shipment-test-2");
  await staleStarted;
  const latestResponse = page.waitForResponse((response) => (
    new URL(response.url()).searchParams.get("shipmentId") === "shipment-test-1"
  ));
  await page.getByLabel("Shipment").selectOption("shipment-test-1");
  await latestResponse;
  const staleResponse = page.waitForResponse((response) => (
    new URL(response.url()).searchParams.get("shipmentId") === "shipment-test-2"
  ));
  releaseStaleRequest();
  await staleResponse;
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

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

  const palletInput = page.getByLabel("Pallet number");
  expect(await palletInput.evaluate((input) => {
    const describedBy = input.getAttribute("aria-describedby");
    return {
      hasStableId: Boolean(input.id),
      wrappedByLabel: Boolean(input.closest("label")),
      describedBySibling: Boolean(
        describedBy && input.nextElementSibling?.id === describedBy,
      ),
    };
  })).toEqual({
    hasStableId: true,
    wrappedByLabel: false,
    describedBySibling: true,
  });

  await palletInput.fill("P001");
  await expect(page.getByText("Enter the pallet number.", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Cancel working copy" }).click();
  await expect(errorSummary).toHaveCount(0);
  await expect(
    page.getByText("Packing-list revision could not be created.", { exact: true }),
  ).toHaveCount(0);
});

test("Packing List SKU rows keep identity while a scanner types", async ({
  page,
  request,
}) => {
  const duplicateKeyErrors: string[] = [];
  page.on("console", (entry) => {
    if (entry.type() === "error" && entry.text().includes("same key")) {
      duplicateKeyErrors.push(entry.text());
    }
  });
  await request.post("/api/test/reset?packingList=empty");
  await page.goto("/prearrival");
  await page.getByRole("button", { name: "Create first Packing List" }).click();
  await page.getByRole("button", { name: "Add SKU line" }).click();
  await page.getByRole("button", { name: "Add SKU line" }).click();

  const thirdSku = page.getByLabel("SKU 3");
  await thirdSku.pressSequentially("DM-GWM-AF-002");
  await expect(thirdSku).toHaveValue("DM-GWM-AF-002");
  await expect(thirdSku).toBeFocused();

  await page.getByRole("button", { name: "Remove SKU line 2" }).evaluate(
    (button) => (button as HTMLButtonElement).click(),
  );

  const preservedSku = page.getByLabel("SKU 2");
  await expect(preservedSku).toHaveValue("DM-GWM-AF-002");
  await expect(preservedSku).toBeFocused();
  expect(duplicateKeyErrors).toEqual([]);
});

test("validation selects and focuses the first error in a hidden carton", async ({
  page,
  request,
}) => {
  await request.post("/api/test/reset?packingList=empty");
  await page.goto("/prearrival");
  await page.getByRole("button", { name: "Create first Packing List" }).click();
  await page.getByLabel("Pallet number").fill("P001");
  await page.getByLabel("Carton number").fill("C001");

  await page.getByRole("button", { name: "Add carton" }).click();
  await page.getByLabel("Carton number").fill("C002");
  await page.getByLabel("SKU", { exact: true }).fill("DM-GWM-OF-001");
  await page.getByRole("button", { name: "Confirm Packing List" }).click();

  await expect(page.getByRole("heading", { name: /Carton C001 expected contents/ })).toBeVisible();
  await expect(page.getByLabel("SKU", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("SKU", { exact: true })).toBeFocused();
});

test("removing a Packing List row clears index-based draft errors", async ({
  page,
  request,
}) => {
  await request.post("/api/test/reset?packingList=empty");
  await page.goto("/prearrival");
  await page.getByRole("button", { name: "Create first Packing List" }).click();
  await page.getByRole("button", { name: "Add SKU line" }).click();
  await page.getByRole("button", { name: "Confirm Packing List" }).click();
  await expect(page.locator(".prearrival-field-error")).not.toHaveCount(0);

  await page.getByRole("button", { name: "Remove SKU line 2" }).click();

  await expect(page.locator('.prearrival-error-summary[role="alert"]')).toHaveCount(0);
  await expect(page.locator(".prearrival-field-error")).toHaveCount(0);
  await expect(page.locator('.prearrival-editor input[aria-invalid="true"]')).toHaveCount(0);
});

test("duplicate Packing List values stay local and do not create a revision", async ({
  page,
  request,
}) => {
  await request.post("/api/test/reset?packingList=empty");
  let revisionPostCount = 0;
  page.on("request", (pendingRequest) => {
    if (
      pendingRequest.method() === "POST"
      && /\/api\/prearrival\/shipments\/[^/]+\/revisions$/.test(
        new URL(pendingRequest.url()).pathname,
      )
    ) revisionPostCount += 1;
  });

  await page.goto("/prearrival");
  await page.getByRole("button", { name: "Create first Packing List" }).click();
  await page.getByLabel("Pallet number").fill("P001");
  await page.getByLabel("Carton number").fill("C001");
  await page.getByLabel("SKU", { exact: true }).fill("DM-GWM-OF-001");
  await page.getByRole("button", { name: "Add SKU line" }).click();
  await page.getByLabel("SKU 2").fill(" dm-gwm-of-001 ");
  await page.getByRole("button", { name: "Confirm Packing List" }).click();

  await expect(page.getByText("Use each SKU once per carton.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("SKU 2")).toBeFocused();
  expect(revisionPostCount).toBe(0);
});

test("cancel restores the loaded confirmed shipment status message", async ({ page }) => {
  await page.goto("/prearrival");
  await page.getByRole("button", { name: "Create revision" }).click();
  await page.getByRole("button", { name: "Cancel working copy" }).click();

  await expect(page.locator(".prearrival-message")).toHaveText(
    "Export packing data confirmed. Create a revision before changing any source quantity.",
  );
});

test("a saved draft retries confirmation without creating another revision", async ({
  page,
  request,
}) => {
  await request.post("/api/test/reset?packingList=empty");
  let createPostCount = 0;
  let confirmPostCount = 0;
  let releaseCreate!: () => void;
  let reportCreateStarted!: () => void;
  const createGate = new Promise<void>((resolve) => { releaseCreate = resolve; });
  const createStarted = new Promise<void>((resolve) => { reportCreateStarted = resolve; });

  await page.route(/\/api\/prearrival\/shipments\/[^/]+\/revisions$/, async (route) => {
    createPostCount += 1;
    reportCreateStarted();
    await createGate;
    await route.continue();
  });
  await page.route(/\/api\/prearrival\/revisions\/[^/]+\/confirm$/, async (route) => {
    confirmPostCount += 1;
    if (confirmPostCount === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, message: "Temporary confirmation failure." }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/prearrival");
  await page.getByRole("button", { name: "Create first Packing List" }).click();
  await page.getByLabel("Pallet number").fill("P001");
  await page.getByLabel("Carton number").fill("C001");
  await page.getByLabel("SKU", { exact: true }).fill("DM-GWM-OF-001");
  await page.getByRole("button", { name: "Confirm Packing List" }).click();

  await createStarted;
  await expect(page.getByLabel("Shipment")).toBeDisabled();
  releaseCreate();
  await expect(page.getByText("Temporary confirmation failure.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Packing List" })).toBeEnabled();

  await page.getByRole("button", { name: "Confirm Packing List" }).click();
  await expect(page.getByText("Packing List v1 confirmed", { exact: true })).toBeVisible();
  expect(createPostCount).toBe(1);
  expect(confirmPostCount).toBe(2);
});

test("an unknown create result requires shipment reconciliation", async ({
  page,
  request,
}) => {
  await request.post("/api/test/reset?packingList=empty");
  const pageErrors: string[] = [];
  let createPostCount = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(/\/api\/prearrival\/shipments\/[^/]+\/revisions$/, async (route) => {
    createPostCount += 1;
    await route.abort("failed");
  });

  await page.goto("/prearrival");
  await page.getByRole("button", { name: "Create first Packing List" }).click();
  await page.getByLabel("Pallet number").fill("P001");
  await page.getByLabel("Carton number").fill("C001");
  await page.getByLabel("SKU", { exact: true }).fill("DM-GWM-OF-001");
  await page.getByRole("button", { name: "Confirm Packing List" }).click();

  await expect(page.getByRole("button", { name: "Reload shipment status" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Confirm Packing List" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel working copy" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Create first Packing List" })).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm Packing List" }).evaluate(
    (button) => {
      (button as HTMLButtonElement).disabled = false;
      (button as HTMLButtonElement).click();
      const reactPropsKey = Object.keys(button).find((key) => key.startsWith("__reactProps$"));
      const reactProps = reactPropsKey
        ? (button as unknown as Record<string, { onClick?: () => void }>)[reactPropsKey]
        : undefined;
      reactProps?.onClick?.();
    },
  );
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  expect(createPostCount).toBe(1);
  expect(pageErrors).toEqual([]);

  await page.unroute(/\/api\/prearrival\/shipments\/[^/]+\/revisions$/);
  await page.getByRole("button", { name: "Reload shipment status" }).click();
  await expect(page.getByRole("button", { name: "Create first Packing List" })).toBeEnabled();
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
