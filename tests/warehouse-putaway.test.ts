import { describe, expect, it } from "vitest";
import { prepareWarehousePutaway } from "../lib/warehousePutaway";

describe("warehouse putaway preparation", () => {
  it("accepts a product barcode, DMLOC destination and positive whole quantity", () => {
    expect(prepareWarehousePutaway({
      productBarcode: " dmpgwmof001 ",
      destinationBarcode: " dmloc:bne-a01-03 ",
      quantity: 2,
    })).toEqual({
      ok: true,
      productBarcode: "DMPGWMOF001",
      destinationLocation: "BNE-A01-03",
      quantity: 2,
    });
  });

  it("rejects a non-location barcode as the putaway destination", () => {
    expect(prepareWarehousePutaway({
      productBarcode: "DMPGWMOF001",
      destinationBarcode: "DMCARTON:C001",
      quantity: 2,
    })).toEqual({
      ok: false,
      message: "Scan a DMLOC destination label before putaway.",
    });
  });

  it("rejects a reserved location barcode as the product identity", () => {
    expect(prepareWarehousePutaway({
      productBarcode: "DMLOC:BNE-A01-03",
      destinationBarcode: "DMLOC:BNE-A01-03",
      quantity: 2,
    })).toEqual({
      ok: false,
      message: "Scan a product barcode before putaway.",
    });
  });
});
