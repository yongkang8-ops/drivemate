import { describe, expect, it } from "vitest";
import { lookupVehicle, matchPartsForVehicle } from "../lib/fitment";

describe("vehicle lookup and fitment matching", () => {
  it("maps a Cannon Alpha query to a GWM AU-spec vehicle profile", () => {
    const vehicle = lookupVehicle({ query: "GWM Cannon Alpha filters" });

    expect(vehicle).toMatchObject({
      make: "GWM",
      model: "Cannon Alpha",
      year: 2024,
      engine: "GW4D24",
      market: "AU-spec",
    });
  });

  it("returns matching service filter SKUs with stock fields", () => {
    const result = matchPartsForVehicle({ rego: "QLD 24ALPHA", query: "GWM Cannon Alpha" });

    expect(result.matches.map((match) => match.sku)).toContain("DM-GWM-OF-001");
    expect(result.matches[0]).toHaveProperty("available");
    expect(result.matches[0]).toHaveProperty("fitmentConfidence");
  });
});
