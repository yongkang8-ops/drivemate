import { describe, expect, it } from "vitest";
import { formatWarehouseLocation, parseWarehouseLocation } from "../lib/warehouseLocation";

describe("warehouse location parsing", () => {
  it("parses compact Brisbane bin codes", () => {
    expect(parseWarehouseLocation("BNE-A01-03")).toEqual({
      warehouse: "Brisbane",
      zone: "A01",
      binCode: "03",
    });
  });

  it("parses every middle segment of a Brisbane location as its zone", () => {
    expect(parseWarehouseLocation("BNE-A-01-03")).toEqual({
      warehouse: "Brisbane",
      zone: "A-01",
      binCode: "03",
    });
  });

  it("normalises operational location aliases", () => {
    expect(parseWarehouseLocation("BNE dispatch")).toEqual({
      warehouse: "Brisbane",
      zone: "DISPATCH",
      binCode: "LANE",
    });
  });

  it("formats warehouse locations for audit display", () => {
    expect(formatWarehouseLocation({ warehouse: "Brisbane", zone: "QUARANTINE", binCode: "REVIEW" })).toBe(
      "BNE-QUARANTINE-REVIEW",
    );
  });
});
