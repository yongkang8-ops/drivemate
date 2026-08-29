import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  parseInventoryLocationCode,
  parseLocationCodeBatch,
} from "../lib/inventoryLocations";
import { MemoryRepository } from "../lib/memoryRepository";
import { buildWarehouseLabelPrintScope, buildWarehouseReceiptScope } from "../lib/warehouseLabels";
import { prepareWarehouseReceipt } from "../lib/warehouseReceiving";

describe("inventory location codes", () => {
  it("creates the immutable DMLOC identity for a canonical Brisbane location", () => {
    expect(parseInventoryLocationCode(" bne-a01-03 ")).toEqual({
      ok: true,
      locationCode: "BNE-A01-03",
      barcode: "DMLOC:BNE-A01-03",
      warehouse: "Brisbane",
      zone: "A01",
      binCode: "03",
    });
  });

  it("parses every middle segment as the zone while preserving the final bin code", () => {
    expect(parseInventoryLocationCode("BNE-A-01-03")).toEqual({
      ok: true,
      locationCode: "BNE-A-01-03",
      barcode: "DMLOC:BNE-A-01-03",
      warehouse: "Brisbane",
      zone: "A-01",
      binCode: "03",
    });
  });

  it("accepts between two and four segments after BNE only", () => {
    expect(parseInventoryLocationCode("BNE-A-01-03-04")).toMatchObject({ ok: true });
    expect(parseInventoryLocationCode("BNE-A-01-03-04-05")).toEqual({
      ok: false,
      message: "Location code must use the BNE-<segment>-<segment> format.",
    });
  });

  it("rejects internal whitespace while allowing only leading and trailing whitespace", () => {
    for (const value of ["BNE-A 01-03", "BNE-A\t01-03", "BNE-A01-\n03"]) {
      expect(parseInventoryLocationCode(value)).toEqual({
        ok: false,
        message: "Location code must use the BNE-<segment>-<segment> format.",
      });
    }
  });

  it("rejects a bare carriage return inside a single location code", () => {
    expect(parseInventoryLocationCode("BNE-A01-\r03")).toEqual({
      ok: false,
      message: "Location code must use the BNE-<segment>-<segment> format.",
    });
  });

  it("normalises a reviewed batch and keeps each canonical code once", () => {
    expect(parseLocationCodeBatch("\n bne-a01-01 \nBNE-A01-01\n bne-a-01-02\n")).toEqual({
      ok: true,
      locations: [
        {
          ok: true,
          locationCode: "BNE-A01-01",
          barcode: "DMLOC:BNE-A01-01",
          warehouse: "Brisbane",
          zone: "A01",
          binCode: "01",
        },
        {
          ok: true,
          locationCode: "BNE-A-01-02",
          barcode: "DMLOC:BNE-A-01-02",
          warehouse: "Brisbane",
          zone: "A-01",
          binCode: "02",
        },
      ],
    });
  });

  it("rejects an invalid reviewed batch line with its original line number", () => {
    expect(parseLocationCodeBatch("BNE-A01-01\nbne-a01-01\nAISLE-A")).toEqual({
      ok: false,
      message: "Line 3 must use a canonical BNE location code.",
    });
  });

  it.each([
    ["space", "BNE-A01-01\nBNE-A 01-02"],
    ["tab", "BNE-A01-01\nBNE-A\t01-02"],
    ["bare carriage return", "BNE-A01-01\nBNE-A01-\r02"],
  ])("reports the original line number for a batch code containing an internal %s", (_kind, value) => {
    expect(parseLocationCodeBatch(value)).toEqual({
      ok: false,
      message: "Line 2 must use a canonical BNE location code.",
    });
  });

  it("keeps a CRLF-separated reviewed batch valid", () => {
    expect(parseLocationCodeBatch("BNE-A01-01\r\nbne-a-01-02\r\n")).toMatchObject({
      ok: true,
      locations: [
        { locationCode: "BNE-A01-01", barcode: "DMLOC:BNE-A01-01" },
        { locationCode: "BNE-A-01-02", barcode: "DMLOC:BNE-A-01-02" },
      ],
    });
  });
});

describe("inventory location migration preflight", () => {
  it("preserves non-Brisbane warehouse identity instead of silently backfilling BNE", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase", "migrations", "20260902_v17_inventory_location_master.sql"),
      "utf8",
    );

    expect(migration).toMatch(/set location_code = case\s+when upper\(trim\(warehouse\)\) = 'BRISBANE'\s+then 'BNE-' \|\| upper\(trim\(zone\)\) \|\| '-' \|\| upper\(trim\(bin_code\)\)\s+else upper\(trim\(warehouse\)\) \|\| '-' \|\| upper\(trim\(zone\)\) \|\| '-' \|\| upper\(trim\(bin_code\)\)\s+end/s);
    expect(migration).toMatch(/new\.location_code := case\s+when upper\(trim\(new\.warehouse\)\) = 'BRISBANE'\s+then 'BNE-' \|\| upper\(trim\(new\.zone\)\) \|\| '-' \|\| upper\(trim\(new\.bin_code\)\)\s+else upper\(trim\(new\.warehouse\)\) \|\| '-' \|\| upper\(trim\(new\.zone\)\) \|\| '-' \|\| upper\(trim\(new\.bin_code\)\)\s+end/s);
    expect(migration).not.toContain("Legacy inventory location insert only supports Brisbane");
  });
});

const receiptSelection = { shipmentId: "shipment-test-1", cartonNumbers: ["C001"] };

async function confirmReceiptForLocationBalance(repository: MemoryRepository) {
  const [expected, shipment] = await Promise.all([
    repository.getWarehouseExpectedReceipt(receiptSelection),
    repository.getPrearrivalShipment(receiptSelection.shipmentId),
  ]);
  if (!expected.ok || !shipment.ok) throw new Error("Test receipt scope was not available.");

  const printJob = await repository.createWarehouseLabelPrintJob({
    templateId: "unit_product",
    requestedQuantity: 18,
    payloadSnapshot: buildWarehouseLabelPrintScope(expected.receipt, "unit_product"),
  });
  if (!printJob.ok) throw new Error(printJob.message);
  await repository.recordWarehouseLabelPrintOutcome(printJob.job.id, "printed");

  const scope = buildWarehouseReceiptScope(expected.receipt, shipment.shipment.productBarcodes);
  const prepared = prepareWarehouseReceipt({
    expectedScope: scope,
    mode: "counted_quantity",
    scannedProductBarcodes: ["DMPGWMOF001", "DMPGWMAF002"],
    countedLines: [
      { productBarcode: "DMPGWMOF001", actualQuantity: 12 },
      { productBarcode: "DMPGWMAF002", actualQuantity: 6 },
    ],
  });
  if (!prepared.ok) throw new Error(prepared.message);

  const session = await repository.createWarehouseReceiptSession({
    scope,
    mode: "counted_quantity",
    lines: prepared.lines,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  });
  if (!session.ok) throw new Error(session.message);
  const confirmed = await repository.confirmWarehouseReceipt(session.session.id, {
    actorId: "demo-partner-user",
  });
  if (!confirmed.ok) throw new Error(confirmed.message);
}

describe("inventory location master repository", () => {
  const repository = new MemoryRepository();

  beforeEach(async () => {
    await repository.resetForTests();
  });

  async function createLocation(locationCode = "BNE-A01-03") {
    const result = await repository.createInventoryLocationBatch({
      locations: [{
        locationCode,
        physicalDescription: "Aisle A01, shelf 03",
        notes: "Initial master-data registration",
      }],
    }, { actorId: "warehouse-admin" });
    if (!result.ok) throw new Error(result.message);
    return result.locations[0];
  }

  it("creates a batch with canonical immutable identities and registers the staging system source", async () => {
    const created = await repository.createInventoryLocationBatch({
      locations: [
        { locationCode: " bne-a01-03 ", physicalDescription: "Aisle A01, shelf 03" },
        { locationCode: "BNE-B02-01", notes: "Overflow shelf" },
      ],
    }, { actorId: "warehouse-admin" });

    expect(created).toMatchObject({
      ok: true,
      locations: [
        {
          locationCode: "BNE-A01-03",
          barcode: "DMLOC:BNE-A01-03",
          status: "active",
          isPutawayDestination: true,
          currentBalance: 0,
        },
        {
          locationCode: "BNE-B02-01",
          barcode: "DMLOC:BNE-B02-01",
          status: "active",
          isPutawayDestination: true,
        },
      ],
    });

    await expect(repository.listInventoryLocations({ barcode: "DMLOC:BNE-A01-03" })).resolves.toMatchObject([
      { locationCode: "BNE-A01-03", barcode: "DMLOC:BNE-A01-03" },
    ]);
    await expect(repository.listInventoryLocations({ barcode: "DMLOC:BNE-RECEIVING-STAGING" })).resolves.toMatchObject([
      {
        locationCode: "BNE-RECEIVING-STAGING",
        status: "active",
        isPutawayDestination: false,
      },
    ]);
    await expect(repository.resolveActivePhysicalDestination("DMLOC:BNE-RECEIVING-STAGING")).resolves.toBeNull();
  });

  it("updates descriptions and notes without changing identity and records lifecycle audit", async () => {
    const created = await createLocation();

    const updated = await repository.updateInventoryLocationNotes({
      id: created.id,
      physicalDescription: "Aisle A01, bay 03",
      notes: "Verified during warehouse walk-through",
    }, { actorId: "warehouse-manager" });

    expect(updated).toMatchObject({
      ok: true,
      location: {
        id: created.id,
        locationCode: "BNE-A01-03",
        barcode: "DMLOC:BNE-A01-03",
        physicalDescription: "Aisle A01, bay 03",
        notes: "Verified during warehouse walk-through",
      },
    });
    await expect(repository.listInventoryLocationAudit(created.id)).resolves.toMatchObject([
      { action: "created", actorId: "warehouse-admin", beforeValue: null },
      {
        action: "updated",
        actorId: "warehouse-manager",
        beforeValue: expect.objectContaining({
          physicalDescription: "Aisle A01, shelf 03",
          notes: "Initial master-data registration",
        }),
        afterValue: expect.objectContaining({
          physicalDescription: "Aisle A01, bay 03",
          notes: "Verified during warehouse walk-through",
        }),
      },
    ]);
  });

  it("resolves only active physical destinations and rejects disabled or archived locations", async () => {
    const created = await createLocation();

    await expect(repository.resolveActivePhysicalDestination(created.barcode)).resolves.toMatchObject({
      id: created.id,
      locationCode: "BNE-A01-03",
    });
    await expect(repository.setInventoryLocationStatus({ id: created.id, status: "disabled" })).resolves.toMatchObject({
      ok: true,
      location: { status: "disabled" },
    });
    await expect(repository.resolveActivePhysicalDestination(created.barcode)).resolves.toBeNull();

    await expect(repository.setInventoryLocationStatus({ id: created.id, status: "archived" })).resolves.toMatchObject({
      ok: true,
      location: { status: "archived" },
    });
    await expect(repository.resolveActivePhysicalDestination(created.barcode)).resolves.toBeNull();
  });

  it("blocks disabled or archived status while any confirmed putaway balance remains", async () => {
    const created = await createLocation();
    await confirmReceiptForLocationBalance(repository);
    const putaway = await repository.putAwayWarehouseReceipt({
      ...receiptSelection,
      productBarcode: "DMPGWMOF001",
      destinationLocation: created.locationCode,
      quantity: 2,
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
    }, { actorId: "demo-partner-user" });
    if (!putaway.ok) throw new Error(putaway.message);

    await expect(repository.listInventoryLocations({ barcode: created.barcode })).resolves.toMatchObject([
      { id: created.id, currentBalance: 2 },
    ]);
    await expect(repository.setInventoryLocationStatus({ id: created.id, status: "disabled" })).resolves.toEqual({
      ok: false,
      message: "Locations with on-hand, reserved, or quarantine balance cannot be disabled or archived.",
    });
    await expect(repository.setInventoryLocationStatus({ id: created.id, status: "archived" })).resolves.toEqual({
      ok: false,
      message: "Locations with on-hand, reserved, or quarantine balance cannot be disabled or archived.",
    });
  });

  it("derives staging and physical balances from confirmed receipt and putaway audit, then clears them on reset", async () => {
    const created = await createLocation();
    await confirmReceiptForLocationBalance(repository);

    await expect(repository.listInventoryLocations({ barcode: "DMLOC:BNE-RECEIVING-STAGING" })).resolves.toMatchObject([
      { locationCode: "BNE-RECEIVING-STAGING", currentBalance: 18 },
    ]);

    const putaway = await repository.putAwayWarehouseReceipt({
      ...receiptSelection,
      productBarcode: "DMPGWMOF001",
      destinationLocation: created.locationCode,
      quantity: 2,
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
    }, { actorId: "demo-partner-user" });
    if (!putaway.ok) throw new Error(putaway.message);

    await expect(repository.listInventoryLocations({ barcode: "DMLOC:BNE-RECEIVING-STAGING" })).resolves.toMatchObject([
      { locationCode: "BNE-RECEIVING-STAGING", currentBalance: 16 },
    ]);
    await expect(repository.listInventoryLocations({ barcode: created.barcode })).resolves.toMatchObject([
      { locationCode: created.locationCode, currentBalance: 2 },
    ]);

    await repository.resetForTests();
    await expect(repository.listInventoryLocations({ barcode: "DMLOC:BNE-RECEIVING-STAGING" })).resolves.toMatchObject([
      { locationCode: "BNE-RECEIVING-STAGING", currentBalance: 0 },
    ]);
    await expect(repository.listInventoryLocations({ barcode: created.barcode })).resolves.toEqual([]);
  });
});
