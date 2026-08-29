import { describe, expect, it } from "vitest";
import {
  parseInventoryLocationCode,
  parseLocationCodeBatch,
} from "../lib/inventoryLocations";

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
});
