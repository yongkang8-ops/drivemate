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
  year?: number;
  engine?: string;
  market: "AU-spec";
  confidence: "exact" | "manual_review";
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
    return { make: "BYD", model: "Atto 3", year: 2023, market: "AU-spec", confidence: "manual_review" };
  }

  if (haystack.includes("mg4") || haystack.includes("mg")) {
    return { make: "MG", model: "MG4", year: 2023, market: "AU-spec", confidence: "manual_review" };
  }

  if (haystack.includes("cannon alpha")) {
    return { make: "GWM", model: "Cannon Alpha", year: 2024, engine: "GW4D24", market: "AU-spec", confidence: "manual_review" };
  }
  return { make: "Unknown", model: "Manual review", market: "AU-spec", confidence: "manual_review" };
}

function ruleMatchesVehicle(rule: FitmentRule, vehicle: VehicleProfile) {
  return (
    normalise(rule.make) === normalise(vehicle.make) &&
    normalise(rule.model) === normalise(vehicle.model) &&
    vehicle.year !== undefined &&
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

  return matchCatalogueForVehicleProfile(vehicle, catalogue, rules);
}

export function matchCatalogueForVehicleProfile<T extends MatchableCatalogueRow>(
  vehicle: VehicleProfile,
  catalogue: T[],
  rules: FitmentRule[],
) {

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
