import { expect, test } from "@playwright/test";

const tradingEnabledForE2e =
  process.env.DRIVEMATE_TRADING_ENABLED === "true" &&
  process.env.DRIVEMATE_GST_REGISTERED === "true";
const tradingTest = tradingEnabledForE2e ? test : test.skip;

let requestSequence = 0;
function roleHeaders(role: "trade" | "partner" | "admin") {
  requestSequence += 1;
  return {
    "x-drivemate-role": role,
    "Idempotency-Key": `playwright-${role}-${requestSequence}`,
  };
}
function publicHeaders() {
  requestSequence += 1;
  return { "x-forwarded-for": `198.51.100.${requestSequence % 250}` };
}

function tradeApplication(overrides: Record<string, unknown>) {
  return {
    privacyConsent: true,
    tradeTermsConsent: true,
    consentVersion: "2026-08-21",
    ...overrides,
  };
}

function dispatchPayload(scans?: Array<{ sku: string; quantity: number }>) {
  return {
    scans,
    deliveryChargeExGstCents: 1200,
    carrier: "Test Courier",
    trackingNumber: `TRACK-${requestSequence}`,
  };
}

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("vehicle lookup API returns matched parts", async ({ request }) => {
  const response = await request.post("/api/vehicle-lookup", {
    headers: roleHeaders("trade"),
    data: { query: "GWM Cannon Alpha filters", rego: "QLD 24ALPHA" },
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.vehicle.make).toBe("GWM");
  expect(
    body.matches.some(
      (match: { sku: string }) => match.sku === "DM-GWM-OF-001",
    ),
  ).toBeTruthy();

  const adminState = await request.get("/api/admin-state", {
    headers: roleHeaders("admin"),
  });
  const state = await adminState.json();
  expect(
    state.lookupRequests.some(
      (lookup: {
        query?: string;
        rego?: string;
        vehicle: string;
        matchCount: number;
        tradeAccountId?: string;
      }) =>
        lookup.query === "GWM Cannon Alpha filters" &&
        lookup.rego === "QLD 24ALPHA" &&
        lookup.vehicle === "GWM Cannon Alpha 2024" &&
        lookup.matchCount > 0 &&
        lookup.tradeAccountId === "acct-demo",
    ),
  ).toBeTruthy();
});

test("health API reports deployment readiness without exposing secrets", async ({
  request,
}) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.app).toBe("DriveMate Parts");
  expect(body.repository.mode).toBeTruthy();
  expect(body.ready).toBe(true);
  expect(body.checks.map((check: { name: string }) => check.name)).toEqual(
    expect.arrayContaining([
      "repository",
      "auth",
      "navigation",
      "supabase_env",
      "document_bucket",
      "business_profile",
      "gst_registration",
    ]),
  );
  expect(JSON.stringify(body)).not.toContain("SERVICE_ROLE_KEY");
  expect(JSON.stringify(body)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
});

tradingTest("orders API creates a submitted order", async ({ request }) => {
  const response = await request.post("/api/orders", {
    headers: roleHeaders("trade"),
    data: {
      poNumber: "JOB-API-1",
      vehicleVin: "LGWFFEA6XRA000245",
      lines: [{ sku: "DM-GWM-AF-002", quantity: 1 }],
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.order.status).toBe("submitted");
  expect(body.order.tradeAccountId).toBe("acct-demo");
  expect(body.order.createdBy).toBe("demo-trade-user");
  expect(body.order.lines).toEqual([
    expect.objectContaining({
      sku: "DM-GWM-AF-002",
      quantity: 1,
      unitPriceExGstCents: 3449,
      lineTotalIncGstCents: 3794,
    }),
  ]);
  expect(body.order.totalIncGstCents).toBe(3794);
});

tradingTest("orders API rejects draft or paused SKUs from trade ordering", async ({
  request,
}) => {
  const pause = await request.patch("/api/products/DM-GWM-OF-001", {
    headers: roleHeaders("admin"),
    data: {
      status: "paused",
    },
  });
  expect(pause.ok()).toBeTruthy();

  const response = await request.post("/api/orders", {
    headers: roleHeaders("trade"),
    data: {
      poNumber: "JOB-PAUSED-SKU",
      lines: [{ sku: "DM-GWM-OF-001", quantity: 1 }],
    },
  });

  expect(response.status()).toBe(422);
  const body = await response.json();
  expect(body.message).toBe(
    "SKU DM-GWM-OF-001 is not active for trade ordering.",
  );

  const warehouseReceive = await request.post("/api/inventory-movement", {
    headers: roleHeaders("partner"),
    data: {
      type: "inbound",
      sku: "DMPGWMOF001",
      quantity: 1,
      reference: "PAUSED-STOCK-CHECK",
      location: "BNE receiving",
    },
  });
  expect(warehouseReceive.ok()).toBeTruthy();
});

tradingTest("trade state API returns only the current trade account records", async ({
  request,
}) => {
  await request.post("/api/orders", {
    headers: roleHeaders("trade"),
    data: {
      poNumber: "JOB-TRADE-STATE",
      lines: [{ sku: "DM-GWM-AF-002", quantity: 1 }],
    },
  });

  const response = await request.get(
    "/api/trade-state?tradeAccountId=forged-account",
    {
      headers: roleHeaders("trade"),
    },
  );

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.tradeAccountId).toBe("acct-demo");
  expect(
    body.orders.some(
      (order: { poNumber?: string }) => order.poNumber === "JOB-TRADE-STATE",
    ),
  ).toBeTruthy();
  expect(
    body.accountDocuments.some(
      (document: { type: string; reference: string }) =>
        document.type === "order_confirmation" &&
        /^OC-SO-\d+/.test(document.reference),
    ),
  ).toBeTruthy();
  expect(
    body.accountDocuments.some(
      (document: { type: string; reference: string }) =>
        document.type === "statement" &&
        /^STMT-\d{4}-\d{2}-acct-demo$/.test(document.reference),
    ),
  ).toBeTruthy();
  const confirmation = body.accountDocuments.find(
    (document: { type: string }) => document.type === "order_confirmation",
  );
  const access = await request.get(
    `/api/account-documents/${confirmation.id}`,
    {
      headers: roleHeaders("trade"),
    },
  );
  expect(access.ok()).toBeTruthy();
  const accessBody = await access.json();
  expect(accessBody.downloadUrl).toContain("data:text/plain");
  const documentText = decodeURIComponent(
    accessBody.downloadUrl.split(",")[1] ?? "",
  );
  expect(documentText).toContain("DriveMate Parts account document");
  expect(documentText).toContain("Document: Order confirmation");
  expect(documentText).toContain("PO / job: JOB-TRADE-STATE");
  expect(documentText).toContain("Reserved lines:");
  expect(documentText).toContain("- DM-GWM-AF-002 x 1");
});

tradingTest("order dispatch API confirms a warehouse dispatch", async ({
  request,
}) => {
  const orderResponse = await request.post("/api/orders", {
    headers: roleHeaders("trade"),
    data: {
      poNumber: "JOB-DISPATCH",
      lines: [{ sku: "DM-GWM-OF-001", quantity: 1 }],
    },
  });
  expect(orderResponse.ok()).toBeTruthy();
  const orderBody = await orderResponse.json();

  const dispatchResponse = await request.post(
    `/api/orders/${orderBody.order.id}/dispatch`,
    {
      headers: roleHeaders("partner"),
      data: dispatchPayload([{ sku: "DMPGWMOF001", quantity: 1 }]),
    },
  );

  expect(dispatchResponse.ok()).toBeTruthy();
  const dispatchBody = await dispatchResponse.json();
  expect(dispatchBody.order.status).toBe("dispatched");
  expect(dispatchBody.movements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sku: "DM-GWM-OF-001",
        movement: "Dispatch",
        reference: orderBody.order.id,
        createdBy: "demo-partner-user",
      }),
    ]),
  );

  const tradeState = await request.get("/api/trade-state", {
    headers: roleHeaders("trade"),
  });
  const stateBody = await tradeState.json();
  expect(
    stateBody.accountDocuments.some(
      (document: { type: string; reference: string }) =>
        document.type === "delivery_record" &&
        document.reference === `DEL-${orderBody.order.id}`,
    ),
  ).toBeTruthy();
  const delivery = stateBody.accountDocuments.find(
    (document: { type: string }) => document.type === "delivery_record",
  );
  expect(delivery).toBeTruthy();
  const deliveryAccess = await request.get(
    `/api/account-documents/${delivery!.id}`,
    {
      headers: roleHeaders("trade"),
    },
  );
  expect(deliveryAccess.ok()).toBeTruthy();
  const deliveryBody = await deliveryAccess.json();
  const deliveryText = decodeURIComponent(
    deliveryBody.downloadUrl.split(",")[1] ?? "",
  );
  expect(deliveryText).toContain("Document: Delivery record");
  expect(deliveryText).toContain(`Order: ${orderBody.order.id}`);
  expect(deliveryText).toContain("- DM-GWM-OF-001 x 1");
});

tradingTest("order dispatch API requires scanned lines that match the order", async ({
  request,
}) => {
  const orderResponse = await request.post("/api/orders", {
    headers: roleHeaders("trade"),
    data: {
      poNumber: "JOB-DISPATCH-SCAN",
      lines: [{ sku: "DM-GWM-OF-001", quantity: 1 }],
    },
  });
  expect(orderResponse.ok()).toBeTruthy();
  const orderBody = await orderResponse.json();

  const missingScans = await request.post(
    `/api/orders/${orderBody.order.id}/dispatch`,
    {
      headers: roleHeaders("partner"),
      data: dispatchPayload(),
    },
  );
  expect(missingScans.status()).toBe(400);

  const wrongScan = await request.post(
    `/api/orders/${orderBody.order.id}/dispatch`,
    {
      headers: roleHeaders("partner"),
      data: dispatchPayload([{ sku: "DM-GWM-AF-002", quantity: 1 }]),
    },
  );
  expect(wrongScan.status()).toBe(422);
  const wrongScanBody = await wrongScan.json();
  expect(wrongScanBody.message).toContain("not on this order");

  const barcodeScan = await request.post(
    `/api/orders/${orderBody.order.id}/dispatch`,
    {
      headers: roleHeaders("partner"),
      data: dispatchPayload([{ sku: "DMPGWMOF001", quantity: 1 }]),
    },
  );
  expect(barcodeScan.ok()).toBeTruthy();
});

tradingTest("order cancel API releases reserved stock before dispatch", async ({
  request,
}) => {
  const orderResponse = await request.post("/api/orders", {
    headers: roleHeaders("trade"),
    data: {
      poNumber: "JOB-CANCEL",
      lines: [{ sku: "DM-GWM-OF-001", quantity: 1 }],
    },
  });
  expect(orderResponse.ok()).toBeTruthy();
  const orderBody = await orderResponse.json();

  const reservedState = await request.get("/api/warehouse-state", {
    headers: roleHeaders("partner"),
  });
  const reservedBody = await reservedState.json();
  expect(
    reservedBody.inventory.some(
      (row: { sku: string; reserved: number }) =>
        row.sku === "DM-GWM-OF-001" && row.reserved === 2,
    ),
  ).toBeTruthy();

  const cancel = await request.post(
    `/api/orders/${orderBody.order.id}/cancel`,
    {
      headers: roleHeaders("trade"),
    },
  );
  expect(cancel.ok()).toBeTruthy();
  const cancelBody = await cancel.json();
  expect(cancelBody.order.status).toBe("cancelled");

  const releasedState = await request.get("/api/warehouse-state", {
    headers: roleHeaders("partner"),
  });
  const releasedBody = await releasedState.json();
  expect(
    releasedBody.inventory.some(
      (row: { sku: string; reserved: number }) =>
        row.sku === "DM-GWM-OF-001" && row.reserved === 1,
    ),
  ).toBeTruthy();

  const dispatchCancelled = await request.post(
    `/api/orders/${orderBody.order.id}/dispatch`,
    {
      headers: roleHeaders("partner"),
      data: dispatchPayload([{ sku: "DM-GWM-OF-001", quantity: 1 }]),
    },
  );
  expect(dispatchCancelled.status()).toBe(422);
});

tradingTest("orders API ignores a forged trade account from trade users", async ({
  request,
}) => {
  const response = await request.post("/api/orders", {
    headers: roleHeaders("trade"),
    data: {
      tradeAccountId: "client-forged-account",
      poNumber: "JOB-FORGED",
      lines: [{ sku: "DM-GWM-CF-003", quantity: 1 }],
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.order.tradeAccountId).toBe("acct-demo");
  expect(body.order.createdBy).toBe("demo-trade-user");
});

tradingTest("orders API requires a trade account for staff-created orders", async ({
  request,
}) => {
  const response = await request.post("/api/orders", {
    headers: roleHeaders("admin"),
    data: {
      poNumber: "JOB-ADMIN-NO-ACCOUNT",
      lines: [{ sku: "DM-GWM-CF-003", quantity: 1 }],
    },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.message).toBe(
    "Trade account is required for staff-created orders.",
  );
});

tradingTest("orders API requires an approved trade account", async ({ request }) => {
  const application = await request.post("/api/trade-account-applications", {
    headers: publicHeaders(),
    data: tradeApplication({
      accountName: "Pending Order Workshop",
      contactName: "Morgan Lane",
      contactEmail: "morgan@example.com",
      contactPhone: "0400000004",
    }),
  });
  expect(application.ok()).toBeTruthy();
  const applicationBody = await application.json();

  const pendingOrder = await request.post("/api/orders", {
    headers: roleHeaders("admin"),
    data: {
      tradeAccountId: applicationBody.application.id,
      poNumber: "JOB-PENDING-ACCOUNT",
      lines: [{ sku: "DM-GWM-CF-003", quantity: 1 }],
    },
  });
  expect(pendingOrder.status()).toBe(422);
  const pendingBody = await pendingOrder.json();
  expect(pendingBody.message).toBe(
    "Trade account must be approved before orders can be submitted.",
  );

  const approval = await request.post(
    `/api/trade-account-applications/${applicationBody.application.id}/approve`,
    {
      headers: roleHeaders("admin"),
    },
  );
  expect(approval.ok()).toBeTruthy();

  const approvedOrder = await request.post("/api/orders", {
    headers: roleHeaders("admin"),
    data: {
      tradeAccountId: applicationBody.application.id,
      poNumber: "JOB-APPROVED-ACCOUNT",
      lines: [{ sku: "DM-GWM-CF-003", quantity: 1 }],
    },
  });
  expect(approvedOrder.ok()).toBeTruthy();
  const approvedBody = await approvedOrder.json();
  expect(approvedBody.order.tradeAccountId).toBe(
    applicationBody.application.id,
  );

  const pause = await request.patch(
    `/api/trade-account-applications/${applicationBody.application.id}/status`,
    {
      headers: roleHeaders("admin"),
      data: { status: "paused" },
    },
  );
  expect(pause.ok()).toBeTruthy();
  const pauseBody = await pause.json();
  expect(pauseBody.application.status).toBe("paused");

  const pausedOrder = await request.post("/api/orders", {
    headers: roleHeaders("admin"),
    data: {
      tradeAccountId: applicationBody.application.id,
      poNumber: "JOB-PAUSED-ACCOUNT",
      lines: [{ sku: "DM-GWM-CF-003", quantity: 1 }],
    },
  });
  expect(pausedOrder.status()).toBe(422);
  const pausedBody = await pausedOrder.json();
  expect(pausedBody.message).toBe(
    "Trade account must be approved before orders can be submitted.",
  );

  const reactivate = await request.patch(
    `/api/trade-account-applications/${applicationBody.application.id}/status`,
    {
      headers: roleHeaders("admin"),
      data: { status: "approved" },
    },
  );
  expect(reactivate.ok()).toBeTruthy();

  const reactivatedOrder = await request.post("/api/orders", {
    headers: roleHeaders("admin"),
    data: {
      tradeAccountId: applicationBody.application.id,
      poNumber: "JOB-REACTIVATED-ACCOUNT",
      lines: [{ sku: "DM-GWM-CF-003", quantity: 1 }],
    },
  });
  expect(reactivatedOrder.ok()).toBeTruthy();
});

test("inventory movement API validates stock availability", async ({
  request,
}) => {
  const response = await request.post("/api/inventory-movement", {
    headers: roleHeaders("partner"),
    data: {
      type: "dispatch",
      sku: "DM-MG-CF-008",
      quantity: 1,
      reference: "ORD-NOSTOCK",
      location: "BNE dispatch",
    },
  });

  expect(response.status()).toBe(422);
  const body = await response.json();
  expect(body.message).toBe("Not enough available stock.");
});

test("inventory movement API records and reviews quarantine stock", async ({
  request,
}) => {
  const response = await request.post("/api/inventory-movement", {
    headers: roleHeaders("partner"),
    data: {
      type: "quarantine",
      sku: "DM-GWM-OF-001",
      quantity: 3,
      reference: "RET-QA-API",
      location: "BNE quarantine",
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.movement).toMatchObject({
    sku: "DM-GWM-OF-001",
    movement: "Quarantine",
    reference: "RET-QA-API",
    createdBy: "demo-partner-user",
  });
  const row = body.inventory.find(
    (item: { sku: string }) => item.sku === "DM-GWM-OF-001",
  );
  expect(row).toMatchObject({ onHand: 42, reserved: 1, quarantine: 3 });

  const release = await request.post("/api/inventory-movement", {
    headers: roleHeaders("partner"),
    data: {
      type: "adjustment",
      sku: "DM-GWM-OF-001",
      quantity: 1,
      reference: "QA-RELEASE-API",
      location: "BNE quarantine",
      quarantineAction: "release",
    },
  });
  expect(release.ok()).toBeTruthy();
  const releaseBody = await release.json();
  expect(releaseBody.movement).toMatchObject({
    sku: "DM-GWM-OF-001",
    movement: "Quarantine Release",
    reference: "QA-RELEASE-API",
  });
  const releasedRow = releaseBody.inventory.find(
    (item: { sku: string }) => item.sku === "DM-GWM-OF-001",
  );
  expect(releasedRow).toMatchObject({ onHand: 42, reserved: 1, quarantine: 2 });

  const writeoff = await request.post("/api/inventory-movement", {
    headers: roleHeaders("partner"),
    data: {
      type: "adjustment",
      sku: "DM-GWM-OF-001",
      quantity: 1,
      reference: "QA-WRITEOFF-API",
      location: "BNE quarantine",
      quarantineAction: "writeoff",
    },
  });
  expect(writeoff.ok()).toBeTruthy();
  const writeoffBody = await writeoff.json();
  expect(writeoffBody.movement).toMatchObject({
    sku: "DM-GWM-OF-001",
    movement: "Quarantine Write-off",
    reference: "QA-WRITEOFF-API",
  });
  const writeoffRow = writeoffBody.inventory.find(
    (item: { sku: string }) => item.sku === "DM-GWM-OF-001",
  );
  expect(writeoffRow).toMatchObject({ onHand: 41, reserved: 1, quarantine: 1 });
});

test("inventory movement API directs putaway to the receipt-scoped workflow", async ({
  request,
}) => {
  const response = await request.post("/api/inventory-movement", {
    headers: roleHeaders("partner"),
    data: {
      type: "putaway",
      sku: "DMPGWMOF001",
      quantity: 1,
      reference: "PUT-API",
      fromLocation: "BNE receiving",
      toLocation: "BNE-A01-03",
    },
  });

  expect(response.status()).toBe(422);
  const body = await response.json();
  expect(body).toEqual({
    ok: false,
    message: "Putaway must use the receipt-scoped Warehouse Put away workflow.",
  });
});

test("inventory movement API records stock adjustments", async ({
  request,
}) => {
  const response = await request.post("/api/inventory-movement", {
    headers: roleHeaders("partner"),
    data: {
      type: "adjustment",
      sku: "DM-GWM-OF-001",
      quantity: 1,
      reference: "COUNT-API",
      location: "BNE-A01-03",
      adjustmentDirection: "decrease",
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.movement).toMatchObject({
    sku: "DM-GWM-OF-001",
    movement: "Adjustment",
    reference: "COUNT-API",
    location: "BNE-A01-03",
    createdBy: "demo-partner-user",
  });
  const row = body.inventory.find(
    (item: { sku: string }) => item.sku === "DM-GWM-OF-001",
  );
  expect(row).toMatchObject({ onHand: 41, reserved: 1, quarantine: 0 });
});

test("inventory movement import API records bulk inbound receiving", async ({
  request,
}) => {
  const response = await request.post("/api/inventory-movement/import", {
    headers: roleHeaders("partner"),
    data: {
      rows: [
        {
          type: "inbound",
          sku: "DMPGWMOF001",
          quantity: 2,
          reference: "BULK-RECEIVE-API",
          location: "BNE receiving",
        },
        {
          type: "inbound",
          sku: "GWM-OEM-AF-002",
          quantity: 3,
          reference: "BULK-RECEIVE-API",
          location: "BNE receiving",
        },
      ],
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.summary).toMatchObject({ processed: 2, created: 2, failed: 0 });
  expect(body.movements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sku: "DM-GWM-OF-001",
        movement: "Inbound",
        quantity: 2,
      }),
      expect.objectContaining({
        sku: "DM-GWM-AF-002",
        movement: "Inbound",
        quantity: 3,
      }),
    ]),
  );
  expect(body.inventory).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sku: "DM-GWM-OF-001", onHand: 44 }),
      expect.objectContaining({ sku: "DM-GWM-AF-002", onHand: 41 }),
    ]),
  );

  const adminState = await request.get("/api/admin-state", {
    headers: roleHeaders("admin"),
  });
  expect(adminState.ok()).toBeTruthy();
  const state = await adminState.json();
  expect(state.purchaseBatches).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        batchNo: "BULK-RECEIVE-API",
        sku: "DM-GWM-OF-001",
        receivedQuantity: 2,
      }),
      expect.objectContaining({
        batchNo: "BULK-RECEIVE-API",
        sku: "DM-GWM-AF-002",
        receivedQuantity: 3,
      }),
    ]),
  );
});

tradingTest("warehouse state API returns inventory and pick orders for warehouse users", async ({
  request,
}) => {
  await request.post("/api/orders", {
    headers: roleHeaders("trade"),
    data: {
      poNumber: "JOB-WH-STATE",
      lines: [{ sku: "DM-GWM-OF-001", quantity: 1 }],
    },
  });

  const response = await request.get("/api/warehouse-state", {
    headers: roleHeaders("partner"),
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(
    body.inventory.some(
      (row: { sku: string; quarantine: number }) =>
        row.sku === "DM-GWM-OF-001" && row.quarantine === 0,
    ),
  ).toBeTruthy();
  expect(
    body.pickOrders.some(
      (order: { poNumber?: string }) => order.poNumber === "JOB-WH-STATE",
    ),
  ).toBeTruthy();
  expect(Array.isArray(body.stockMovements)).toBeTruthy();
});

test("trade account application API creates an admin-visible pending account", async ({
  request,
}) => {
  const response = await request.post("/api/trade-account-applications", {
    headers: publicHeaders(),
    data: tradeApplication({
      accountName: "Northside Workshop",
      abn: "12345678901",
      contactName: "Jamie Lee",
      contactEmail: "jamie@example.com",
      contactPhone: "0400000000",
      postcode: "4000",
      notes: "Interested in GWM and BYD service parts.",
    }),
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.application.status).toBe("pending");

  const adminState = await request.get("/api/admin-state", {
    headers: roleHeaders("admin"),
  });
  const state = await adminState.json();
  expect(
    state.accountApplications.some(
      (application: { accountName: string; contactEmail: string }) =>
        application.accountName === "Northside Workshop" &&
        application.contactEmail === "jamie@example.com",
    ),
  ).toBeTruthy();
});

test("trade account application API rate limits repeated email submissions", async ({
  request,
}) => {
  const email = `rate-${Date.now()}@example.com`;
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await request.post("/api/trade-account-applications", {
      headers: { ...publicHeaders(), "x-forwarded-for": "203.0.113.47" },
      data: tradeApplication({
        accountName: `Rate Limit Workshop ${attempt}`,
        contactName: "Rate Test",
        contactEmail: email,
        contactPhone: "0400000047",
      }),
    });
    statuses.push(response.status());
  }

  expect(statuses).toEqual([200, 422, 422, 429]);
});

test("admin can approve a pending trade account application", async ({
  request,
}) => {
  const response = await request.post("/api/trade-account-applications", {
    headers: publicHeaders(),
    data: tradeApplication({
      accountName: "Southside Workshop",
      contactName: "Taylor Smith",
      contactEmail: "taylor@example.com",
      contactPhone: "0400000001",
    }),
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();

  const approval = await request.post(
    `/api/trade-account-applications/${body.application.id}/approve`,
    {
      headers: roleHeaders("admin"),
    },
  );

  expect(approval.ok()).toBeTruthy();
  const approvalBody = await approval.json();
  expect(approvalBody.application.status).toBe("approved");

  const adminState = await request.get("/api/admin-state", {
    headers: roleHeaders("admin"),
  });
  const state = await adminState.json();
  expect(
    state.accountApplications.some(
      (application: { id: string }) => application.id === body.application.id,
    ),
  ).toBe(false);
});

test("admin can provision a trade login from a pending application", async ({
  request,
}) => {
  const response = await request.post("/api/trade-account-applications", {
    headers: publicHeaders(),
    data: tradeApplication({
      accountName: "Provisioned Workshop",
      contactName: "Riley Chen",
      contactEmail: "riley@example.com",
      contactPhone: "0400000003",
    }),
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();

  const provision = await request.post(
    `/api/trade-account-applications/${body.application.id}/provision-login`,
    {
      headers: roleHeaders("admin"),
    },
  );

  expect(provision.ok()).toBeTruthy();
  const provisionBody = await provision.json();
  expect(provisionBody.application.status).toBe("approved");
  expect(provisionBody.login).toMatchObject({
    email: "riley@example.com",
    created: true,
  });
  expect(provisionBody.login.setupEmailSent).toBe(true);
});

test("admin state API returns metrics, catalogue and operating records", async ({
  request,
}) => {
  const response = await request.get("/api/admin-state", {
    headers: roleHeaders("admin"),
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.metrics.activeSkus).toBeGreaterThan(0);
  expect(body.metrics.reorderAlerts).toBeGreaterThan(0);
  expect(
    body.catalogue.some((row: { sku: string }) => row.sku === "DM-GWM-OF-001"),
  ).toBeTruthy();
  expect(
    body.reorderAlerts.some(
      (alert: {
        sku: string;
        available: number;
        reorderPoint: number;
        suggestedOrderQty: number;
      }) =>
        alert.sku === "DM-MG-CF-008" &&
        alert.available === 0 &&
        alert.reorderPoint > 0 &&
        alert.suggestedOrderQty > 0,
    ),
  ).toBeTruthy();
  expect(Array.isArray(body.orders)).toBeTruthy();
  expect(Array.isArray(body.accountDocuments)).toBeTruthy();
  expect(Array.isArray(body.stockMovements)).toBeTruthy();
  expect(Array.isArray(body.accountApplications)).toBeTruthy();
  expect(Array.isArray(body.tradeAccounts)).toBeTruthy();
  expect(
    body.fitmentRules.some(
      (rule: { sku: string }) => rule.sku === "DM-GWM-OF-001",
    ),
  ).toBeTruthy();
  expect(
    body.purchaseBatches.some(
      (batch: { batchNo: string }) => batch.batchNo === "BNE-2026-06-PILOT",
    ),
  ).toBeTruthy();
  expect(
    body.pricingRules.some(
      (rule: { id: string; unitPriceExGstCents?: number }) =>
        rule.id === "PRICE-GWM-SERVICE-FILTERS" &&
        rule.unitPriceExGstCents === 2595,
    ),
  ).toBeTruthy();
  expect(
    body.rfqReviews.some(
      (review: { id: string }) => review.id === "RFQ-GWM-ALPHA-FUEL-FILTER",
    ),
  ).toBeTruthy();
  expect(Array.isArray(body.lookupRequests)).toBeTruthy();
  expect(
    body.userRoles.some((user: { role: string }) => user.role === "admin"),
  ).toBeTruthy();
});

tradingTest("admin export API returns operating CSV snapshots", async ({
  request,
}) => {
  await request.post("/api/orders", {
    headers: roleHeaders("trade"),
    data: {
      poNumber: "JOB-EXPORT",
      vehicleVin: "LGWDCF196RM608238",
      lines: [{ sku: "DM-GWM-OF-001", quantity: 1 }],
    },
  });
  const account = await request.post("/api/trade-account-applications", {
    headers: publicHeaders(),
    data: tradeApplication({
      accountName: "Export Workshop",
      contactName: "Alex Export",
      contactEmail: "export@example.com",
      contactPhone: "0400000010",
    }),
  });
  expect(account.ok()).toBeTruthy();
  const accountBody = await account.json();
  await request.post(
    `/api/trade-account-applications/${accountBody.application.id}/approve`,
    {
      headers: roleHeaders("admin"),
    },
  );

  const inventory = await request.get("/api/admin-export?type=catalogue", {
    headers: roleHeaders("admin"),
  });
  expect(inventory.ok()).toBeTruthy();
  expect(inventory.headers()["content-type"]).toContain("text/csv");
  expect(inventory.headers()["content-disposition"]).toContain(
    "drivemate-catalogue-export.csv",
  );
  const inventoryCsv = await inventory.text();
  expect(inventoryCsv).toContain("sku,barcode,oem_part_number");
  expect(inventoryCsv).toContain("trade_price_ex_gst_cents");
  expect(inventoryCsv).toContain("reorder_point,reorder_quantity");
  expect(inventoryCsv).toContain("DM-GWM-OF-001");

  const reorderAlerts = await request.get(
    "/api/admin-export?type=reorder_alerts",
    {
      headers: roleHeaders("admin"),
    },
  );
  expect(reorderAlerts.ok()).toBeTruthy();
  expect(reorderAlerts.headers()["content-disposition"]).toContain(
    "drivemate-reorder-alerts-export.csv",
  );
  const reorderCsv = await reorderAlerts.text();
  expect(reorderCsv).toContain(
    "sku,brand,part_name,available,reorder_point,suggested_order_qty,status",
  );
  expect(reorderCsv).toContain("DM-MG-CF-008");

  const orders = await request.get("/api/admin-export?type=orders", {
    headers: roleHeaders("admin"),
  });
  expect(orders.ok()).toBeTruthy();
  const ordersCsv = await orders.text();
  expect(ordersCsv).toContain("order_id,trade_account_id,status");
  expect(ordersCsv).toContain(
    "subtotal_ex_gst_cents,gst_cents,total_inc_gst_cents",
  );
  expect(ordersCsv).toContain("JOB-EXPORT");

  const accountDocuments = await request.get(
    "/api/admin-export?type=account_documents",
    {
      headers: roleHeaders("admin"),
    },
  );
  expect(accountDocuments.ok()).toBeTruthy();
  expect(accountDocuments.headers()["content-disposition"]).toContain(
    "drivemate-account-documents-export.csv",
  );
  const accountDocumentsCsv = await accountDocuments.text();
  expect(accountDocumentsCsv).toContain(
    "document_id,trade_account_id,type,reference,storage_path,created_at",
  );
  expect(accountDocumentsCsv).toContain("OC-");

  await request.post("/api/vehicle-lookup", {
    headers: roleHeaders("trade"),
    data: { query: "GWM Cannon Alpha filters", rego: "QLD 24ALPHA" },
  });
  const lookupRequests = await request.get(
    "/api/admin-export?type=lookup_requests",
    {
      headers: roleHeaders("admin"),
    },
  );
  expect(lookupRequests.ok()).toBeTruthy();
  expect(lookupRequests.headers()["content-disposition"]).toContain(
    "drivemate-lookup-requests-export.csv",
  );
  const lookupCsv = await lookupRequests.text();
  expect(lookupCsv).toContain(
    "lookup_id,trade_account_id,rego,vin,query,vehicle,match_count",
  );
  expect(lookupCsv).toContain("GWM Cannon Alpha filters");

  const tradeAccounts = await request.get(
    "/api/admin-export?type=trade_accounts",
    {
      headers: roleHeaders("admin"),
    },
  );
  expect(tradeAccounts.ok()).toBeTruthy();
  expect(tradeAccounts.headers()["content-disposition"]).toContain(
    "drivemate-trade-accounts-export.csv",
  );
  const tradeAccountsCsv = await tradeAccounts.text();
  expect(tradeAccountsCsv).toContain("trade_account_id,business,abn");
  expect(tradeAccountsCsv).toContain("Export Workshop");

  const purchaseBatches = await request.get(
    "/api/admin-export?type=purchase_batches",
    {
      headers: roleHeaders("admin"),
    },
  );
  expect(purchaseBatches.ok()).toBeTruthy();
  expect(purchaseBatches.headers()["content-disposition"]).toContain(
    "drivemate-purchase-batches-export.csv",
  );
  const purchaseBatchesCsv = await purchaseBatches.text();
  expect(purchaseBatchesCsv).toContain("batch_no,sku,received_quantity");
  expect(purchaseBatchesCsv).toContain("BNE-2026-06-PILOT");

  const invalid = await request.get("/api/admin-export?type=unknown", {
    headers: roleHeaders("admin"),
  });
  expect(invalid.status()).toBe(400);
  const invalidBody = await invalid.json();
  expect(invalidBody.allowedTypes).toEqual(
    expect.arrayContaining([
      "catalogue",
      "reorder_alerts",
      "trade_accounts",
      "purchase_batches",
      "account_documents",
      "lookup_requests",
      "orders",
      "stock_movements",
      "account_applications",
    ]),
  );
});

test("admin can update product master scanner fields", async ({ request }) => {
  const response = await request.patch("/api/products/DM-GWM-OF-001", {
    headers: roleHeaders("admin"),
    data: {
      barcode: "DMP-GWM-OF-001-API",
      oemPartNumber: "GWM-OEM-OF-API",
      reorderPoint: 20,
      reorderQuantity: 60,
      status: "active",
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.product).toMatchObject({
    sku: "DM-GWM-OF-001",
    barcode: "DMP-GWM-OF-001-API",
    oemPartNumber: "GWM-OEM-OF-API",
    reorderPoint: 20,
    reorderQuantity: 60,
    status: "active",
  });

  const scan = await request.post("/api/inventory-movement", {
    headers: roleHeaders("partner"),
    data: {
      type: "inbound",
      sku: "GWM-OEM-OF-API",
      quantity: 1,
      reference: "MASTER-API",
      location: "BNE receiving",
    },
  });

  expect(scan.ok()).toBeTruthy();
  const scanBody = await scan.json();
  expect(scanBody.movement.sku).toBe("DM-GWM-OF-001");
});

test("admin can create product master records for warehouse scans", async ({
  request,
}) => {
  const response = await request.post("/api/products", {
    headers: roleHeaders("admin"),
    data: {
      sku: "DM-GWM-API-099",
      brand: "GWM",
      name: "API Test Service Part",
      category: "Service Filter",
      barcode: "DMPGWMAPI099",
      oemPartNumber: "GWM-OEM-API-099",
      reorderPoint: 4,
      reorderQuantity: 12,
      status: "active",
    },
  });

  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.product).toMatchObject({
    sku: "DM-GWM-API-099",
    barcode: "DMPGWMAPI099",
    oemPartNumber: "GWM-OEM-API-099",
    reorderPoint: 4,
    reorderQuantity: 12,
    onHand: 0,
  });

  const scan = await request.post("/api/inventory-movement", {
    headers: roleHeaders("partner"),
    data: {
      type: "inbound",
      sku: "DMPGWMAPI099",
      quantity: 2,
      reference: "CREATE-API",
      location: "BNE receiving",
    },
  });

  expect(scan.ok()).toBeTruthy();
  const scanBody = await scan.json();
  expect(scanBody.movement.sku).toBe("DM-GWM-API-099");
});

test("admin can bulk import product masters for scanner setup", async ({
  request,
}) => {
  const response = await request.post("/api/products/import", {
    headers: roleHeaders("admin"),
    data: {
      rows: [
        {
          sku: "DM-GWM-OF-001",
          brand: "GWM",
          name: "Imported Genuine Engine Oil Filter",
          category: "Service Filter",
          barcode: "DMPGWMIMPORTOF001",
          oemPartNumber: "GWM-OEM-IMPORT-OF-001",
          reorderPoint: 18,
          reorderQuantity: 54,
          status: "active",
        },
        {
          sku: "DM-BYD-IMP-201",
          brand: "BYD",
          name: "Imported Cabin Filter",
          category: "Service Filter",
          barcode: "DMPBYDIMP201",
          oemPartNumber: "BYD-OEM-IMP-201",
          reorderPoint: 6,
          reorderQuantity: 24,
          status: "draft",
        },
      ],
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.summary).toMatchObject({ created: 1, updated: 1, failed: 0 });
  expect(body.products).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sku: "DM-GWM-OF-001",
        name: "Imported Genuine Engine Oil Filter",
        barcode: "DMPGWMIMPORTOF001",
        reorderPoint: 18,
        reorderQuantity: 54,
      }),
      expect.objectContaining({
        sku: "DM-BYD-IMP-201",
        barcode: "DMPBYDIMP201",
        status: "draft",
      }),
    ]),
  );

  const scan = await request.post("/api/inventory-movement", {
    headers: roleHeaders("partner"),
    data: {
      type: "inbound",
      sku: "DMPBYDIMP201",
      quantity: 3,
      reference: "BULK-IMPORT-API",
      location: "BNE receiving",
    },
  });

  expect(scan.ok()).toBeTruthy();
  const scanBody = await scan.json();
  expect(scanBody.movement.sku).toBe("DM-BYD-IMP-201");
});

test("admin can create fitment rules for trade vehicle lookup", async ({
  request,
}) => {
  const product = await request.post("/api/products", {
    headers: roleHeaders("admin"),
    data: {
      sku: "DM-GWM-FIT-API",
      brand: "GWM",
      name: "API Fitment Test Filter",
      category: "Service Filter",
      barcode: "DMPGWMFITAPI",
      status: "active",
    },
  });
  expect(product.status()).toBe(201);

  const fitment = await request.post("/api/fitment-rules", {
    headers: roleHeaders("admin"),
    data: {
      sku: "DM-GWM-FIT-API",
      make: "GWM",
      model: "Cannon Alpha",
      yearFrom: 2024,
      engine: "GW4D24",
      confidence: "confirm_vin",
    },
  });
  expect(fitment.status()).toBe(201);

  await request.post("/api/inventory-movement", {
    headers: roleHeaders("partner"),
    data: {
      type: "inbound",
      sku: "DMPGWMFITAPI",
      quantity: 2,
      reference: "FITMENT-API",
      location: "BNE receiving",
    },
  });

  const lookup = await request.post("/api/vehicle-lookup", {
    headers: roleHeaders("trade"),
    data: { query: "GWM Cannon Alpha filters" },
  });
  expect(lookup.ok()).toBeTruthy();
  const body = await lookup.json();
  expect(body.matches).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sku: "DM-GWM-FIT-API",
        available: 2,
      }),
    ]),
  );
});

test("admin can bulk import fitment rules for trade lookup", async ({
  request,
}) => {
  const product = await request.post("/api/products/import", {
    headers: roleHeaders("admin"),
    data: {
      rows: [
        {
          sku: "DM-GWM-FIT-BULK",
          brand: "GWM",
          name: "Bulk Fitment Test Filter",
          category: "Service Filter",
          barcode: "DMPGWMFITBULK",
          status: "active",
        },
      ],
    },
  });
  expect(product.ok()).toBeTruthy();

  const fitment = await request.post("/api/fitment-rules/import", {
    headers: roleHeaders("admin"),
    data: {
      rows: [
        {
          sku: "DM-GWM-FIT-BULK",
          make: "GWM",
          model: "Cannon Alpha",
          yearFrom: 2024,
          engine: "GW4D24",
          confidence: "confirm_vin",
        },
      ],
    },
  });

  expect(fitment.ok()).toBeTruthy();
  const fitmentBody = await fitment.json();
  expect(fitmentBody.summary).toMatchObject({ created: 1, failed: 0 });
  expect(fitmentBody.rules).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sku: "DM-GWM-FIT-BULK",
        vehicle: "GWM Cannon Alpha 2024-on",
      }),
    ]),
  );

  await request.post("/api/inventory-movement", {
    headers: roleHeaders("partner"),
    data: {
      type: "inbound",
      sku: "DMPGWMFITBULK",
      quantity: 2,
      reference: "FITMENT-BULK-API",
      location: "BNE receiving",
    },
  });

  const lookup = await request.post("/api/vehicle-lookup", {
    headers: roleHeaders("trade"),
    data: { query: "GWM Cannon Alpha filters" },
  });
  expect(lookup.ok()).toBeTruthy();
  const body = await lookup.json();
  expect(body.matches).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sku: "DM-GWM-FIT-BULK",
        available: 2,
      }),
    ]),
  );
});

test("protected APIs reject public requests", async ({ request }) => {
  const lookup = await request.post("/api/vehicle-lookup", {
    data: { query: "GWM Cannon Alpha filters" },
  });
  expect(lookup.status()).toBe(403);

  const order = await request.post("/api/orders", {
    data: {
      tradeAccountId: "acct-demo",
      lines: [{ sku: "DM-GWM-OF-001", quantity: 1 }],
    },
  });
  expect(order.status()).toBe(tradingEnabledForE2e ? 403 : 503);
  if (!tradingEnabledForE2e) {
    await expect(order.json()).resolves.toMatchObject({
      ok: false,
      code: "TRADING_DISABLED",
    });
  }

  const movement = await request.post("/api/inventory-movement", {
    data: {
      type: "inbound",
      sku: "DM-GWM-OF-001",
      quantity: 1,
      reference: "BNE-TEST",
    },
  });
  expect(movement.status()).toBe(403);

  const movementImport = await request.post("/api/inventory-movement/import", {
    data: {
      rows: [
        {
          type: "inbound",
          sku: "DM-GWM-OF-001",
          quantity: 1,
          reference: "PUBLIC-BULK",
        },
      ],
    },
  });
  expect(movementImport.status()).toBe(403);

  const admin = await request.get("/api/admin-state");
  expect(admin.status()).toBe(403);

  const adminExport = await request.get("/api/admin-export?type=catalogue");
  expect(adminExport.status()).toBe(403);

  const warehouseState = await request.get("/api/warehouse-state");
  expect(warehouseState.status()).toBe(403);

  const tradeState = await request.get("/api/trade-state");
  expect(tradeState.status()).toBe(403);

  const documentAccess = await request.get("/api/account-documents/DOC-404");
  expect(documentAccess.status()).toBe(403);

  const dispatch = await request.post("/api/orders/SO-404/dispatch");
  expect(dispatch.status()).toBe(tradingEnabledForE2e ? 403 : 503);
  if (!tradingEnabledForE2e) {
    await expect(dispatch.json()).resolves.toMatchObject({
      ok: false,
      code: "TRADING_DISABLED",
    });
  }

  const cancel = await request.post("/api/orders/SO-404/cancel");
  expect(cancel.status()).toBe(403);

  const approval = await request.post(
    "/api/trade-account-applications/TA-404/approve",
  );
  expect(approval.status()).toBe(403);

  const provision = await request.post(
    "/api/trade-account-applications/TA-404/provision-login",
  );
  expect(provision.status()).toBe(403);

  const product = await request.patch("/api/products/DM-GWM-OF-001", {
    data: { barcode: "PUBLIC-BARCODE" },
  });
  expect(product.status()).toBe(403);

  const productCreate = await request.post("/api/products", {
    data: {
      sku: "DM-GWM-PUBLIC-099",
      brand: "GWM",
      name: "Public Test Part",
      category: "Service Filter",
      barcode: "DMPGWMPUBLIC099",
    },
  });
  expect(productCreate.status()).toBe(403);

  const productImport = await request.post("/api/products/import", {
    data: {
      rows: [
        {
          sku: "DM-GWM-PUBLIC-IMPORT",
          brand: "GWM",
          name: "Public Import Part",
          category: "Service Filter",
          barcode: "DMPGWMPUBLICIMPORT",
          status: "draft",
        },
      ],
    },
  });
  expect(productImport.status()).toBe(403);

  const fitmentCreate = await request.post("/api/fitment-rules", {
    data: {
      sku: "DM-GWM-OF-001",
      make: "GWM",
      model: "Cannon Alpha",
      yearFrom: 2024,
      confidence: "confirm_vin",
    },
  });
  expect(fitmentCreate.status()).toBe(403);

  const fitmentImport = await request.post("/api/fitment-rules/import", {
    data: {
      rows: [
        {
          sku: "DM-GWM-OF-001",
          make: "GWM",
          model: "Cannon Alpha",
          yearFrom: 2024,
          confidence: "confirm_vin",
        },
      ],
    },
  });
  expect(fitmentImport.status()).toBe(403);
});
