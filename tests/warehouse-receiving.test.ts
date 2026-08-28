import { describe, expect, it } from "vitest";
import { prepareWarehouseReceipt } from "../lib/warehouseReceiving";

const expectedCarton = {
  shipmentId: "shipment-test-1",
  cartonNumber: "C001",
  lines: [
    { sku: "DM-GWM-OF-001", expectedQuantity: 12, productBarcode: "DMPGWMOF001" },
    { sku: "DM-GWM-AF-002", expectedQuantity: 6, productBarcode: "DMPGWMAF002" },
  ],
};

describe("warehouse receipt preparation", () => {
  it("counts each scanned product label and stages confirmed receipt quantities automatically", () => {
    const receipt = prepareWarehouseReceipt({
      expectedCarton,
      mode: "scan_each",
      scannedProductBarcodes: [
        ...Array.from({ length: 12 }, () => "DMPGWMOF001"),
        ...Array.from({ length: 6 }, () => "DMPGWMAF002"),
      ],
    });

    expect(receipt).toEqual({
      ok: true,
      stagingLocation: "BNE-RECEIVING-STAGING",
      lines: [
        { sku: "DM-GWM-OF-001", expectedQuantity: 12, actualQuantity: 12 },
        { sku: "DM-GWM-AF-002", expectedQuantity: 6, actualQuantity: 6 },
      ],
    });
  });

  it("requires a discrepancy reason when counted quantity differs from the packing list", () => {
    expect(
      prepareWarehouseReceipt({
        expectedCarton,
        mode: "counted_quantity",
        countedLines: [{ productBarcode: "DMPGWMOF001", actualQuantity: 11 }],
      }),
    ).toEqual({ ok: false, message: "A discrepancy reason is required for DM-GWM-OF-001." });
  });

  it("accepts a counted quantity with a recorded discrepancy reason", () => {
    expect(
      prepareWarehouseReceipt({
        expectedCarton,
        mode: "counted_quantity",
        countedLines: [
          {
            productBarcode: "DMPGWMOF001",
            actualQuantity: 11,
            discrepancyReason: "Supplier short packed one unit.",
          },
        ],
      }),
    ).toEqual({
      ok: true,
      stagingLocation: "BNE-RECEIVING-STAGING",
      lines: [
        {
          sku: "DM-GWM-OF-001",
          expectedQuantity: 12,
          actualQuantity: 11,
          discrepancyReason: "Supplier short packed one unit.",
        },
      ],
    });
  });
});
