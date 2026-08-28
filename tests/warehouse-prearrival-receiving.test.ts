import { beforeEach, describe, expect, it } from "vitest";
import { buildWarehouseLabelPrintScope } from "../lib/warehouseLabels";
import { MemoryRepository } from "../lib/memoryRepository";

describe("pre-arrival shipment receipt scope", () => {
  const repository = new MemoryRepository();

  beforeEach(async () => {
    await repository.resetForTests();
  });

  it("filters an expected shipment by its source pallet while retaining carton and SKU quantities", async () => {
    const expected = await repository.getWarehouseExpectedReceipt({
      shipmentId: "shipment-test-1",
      palletNumbers: [" p001 "],
    });

    expect(expected).toEqual({
      ok: true,
      receipt: {
        shipmentId: "shipment-test-1",
        pallets: [{ sourcePalletNumber: "P001" }],
        cartons: [{ sourceCartonNumber: "C001", sourcePalletNumber: "P001" }],
        lines: [
          { sourcePalletNumber: "P001", sourceCartonNumber: "C001", sku: "DM-GWM-OF-001", expectedQuantity: 12 },
          { sourcePalletNumber: "P001", sourceCartonNumber: "C001", sku: "DM-GWM-AF-002", expectedQuantity: 6 },
        ],
      },
    });
  });

  it("builds a print scope that contains only selected source packaging and canonical product barcodes", async () => {
    const expected = await repository.getWarehouseExpectedReceipt({
      shipmentId: "shipment-test-1",
      cartonNumbers: ["c002"],
    });
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;

    expect(buildWarehouseLabelPrintScope(expected.receipt, "unit_product")).toEqual({
      shipmentId: "shipment-test-1",
      palletNumbers: ["P002"],
      cartonNumbers: ["C002"],
      lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 24, productBarcode: "DMPGWMOF001" }],
    });
  });
});
