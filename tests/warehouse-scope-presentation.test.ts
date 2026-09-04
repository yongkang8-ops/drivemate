import { describe, expect, it } from "vitest";
import { describeUnmappedPalletSelection } from "../lib/warehouseScopePresentation";

describe("unmapped pallet selection presentation", () => {
  it("describes an empty source-scope selection as the full shipment", () => {
    expect(describeUnmappedPalletSelection([])).toBe(
      "Pallet mapping not recorded · Full shipment selected",
    );
  });

  it("names a single selected source scope", () => {
    expect(describeUnmappedPalletSelection(["34#"])).toBe(
      "Pallet mapping not recorded · Source scope 34# selected",
    );
  });

  it("counts multiple selected source scopes", () => {
    expect(describeUnmappedPalletSelection(["34#", "35#"])).toBe(
      "Pallet mapping not recorded · 2 source scopes selected",
    );
  });
});
