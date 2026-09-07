import { describe, expect, it } from "vitest";
import { getProductLabelProfileIssues } from "../lib/productLabelProfile";

const ready = { schemaVersion: 1, displayName: "OIL FILTER", vehicleMakes: ["MG"], partReference: "FILTER-12", position: { status: "not_applicable" } };
describe("per-product label readiness", () => {
  it("allows an explicitly non-positioned product", () => {
    expect(getProductLabelProfileIssues(ready)).toEqual([]);
  });
  it("does not silently hide unknown position", () => {
    expect(getProductLabelProfileIssues({ ...ready, position: { status: "unknown" } })).toEqual(["position"]);
  });
  it("identifies each incomplete field without inventing a default", () => {
    expect(getProductLabelProfileIssues({ ...ready, displayName: "", vehicleMakes: [], partReference: "", position: { status: "unknown" } })).toEqual(["displayName", "vehicleMakes", "partReference", "position"]);
    expect(getProductLabelProfileIssues(null)).toEqual(["labelProfile"]);
  });
});
