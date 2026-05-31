import { fitmentRules, getCatalogueWithAvailability, type FitmentRule } from "./catalogue";
import type { InventoryRow } from "./inventory";

export type VehicleLookupInput = {
  rego?: string;
  vin?: string;
  query?: string;
};

export type VehicleProfile = {
  make: string;
  model: string;
  year: number;
  engine?: string;
  market: "AU-spec";
  confidence: "mock_match" | "manual_review";
};

function normalise(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

type MatchableCatalogueRow = {
  sku: string;
  vehicle?: string;
  fitment?: string;
};

export function lookupVehicle(input: VehicleLookupInput): VehicleProfile {
  const haystack = [input.rego, input.vin, input.query].map(normalise).join(" ");

  if (haystack.includes("byd") || haystack.includes("atto")) {
    return { make: "BYD", model: "Atto 3", year: 2023, market: "AU-spec", confidence: "mock_match" };
  }

  if (haystack.includes("mg4") || haystack.includes("mg")) {
    return { make: "MG", model: "MG4", year: 2023, market: "AU-spec", confidence: "mock_match" };
  }

  return {
    make: "GWM",
    model: "Cannon Alpha",
    year: 2024,
    engine: "GW4D24",
    market: "AU-spec",
    confidence: "mock_match",
  };
}

function ruleMatchesVehicle(rule: FitmentRule, vehicle: VehicleProfile) {
  return (
    normalise(rule.make) === normalise(vehicle.make) &&
    normalise(rule.model) === normalise(vehicle.model) &&
    rule.yearFrom <= vehicle.year &&
    (!rule.yearTo || rule.yearTo >= vehicle.year)
  );
}

function vehicleLabel(rule: FitmentRule) {
  return `${rule.make} ${rule.model} ${rule.yearFrom}${rule.yearTo ? `-${rule.yearTo}` : "-on"}`;
}

export function matchCataloguePartsForVehicle<T extends MatchableCatalogueRow>(
  input: VehicleLookupInput,
  catalogue: T[],
  rules: FitmentRule[],
) {
  const vehicle = lookupVehicle(input);

  const matches = catalogue
    .map((product) => {
      const rule = rules.find((candidate) => candidate.sku === product.sku && ruleMatchesVehicle(candidate, vehicle));
      return rule
        ? {
            ...product,
            vehicle: product.vehicle ?? vehicleLabel(rule),
            fitment: product.fitment ?? rule.engine ?? "Confirm by VIN",
            fitmentConfidence: rule.confidence,
          }
        : null;
    })
    .filter((product) => product !== null);

  return { vehicle, matches };
}

export function matchPartsForVehicle(input: VehicleLookupInput, inventory?: InventoryRow[]) {
  return matchCataloguePartsForVehicle(input, getCatalogueWithAvailability(inventory), fitmentRules);
}
