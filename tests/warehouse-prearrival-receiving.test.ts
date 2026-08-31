import { beforeEach, describe, expect, it } from "vitest";
import { buildWarehouseLabelPrintScope, buildWarehouseReceiptScope } from "../lib/warehouseLabels";
import { MemoryRepository } from "../lib/memoryRepository";
import { prepareWarehouseReceipt } from "../lib/warehouseReceiving";

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

  it("aggregates the same SKU across selected cartons for one receipt session", async () => {
    const shipment = await repository.getPrearrivalShipment("shipment-test-1");
    expect(shipment.ok).toBe(true);
    if (!shipment.ok) return;

    expect(buildWarehouseReceiptScope(shipment.shipment, shipment.shipment.productBarcodes)).toMatchObject({
      shipmentId: "shipment-test-1",
      cartonNumbers: ["C001", "C002"],
      lines: expect.arrayContaining([
        {
          sku: "DM-GWM-OF-001",
          productBarcode: "DMPGWMOF001",
          expectedQuantity: 36,
        },
      ]),
    });
  });

  it("aggregates differently formatted receipt SKUs before preparing the receipt", () => {
    const receipt = {
      shipmentId: "shipment-test-1",
      pallets: [{ sourcePalletNumber: "P001" }],
      cartons: [
        { sourceCartonNumber: "C001", sourcePalletNumber: "P001" },
        { sourceCartonNumber: "C002", sourcePalletNumber: "P001" },
      ],
      lines: [
        {
          sourcePalletNumber: "P001",
          sourceCartonNumber: "C001",
          sku: "dm-gwm-of-001",
          expectedQuantity: 1,
        },
        {
          sourcePalletNumber: "P001",
          sourceCartonNumber: "C002",
          sku: " DM-GWM-OF-001 ",
          expectedQuantity: 2,
        },
      ],
    };
    const scope = buildWarehouseReceiptScope(receipt, {
      "dm-gwm-of-001": "DMPGWMOF001",
      " DM-GWM-OF-001 ": " dmpgwmof001 ",
    });

    expect(scope).toEqual({
      shipmentId: "shipment-test-1",
      cartonNumbers: ["C001", "C002"],
      lines: [
        {
          sku: "DM-GWM-OF-001",
          expectedQuantity: 3,
          productBarcode: "DMPGWMOF001",
        },
      ],
    });
    expect(
      prepareWarehouseReceipt({
        expectedScope: scope,
        mode: "scan_each",
        scannedProductBarcodes: ["DMPGWMOF001", "DMPGWMOF001", "DMPGWMOF001"],
      }),
    ).toMatchObject({
      ok: true,
      lines: [
        {
          sku: "DM-GWM-OF-001",
          expectedQuantity: 3,
          actualQuantity: 3,
        },
      ],
    });
  });
});
