import { describe, expect, it } from "vitest";
import { MemoryRepository } from "../lib/memoryRepository";

describe("repository boundary", () => {
  it("returns admin state through repository contract", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const state = await repository.getAdminState();

    expect(repository.mode).toBe("memory");
    expect(state.metrics.activeSkus).toBeGreaterThan(0);
    expect(state.catalogue.some((row) => row.sku === "DM-GWM-OF-001")).toBe(true);
    expect(state.fitmentRules.some((rule) => rule.sku === "DM-GWM-OF-001")).toBe(true);
    expect(state.purchaseBatches.some((batch) => batch.batchNo === "BNE-2026-06-PILOT")).toBe(true);
    expect(
      state.pricingRules.some(
        (rule) => rule.id === "PRICE-GWM-SERVICE-FILTERS" && rule.unitPriceExGstCents === 2595,
      ),
    ).toBe(true);
    expect(state.rfqReviews.some((review) => review.id === "RFQ-GWM-ALPHA-FUEL-FILTER")).toBe(true);
    expect(state.userRoles.some((user) => user.role === "admin")).toBe(true);
  });

  it("applies movement and exposes the movement through admin state", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const movement = await repository.applyInventoryMovement({
      type: "inbound",
      sku: "DM-GWM-OF-001",
      quantity: 2,
      reference: "BNE-TEST",
      location: "BNE-A01-03",
    });

    expect(movement.ok).toBe(true);

    const state = await repository.getAdminState();
    expect(state.stockMovements[0]).toMatchObject({
      sku: "DM-GWM-OF-001",
      movement: "Inbound",
      quantity: 2,
      reference: "BNE-TEST",
    });
    expect(state.purchaseBatches[0]).toMatchObject({
      batchNo: "BNE-TEST",
      sku: "DM-GWM-OF-001",
      receivedQuantity: 2,
      purchaseRef: "BNE-TEST",
    });
  });

  it("records putaway movements without changing aggregate stock", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const movement = await repository.applyInventoryMovement(
      {
        type: "putaway",
        sku: "DMPGWMOF001",
        quantity: 1,
        reference: "PUT-TEST",
        fromLocation: "BNE receiving",
        toLocation: "BNE-A01-03",
      },
      { actorId: "user-warehouse-1" },
    );

    expect(movement.ok).toBe(true);
    if (!movement.ok) return;
    expect(movement.movement).toMatchObject({
      sku: "DM-GWM-OF-001",
      movement: "Putaway",
      quantity: 1,
      location: "BNE-A01-03",
      createdBy: "user-warehouse-1",
    });

    const state = await repository.getAdminState();
    const row = state.catalogue.find((item) => item.sku === "DM-GWM-OF-001");
    expect(row).toMatchObject({ onHand: 42, reserved: 1, quarantine: 0, available: 41 });
  });

  it("resolves scanner barcodes and aliases to the canonical SKU", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const barcodeMovement = await repository.applyInventoryMovement({
      type: "inbound",
      sku: "DMPGWMOF001",
      quantity: 1,
      reference: "SCAN-BARCODE",
      location: "BNE-A01-03",
    });
    const aliasMovement = await repository.applyInventoryMovement({
      type: "dispatch",
      sku: "OF-GWM-001",
      quantity: 1,
      reference: "SCAN-ALIAS",
      location: "BNE dispatch",
    });

    expect(barcodeMovement.ok).toBe(true);
    expect(aliasMovement.ok).toBe(true);
    if (barcodeMovement.ok) expect(barcodeMovement.movement.sku).toBe("DM-GWM-OF-001");
    if (aliasMovement.ok) expect(aliasMovement.movement.sku).toBe("DM-GWM-OF-001");
  });

  it("updates product master scanner fields for admin operations", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const update = await repository.updateProductMaster({
      sku: "DM-GWM-OF-001",
      barcode: "DMP-GWM-OF-001-NEW",
      oemPartNumber: "GWM-NEW-OEM-OF",
      status: "active",
    });

    expect(update.ok).toBe(true);
    if (!update.ok) return;
    expect(update.product).toMatchObject({
      sku: "DM-GWM-OF-001",
      barcode: "DMP-GWM-OF-001-NEW",
      oemPartNumber: "GWM-NEW-OEM-OF",
      status: "active",
    });

    const movement = await repository.applyInventoryMovement({
      type: "inbound",
      sku: "GWM-NEW-OEM-OF",
      quantity: 1,
      reference: "MASTER-SCAN",
      location: "BNE receiving",
    });

    expect(movement.ok).toBe(true);
    if (movement.ok) expect(movement.movement.sku).toBe("DM-GWM-OF-001");
  });

  it("creates product master records before warehouse receiving scans", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const created = await repository.createProductMaster({
      sku: "DM-GWM-NEW-099",
      brand: "GWM",
      name: "Genuine Test Service Part",
      category: "Service Filter",
      barcode: "DMPGWMNEW099",
      oemPartNumber: "GWM-OEM-NEW-099",
      status: "active",
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.product).toMatchObject({
      sku: "DM-GWM-NEW-099",
      barcode: "DMPGWMNEW099",
      oemPartNumber: "GWM-OEM-NEW-099",
      onHand: 0,
      available: 0,
    });

    const movement = await repository.applyInventoryMovement({
      type: "inbound",
      sku: "GWM-OEM-NEW-099",
      quantity: 3,
      reference: "NEW-SKU-INBOUND",
      location: "BNE receiving",
    });

    expect(movement.ok).toBe(true);
    if (movement.ok) expect(movement.movement.sku).toBe("DM-GWM-NEW-099");

    const state = await repository.getAdminState();
    expect(state.catalogue.find((row) => row.sku === "DM-GWM-NEW-099")).toMatchObject({
      onHand: 3,
      available: 3,
    });
  });

  it("creates fitment rules so new stocked SKUs can appear in vehicle lookup", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const created = await repository.createProductMaster({
      sku: "DM-GWM-FIT-099",
      brand: "GWM",
      name: "Fitment Test Filter",
      category: "Service Filter",
      barcode: "DMPGWMFIT099",
      status: "active",
    });
    expect(created.ok).toBe(true);

    const rule = await repository.createFitmentRule({
      sku: "DM-GWM-FIT-099",
      make: "GWM",
      model: "Cannon Alpha",
      yearFrom: 2024,
      engine: "GW4D24",
      confidence: "confirm_vin",
    });
    expect(rule.ok).toBe(true);

    await repository.applyInventoryMovement({
      type: "inbound",
      sku: "DMPGWMFIT099",
      quantity: 4,
      reference: "FITMENT-INBOUND",
    });

    const result = await repository.lookupVehicle({ query: "GWM Cannon Alpha filters" });
    expect(result.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sku: "DM-GWM-FIT-099",
          available: 4,
          fitmentConfidence: "confirm_vin",
        }),
      ]),
    );

    const state = await repository.getAdminState();
    expect(state.lookupRequests[0]).toMatchObject({
      tradeAccountId: undefined,
      query: "GWM Cannon Alpha filters",
      vehicle: "GWM Cannon Alpha 2024",
      matchCount: expect.any(Number),
    });
  });

  it("records trade lookup requests for admin demand review", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    await repository.lookupVehicle(
      {
        rego: "QLD 24ALPHA",
        vin: "LGWDCF196RM608238",
        query: "GWM Cannon Alpha fuel filter",
      },
      { actorId: "user-trade-1", tradeAccountId: "acct-demo" },
    );

    const state = await repository.getAdminState();
    expect(state.lookupRequests[0]).toMatchObject({
      tradeAccountId: "acct-demo",
      rego: "QLD 24ALPHA",
      vin: "LGWDCF196RM608238",
      query: "GWM Cannon Alpha fuel filter",
      vehicle: "GWM Cannon Alpha 2024",
      createdBy: "user-trade-1",
    });
    expect(state.lookupRequests[0].matchCount).toBeGreaterThan(0);
  });

  it("records quarantine movements and review outcomes", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const movement = await repository.applyInventoryMovement(
      {
        type: "quarantine",
        sku: "DM-GWM-OF-001",
        quantity: 3,
        reference: "RET-QA-1",
        location: "BNE quarantine",
      },
      { actorId: "user-warehouse-1" },
    );

    expect(movement.ok).toBe(true);
    if (!movement.ok) return;
    expect(movement.movement).toMatchObject({
      sku: "DM-GWM-OF-001",
      movement: "Quarantine",
      quantity: 3,
      createdBy: "user-warehouse-1",
    });

    const release = await repository.applyInventoryMovement(
      {
        type: "adjustment",
        sku: "DM-GWM-OF-001",
        quantity: 1,
        reference: "QA-RELEASE-1",
        location: "BNE quarantine",
        quarantineAction: "release",
      },
      { actorId: "user-warehouse-1" },
    );
    expect(release.ok).toBe(true);
    if (!release.ok) return;
    expect(release.movement).toMatchObject({
      sku: "DM-GWM-OF-001",
      movement: "Quarantine Release",
      quantity: 1,
    });

    const writeoff = await repository.applyInventoryMovement(
      {
        type: "adjustment",
        sku: "DM-GWM-OF-001",
        quantity: 1,
        reference: "QA-WRITEOFF-1",
        location: "BNE quarantine",
        quarantineAction: "writeoff",
      },
      { actorId: "user-warehouse-1" },
    );
    expect(writeoff.ok).toBe(true);
    if (!writeoff.ok) return;
    expect(writeoff.movement).toMatchObject({
      sku: "DM-GWM-OF-001",
      movement: "Quarantine Write-off",
      quantity: 1,
    });

    const state = await repository.getAdminState();
    const row = state.catalogue.find((item) => item.sku === "DM-GWM-OF-001");
    expect(row).toMatchObject({
      onHand: 41,
      reserved: 1,
      quarantine: 1,
      available: 39,
    });
  });

  it("records stock adjustments and updates available inventory", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const movement = await repository.applyInventoryMovement(
      {
        type: "adjustment",
        sku: "DM-GWM-OF-001",
        quantity: 2,
        reference: "COUNT-TEST",
        location: "BNE-A01-03",
        adjustmentDirection: "decrease",
      },
      { actorId: "user-warehouse-1" },
    );

    expect(movement.ok).toBe(true);
    if (!movement.ok) return;
    expect(movement.movement).toMatchObject({
      sku: "DM-GWM-OF-001",
      movement: "Adjustment",
      quantity: 2,
      location: "BNE-A01-03",
      createdBy: "user-warehouse-1",
    });

    const state = await repository.getAdminState();
    const row = state.catalogue.find((item) => item.sku === "DM-GWM-OF-001");
    expect(row).toMatchObject({
      onHand: 40,
      reserved: 1,
      quarantine: 0,
      available: 39,
    });
  });

  it("carries write context into movement and order audit fields", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const movement = await repository.applyInventoryMovement(
      {
        type: "inbound",
        sku: "DM-GWM-AF-002",
        quantity: 1,
        reference: "BNE-AUDIT",
      },
      { actorId: "user-warehouse-1" },
    );

    expect(movement.ok).toBe(true);
    if (movement.ok) expect(movement.movement.createdBy).toBe("user-warehouse-1");

    const order = await repository.submitOrder(
      {
        tradeAccountId: "acct-demo",
        lines: [{ sku: "DM-GWM-AF-002", quantity: 1 }],
      },
      { actorId: "user-trade-1" },
    );

    expect(order.ok).toBe(true);
    if (order.ok) expect(order.order.createdBy).toBe("user-trade-1");
  });

  it("returns trade account order records without exposing other accounts", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    await repository.submitOrder({
      tradeAccountId: "acct-demo",
      poNumber: "JOB-MINE",
      lines: [{ sku: "DM-GWM-AF-002", quantity: 1 }],
    });
    await repository.submitOrder({
      tradeAccountId: "acct-other",
      poNumber: "JOB-OTHER",
      lines: [{ sku: "DM-GWM-CF-003", quantity: 1 }],
    });

    const state = await repository.getTradeAccountState("acct-demo");

    expect(state.tradeAccountId).toBe("acct-demo");
    expect(state.orders.map((order) => order.poNumber)).toEqual(["JOB-MINE"]);
    expect(state.accountDocuments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tradeAccountId: "acct-demo",
          type: "invoice",
        }),
        expect.objectContaining({
          tradeAccountId: "acct-demo",
          type: "statement",
          reference: expect.stringMatching(/^STMT-\d{4}-\d{2}-acct-demo$/),
        }),
      ]),
    );
    expect(state.accountDocuments.some((document) => document.tradeAccountId === "acct-other")).toBe(false);
  });

  it("dispatches a submitted order and records warehouse actor", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const order = await repository.submitOrder({
      tradeAccountId: "acct-demo",
      lines: [{ sku: "DM-GWM-OF-001", quantity: 1 }],
    });
    expect(order.ok).toBe(true);
    if (!order.ok) return;

    const dispatch = await repository.dispatchOrder(
      order.order.id,
      { scans: [{ sku: "DMPGWMOF001", quantity: 1 }] },
      { actorId: "user-warehouse-1" },
    );

    expect(dispatch.ok).toBe(true);
    if (!dispatch.ok) return;
    expect(dispatch.order.status).toBe("dispatched");
    expect(dispatch.movements[0]).toMatchObject({
      sku: "DM-GWM-OF-001",
      movement: "Dispatch",
      createdBy: "user-warehouse-1",
    });

    const tradeState = await repository.getTradeAccountState("acct-demo");
    expect(tradeState.accountDocuments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "invoice", reference: `INV-${order.order.id}` }),
        expect.objectContaining({ type: "delivery_record", reference: `DEL-${order.order.id}` }),
        expect.objectContaining({ type: "statement", reference: expect.stringMatching(/^STMT-\d{4}-\d{2}-acct-demo$/) }),
      ]),
    );

    const invoice = tradeState.accountDocuments.find((document) => document.type === "invoice");
    expect(invoice).toBeTruthy();
    if (!invoice) return;

    const access = await repository.getAccountDocumentAccess(invoice.id, "acct-demo");
    expect(access.ok).toBe(true);
    if (access.ok) expect(access.downloadUrl).toContain("data:text/plain");

    const forbidden = await repository.getAccountDocumentAccess(invoice.id, "acct-other");
    expect(forbidden).toEqual({ ok: false, message: "Account document was not found." });

    const adminState = await repository.getAdminState();
    expect(adminState.accountDocuments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "invoice", reference: `INV-${order.order.id}` }),
        expect.objectContaining({ type: "delivery_record", reference: `DEL-${order.order.id}` }),
      ]),
    );
  });

  it("cancels a submitted order and releases reserved stock", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const order = await repository.submitOrder({
      tradeAccountId: "acct-demo",
      lines: [{ sku: "DM-GWM-OF-001", quantity: 1 }],
    });
    expect(order.ok).toBe(true);
    if (!order.ok) return;

    const reserved = await repository.getAdminState();
    expect(reserved.catalogue.find((row) => row.sku === "DM-GWM-OF-001")?.reserved).toBe(2);

    const cancelled = await repository.cancelOrder(order.order.id, { tradeAccountId: "acct-demo" });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.order.status).toBe("cancelled");
    expect(cancelled.inventory.find((row) => row.sku === "DM-GWM-OF-001")?.reserved).toBe(1);

    const wrongAccount = await repository.cancelOrder(order.order.id, { tradeAccountId: "acct-other" });
    expect(wrongAccount.ok).toBe(false);
  });

  it("stores trade account applications for admin review", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const result = await repository.submitTradeAccountApplication({
      accountName: "Northside Workshop",
      abn: "12345678901",
      contactName: "Jamie Lee",
      contactEmail: "jamie@example.com",
      contactPhone: "0400000000",
      postcode: "4000",
      notes: "Interested in GWM and BYD service parts.",
    });

    expect(result.ok).toBe(true);
    const state = await repository.getAdminState();
    expect(state.accountApplications[0]).toMatchObject({
      accountName: "Northside Workshop",
      contactEmail: "jamie@example.com",
      status: "pending",
    });
  });

  it("provisions trade account login credentials for approved workshop access", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const result = await repository.submitTradeAccountApplication({
      accountName: "Login Ready Workshop",
      contactName: "Morgan Lee",
      contactEmail: "morgan@example.com",
      contactPhone: "0400000002",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const provisioned = await repository.provisionTradeAccountLogin(result.application.id);

    expect(provisioned.ok).toBe(true);
    if (!provisioned.ok) return;
    expect(provisioned.application.status).toBe("approved");
    expect(provisioned.login).toMatchObject({
      email: "morgan@example.com",
      created: true,
    });
    expect(provisioned.login.temporaryPassword).toBeTruthy();
  });

  it("approves pending trade account applications and removes them from admin queue", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const result = await repository.submitTradeAccountApplication({
      accountName: "Southside Workshop",
      contactName: "Taylor Smith",
      contactEmail: "taylor@example.com",
      contactPhone: "0400000001",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const approved = await repository.approveTradeAccountApplication(result.application.id);
    expect(approved.ok).toBe(true);
    if (approved.ok) expect(approved.application.status).toBe("approved");

    const state = await repository.getAdminState();
    expect(state.accountApplications.some((application) => application.id === result.application.id)).toBe(false);
  });
});
