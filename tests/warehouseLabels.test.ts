import { describe, expect, it } from "vitest";
import {
  WAREHOUSE_LABEL_TEMPLATES,
  createCartonBarcode,
  createLocationBarcode,
  parseWarehouseBarcode,
} from "../lib/warehouseLabels";

describe("warehouse label templates", () => {
  it("defines the four approved fixed-size Code 128 templates", () => {
    expect(WAREHOUSE_LABEL_TEMPLATES).toMatchObject({
      unit_product: {
        dimensionsMm: { width: 70, height: 50 },
        barcodeSymbology: "CODE128",
      },
      receiving_carton: {
        dimensionsMm: { width: 100, height: 80 },
        barcodeSymbology: "CODE128",
      },
      bin_location: {
        dimensionsMm: { width: 100, height: 50 },
        barcodeSymbology: "CODE128",
      },
      dispatch_shipping: {
        dimensionsMm: { width: 100, height: 150 },
        barcodeSymbology: "CODE128",
      },
    });
  });

  it("keeps prohibited trade and fitment claims out of the product label field list", () => {
    const fields = WAREHOUSE_LABEL_TEMPLATES.unit_product.visibleFields;

    expect(fields).toContain("part_number");
    expect(fields).toContain("barcode");
    expect(fields).not.toContain("price");
    expect(fields).not.toContain("gst");
    expect(fields).not.toContain("vin");
    expect(fields).not.toContain("fitment");
  });
});

describe("warehouse barcode namespaces", () => {
  it("normalises a location identifier into the reserved location namespace", () => {
    expect(createLocationBarcode(" bne-a01-03 ")).toBe("DMLOC:BNE-A01-03");
    expect(parseWarehouseBarcode("DMLOC:BNE-A01-03")).toEqual({
      ok: true,
      kind: "location",
      value: "BNE-A01-03",
      barcode: "DMLOC:BNE-A01-03",
    });
  });

  it("normalises a carton identifier into the reserved carton namespace", () => {
    expect(createCartonBarcode(" carton-00042 ")).toBe("DMCARTON:CARTON-00042");
    expect(parseWarehouseBarcode("DMCARTON:CARTON-00042")).toEqual({
      ok: true,
      kind: "carton",
      value: "CARTON-00042",
      barcode: "DMCARTON:CARTON-00042",
    });
  });

  it("treats an existing unprefixed product barcode as a product and never as a location", () => {
    expect(parseWarehouseBarcode(" DMPGWMOF001 ")).toEqual({
      ok: true,
      kind: "product",
      value: "DMPGWMOF001",
      barcode: "DMPGWMOF001",
    });
  });

  it("rejects a reserved barcode prefix without an identifier", () => {
    expect(parseWarehouseBarcode("DMLOC:")).toEqual({
      ok: false,
      message: "Location barcode is missing its identifier.",
    });
  });
});
