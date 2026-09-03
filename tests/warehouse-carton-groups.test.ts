import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRepository } from "../lib/memoryRepository";
import { receiptFromPackingListRevision, validatePackingListRevision, type PackingListRevisionInputV3 } from "../lib/prearrivalShipment";
import { buildWarehouseReceiptScope, buildWarehouseLabelPrintScope, filterWarehouseExpectedReceipt, findWarehouseSourceScope } from "../lib/warehouseLabels";
import { prepareWarehouseReceipt } from "../lib/warehouseReceiving";

const input: PackingListRevisionInputV3 = {
  schemaVersion: 3, shipmentId: "shipment-test-1", physicalPalletCount: 4,
  cartons: [
    { sourceCartonNumber: "7#8#9#", kind: "carton_group", physicalCartonCount: 3, memberCartonNumbers: ["7#", "8#", "9#"], sourcePalletNumber: null, lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 10 }] },
    { sourceCartonNumber: "10#11#", kind: "carton_group", physicalCartonCount: 2, memberCartonNumbers: ["10#", "11#"], sourcePalletNumber: null, lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 10 }] },
  ],
};
const repository = new MemoryRepository();

async function setup() {
  const validation = validatePackingListRevision(input);
  if (!validation.ok) throw new Error(validation.message);
  const saved = await repository.createPackingListRevision(validation.revision);
  if (!saved.ok) throw new Error(saved.message);
  const confirmed = await repository.confirmPackingListRevision(saved.revision.id);
  if (!confirmed.ok) throw new Error(confirmed.message);
}

async function prepare(cartonNumbers: string[], key: string, mode: "scan_each" | "counted_quantity" = "counted_quantity") {
  const shipment = await repository.getPrearrivalShipment(input.shipmentId);
  if (!shipment.ok) throw new Error(shipment.message);
  const selected = filterWarehouseExpectedReceipt(shipment.shipment, { shipmentId: input.shipmentId, cartonNumbers });
  const scope = buildWarehouseReceiptScope(selected, shipment.shipment.productBarcodes);
  const quantity = scope.lines[0].expectedQuantity;
  const prepared = prepareWarehouseReceipt(mode === "scan_each" ? {
    expectedScope: scope, mode, scannedProductBarcodes: Array(quantity).fill("DMPGWMOF001"),
  } : {
    expectedScope: scope, mode, scannedProductBarcodes: ["DMPGWMOF001"], countedLines: [{ productBarcode: "DMPGWMOF001", actualQuantity: quantity }],
  });
  if (!prepared.ok) throw new Error(prepared.message);
  const job = await repository.createWarehouseLabelPrintJobWithItems({
    templateId: "unit_product",
    payloadSnapshot: scope,
    requestedQuantity: quantity,
    itemPayloadSnapshots: Array.from({ length: quantity }, () => ({ sku: scope.lines[0].sku })),
  });
  if (!job.ok) throw new Error(job.message);
  await repository.recordWarehouseLabelPrintOutcome(job.job.id, "printed");
  return { scope, mode, lines: prepared.lines, idempotencyKey: key };
}

describe("source carton groups downstream", () => {
  beforeEach(async () => { await repository.resetForTests(); await setup(); });

  it("retains physical carton metadata without multiplying product labels", async () => {
    const expected = await repository.getWarehouseExpectedReceipt({ shipmentId: input.shipmentId, cartonNumbers: ["7#8#9#"] });
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;
    expect(expected.receipt.cartons).toEqual([{ sourceCartonNumber: "7#8#9#", kind: "carton_group", physicalCartonCount: 3, memberCartonNumbers: ["7#", "8#", "9#"] }]);
    expect(buildWarehouseLabelPrintScope(expected.receipt, "unit_product").lines).toEqual([{ sku: "DM-GWM-OF-001", productBarcode: "DMPGWMOF001", expectedQuantity: 10 }]);
  });

  it("locates a member's parent without turning the member into a receipt scope", () => {
    const receipt = receiptFromPackingListRevision(input);
    expect(findWarehouseSourceScope(receipt, " 8# ")?.sourceCartonNumber).toBe("7#8#9#");
    expect(findWarehouseSourceScope(receipt, "404#")).toBeUndefined();
    for (const cartonNumbers of [["8#"], ["7#8#9#", "8#"], ["7#8#9#", "404#"], ["7#8#9#", " 7#8#9# "]]) {
      expect(() => filterWarehouseExpectedReceipt(receipt, { shipmentId: input.shipmentId, cartonNumbers })).toThrow();
    }
  });

  it("receives disjoint groups with the same SKU through both modes and safely replays", async () => {
    const before = await repository.getAdminState();
    for (const [index, group] of input.cartons.entries()) {
      const request = await prepare([group.sourceCartonNumber], `group-${index}`, index === 0 ? "scan_each" : "counted_quantity");
      const created = await repository.createWarehouseReceiptSession(request);
      if (!created.ok) throw new Error(created.message);
      const confirmed = await repository.confirmWarehouseReceipt(created.session.id);
      expect(confirmed).toMatchObject({ ok: true, session: { status: "confirmed", stagingLocation: "BNE-RECEIVING-STAGING" } });
      expect(await repository.createWarehouseReceiptSession(request)).toMatchObject({ ok: true, session: { id: created.session.id } });
      expect(await repository.confirmWarehouseReceipt(created.session.id)).toEqual(confirmed);
    }
    const after = await repository.getAdminState();
    expect(after.stockMovements.length - before.stockMovements.length).toBe(2);
    expect(after.catalogue.find(p => p.sku === "DM-GWM-OF-001")!.onHand - before.catalogue.find(p => p.sku === "DM-GWM-OF-001")!.onHand).toBe(20);
  });

  it("rejects different-key same-scope and full-shipment overlap without changing stock", async () => {
    const request = await prepare(["7#8#9#"], "first");
    const first = await repository.createWarehouseReceiptSession(request);
    if (!first.ok) throw new Error(first.message);
    await repository.confirmWarehouseReceipt(first.session.id);
    const before = await repository.getAdminState();
    expect(await repository.createWarehouseReceiptSession({ ...request, idempotencyKey: "duplicate" })).toMatchObject({ ok: false });
    expect(await repository.createWarehouseReceiptSession(await prepare(["7#8#9#", "10#11#"], "full"))).toMatchObject({ ok: false });
    expect((await repository.getAdminState()).stockMovements).toEqual(before.stockMovements);
  });

  it("allows only one overlapping confirmation even when both sessions already exist", async () => {
    const a = await repository.createWarehouseReceiptSession(await prepare(["7#8#9#"], "race-a"));
    const b = await repository.createWarehouseReceiptSession(await prepare(["7#8#9#", "10#11#"], "race-b"));
    if (!a.ok || !b.ok) throw new Error("Both independent drafts must be available before confirmation.");
    const before = await repository.getAdminState();
    const results = await Promise.all([repository.confirmWarehouseReceipt(a.session.id), repository.confirmWarehouseReceipt(b.session.id)]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect((await repository.getAdminState()).stockMovements.length - before.stockMovements.length).toBe(1);
  });

  it("rejects a changed payload reusing a prior idempotency key", async () => {
    const request = await prepare(["7#8#9#"], "bound-key");
    await repository.createWarehouseReceiptSession(request);
    expect(await repository.createWarehouseReceiptSession({ ...request, lines: [{ ...request.lines[0], actualQuantity: 8 }] })).toMatchObject({ ok: false });
  });

  it("prevents re-receiving through a renamed or split used scope, while allowing pallet metadata updates", async () => {
    const request = await prepare(["7#8#9#"], "used-scope");
    const created = await repository.createWarehouseReceiptSession(request);
    if (!created.ok) throw new Error(created.message);
    await repository.confirmWarehouseReceipt(created.session.id);
    const renamed = validatePackingListRevision({ ...input, cartons: [{ ...input.cartons[0], sourceCartonNumber: "RENAMED" }, input.cartons[1]] });
    if (!renamed.ok) throw new Error(renamed.message);
    const saved = await repository.createPackingListRevision(renamed.revision);
    if (!saved.ok) throw new Error(saved.message);
    expect(await repository.confirmPackingListRevision(saved.revision.id)).toMatchObject({ ok: false });
    const mapping = validatePackingListRevision({ ...input, cartons: [{ ...input.cartons[0], sourcePalletNumber: "PALLET-A" }, input.cartons[1]] });
    if (!mapping.ok) throw new Error(mapping.message);
    const metadata = await repository.createPackingListRevision(mapping.revision);
    if (!metadata.ok) throw new Error(metadata.message);
    expect(await repository.confirmPackingListRevision(metadata.revision.id)).toMatchObject({ ok: true });
    expect(await repository.createWarehouseReceiptSession({ ...request, idempotencyKey: "after-mapping" })).toMatchObject({ ok: false });
  });
});
