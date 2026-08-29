import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRepository } from "../lib/memoryRepository";
import { buildWarehouseLabelPrintScope, buildWarehouseReceiptScope } from "../lib/warehouseLabels";
import { prepareWarehouseReceipt } from "../lib/warehouseReceiving";

const selection = { shipmentId: "shipment-test-1", cartonNumbers: ["C001"] };

async function confirmReceipt(repository: MemoryRepository) {
  const [expected, shipment] = await Promise.all([
    repository.getWarehouseExpectedReceipt(selection),
    repository.getPrearrivalShipment(selection.shipmentId),
  ]);
  if (!expected.ok || !shipment.ok) throw new Error("Test receipt scope was not available.");

  const printJob = await repository.createWarehouseLabelPrintJobWithItems({
    templateId: "unit_product",
    requestedQuantity: 18,
    payloadSnapshot: buildWarehouseLabelPrintScope(expected.receipt, "unit_product"),
    itemPayloadSnapshots: Array.from({ length: 18 }, (_, index) => ({ copy: index + 1 })),
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

describe("receipt-scoped warehouse putaway", () => {
  const repository = new MemoryRepository();

  beforeEach(async () => {
    await repository.resetForTests();
  });

  it("moves only a confirmed receipt's staged quantity to the scanned destination", async () => {
    await confirmReceipt(repository);

    const result = await repository.putAwayWarehouseReceipt({
      ...selection,
      productBarcode: "DMPGWMOF001",
      destinationLocation: "BNE-A01-03",
      quantity: 2,
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
    }, { actorId: "demo-partner-user" });

    expect(result).toMatchObject({
      ok: true,
      sourceLocation: "BNE-RECEIVING-STAGING",
      destinationLocation: "BNE-A01-03",
      remainingQuantity: 10,
      movement: expect.objectContaining({
        sku: "DM-GWM-OF-001",
        movement: "Putaway",
        quantity: 2,
        reference: expect.stringContaining("memory-receipt-session"),
      }),
    });
  });

  it("rejects putaway before a matching receipt is confirmed", async () => {
    await expect(repository.putAwayWarehouseReceipt({
      ...selection,
      productBarcode: "DMPGWMOF001",
      destinationLocation: "BNE-A01-03",
      quantity: 1,
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
    })).resolves.toEqual({
      ok: false,
      message: "A confirmed receipt with staged stock is required before putaway.",
    });
  });

  it("does not move more than the receipt's remaining staging balance", async () => {
    await confirmReceipt(repository);

    const result = await repository.putAwayWarehouseReceipt({
      ...selection,
      productBarcode: "DMPGWMOF001",
      destinationLocation: "BNE-A01-03",
      quantity: 13,
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
    });

    expect(result).toEqual({
      ok: false,
      message: "Putaway quantity exceeds the receipt's remaining staged quantity.",
    });
  });
});
