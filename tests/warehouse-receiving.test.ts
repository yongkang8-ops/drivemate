import { describe, expect, it } from "vitest";
import { prepareWarehouseReceipt } from "../lib/warehouseReceiving";

const expectedScope = {
  shipmentId: "shipment-test-1",
  cartonNumbers: ["C001"],
  lines: [
    { sku: "DM-GWM-OF-001", expectedQuantity: 12, productBarcode: "DMPGWMOF001" },
    { sku: "DM-GWM-AF-002", expectedQuantity: 6, productBarcode: "DMPGWMAF002" },
  ],
};

describe("warehouse receipt preparation", () => {
  it("requires a recognised product scan before counted quantities can be confirmed", () => {
    expect(
      prepareWarehouseReceipt({
        expectedScope,
        mode: "counted_quantity",
        scannedProductBarcodes: [],
        countedLines: [
          { productBarcode: "DMPGWMOF001", actualQuantity: 12 },
          { productBarcode: "DMPGWMAF002", actualQuantity: 6 },
        ],
      } as never),
    ).toEqual({
      ok: false,
      message: "Scan every expected product barcode before entering counted quantities.",
    });
  });

  it("rejects a duplicate counted line instead of silently overwriting it", () => {
    expect(
      prepareWarehouseReceipt({
        expectedScope,
        mode: "counted_quantity",
        scannedProductBarcodes: ["DMPGWMOF001", "DMPGWMAF002"],
        countedLines: [
          { productBarcode: "DMPGWMOF001", actualQuantity: 12 },
          { productBarcode: "DMPGWMOF001", actualQuantity: 12 },
          { productBarcode: "DMPGWMAF002", actualQuantity: 6 },
        ],
      } as never),
    ).toEqual({
      ok: false,
      message: "Duplicate counted line for product barcode DMPGWMOF001.",
    });
  });

  it("uses a receipt scope with carton coverage and a classified discrepancy", () => {
    const input = {
      expectedScope: {
        shipmentId: "shipment-test-1",
        cartonNumbers: ["C001"],
        lines: [
          { sku: "DM-GWM-OF-001", expectedQuantity: 12, productBarcode: "DMPGWMOF001" },
        ],
      },
      mode: "counted_quantity",
      scannedProductBarcodes: ["DMPGWMOF001"],
      countedLines: [
        {
          productBarcode: "DMPGWMOF001",
          actualQuantity: 11,
          discrepancy: {
            type: "short_pack",
            reason: "Supplier short packed one unit.",
          },
        },
      ],
    } as never;

    expect(() => prepareWarehouseReceipt(input)).not.toThrow();
    expect(prepareWarehouseReceipt(input)).toMatchObject({
      ok: true,
      stagingLocation: "BNE-RECEIVING-STAGING",
      lines: [
        expect.objectContaining({
          sku: "DM-GWM-OF-001",
          expectedQuantity: 12,
          actualQuantity: 11,
          discrepancy: {
            type: "short_pack",
            reason: "Supplier short packed one unit.",
          },
        }),
      ],
    });
  });

  it("counts each scanned product label and stages confirmed receipt quantities automatically", () => {
    const receipt = prepareWarehouseReceipt({
      expectedScope,
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
        {
          sku: "DM-GWM-OF-001",
          productBarcode: "DMPGWMOF001",
          expectedQuantity: 12,
          actualQuantity: 12,
        },
        {
          sku: "DM-GWM-AF-002",
          productBarcode: "DMPGWMAF002",
          expectedQuantity: 6,
          actualQuantity: 6,
        },
      ],
    });
  });

  it("requires a discrepancy reason when counted quantity differs from the packing list", () => {
    expect(
      prepareWarehouseReceipt({
        expectedScope,
        mode: "counted_quantity",
        scannedProductBarcodes: ["DMPGWMOF001", "DMPGWMAF002"],
        countedLines: [
          { productBarcode: "DMPGWMOF001", actualQuantity: 11 },
          { productBarcode: "DMPGWMAF002", actualQuantity: 6 },
        ],
      }),
    ).toEqual({ ok: false, message: "A discrepancy reason is required for DM-GWM-OF-001." });
  });

  it("accepts a counted quantity with a recorded discrepancy reason", () => {
    expect(
      prepareWarehouseReceipt({
        expectedScope,
        mode: "counted_quantity",
        scannedProductBarcodes: ["DMPGWMOF001", "DMPGWMAF002"],
        countedLines: [
          {
            productBarcode: "DMPGWMOF001",
            actualQuantity: 11,
            discrepancy: {
              type: "short_pack",
              reason: "Supplier short packed one unit.",
            },
          },
          { productBarcode: "DMPGWMAF002", actualQuantity: 6 },
        ],
      } as never),
    ).toMatchObject({
      ok: true,
      stagingLocation: "BNE-RECEIVING-STAGING",
      lines: expect.arrayContaining([
        expect.objectContaining({
          sku: "DM-GWM-OF-001",
          expectedQuantity: 12,
          actualQuantity: 11,
          discrepancy: {
            type: "short_pack",
            reason: "Supplier short packed one unit.",
          },
        }),
      ]),
    });
  });
});
