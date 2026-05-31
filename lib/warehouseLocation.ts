export type WarehouseLocationParts = {
  warehouse: string;
  zone: string;
  binCode: string;
};

const warehouseAliases: Record<string, string> = {
  BNE: "Brisbane",
  BRISBANE: "Brisbane",
};

const locationAliases: Record<string, WarehouseLocationParts> = {
  "BNE RECEIVING": { warehouse: "Brisbane", zone: "RECEIVING", binCode: "DOCK" },
  "BNE DISPATCH": { warehouse: "Brisbane", zone: "DISPATCH", binCode: "LANE" },
  "BNE RETURNS": { warehouse: "Brisbane", zone: "RETURNS", binCode: "REVIEW" },
  "BNE QUARANTINE": { warehouse: "Brisbane", zone: "QUARANTINE", binCode: "REVIEW" },
};

export function parseWarehouseLocation(value?: string | null): WarehouseLocationParts {
  const normalized = value?.trim().toUpperCase().replace(/\s+/g, " ");
  if (!normalized) return { warehouse: "Brisbane", zone: "UNASSIGNED", binCode: "HOLD" };

  const alias = locationAliases[normalized];
  if (alias) return alias;

  const [warehouseCode, zone, binCode] = normalized.split(/[-/]/).filter(Boolean);
  return {
    warehouse: warehouseAliases[warehouseCode] ?? warehouseCode ?? "Brisbane",
    zone: zone ?? "UNASSIGNED",
    binCode: binCode ?? "HOLD",
  };
}

export function formatWarehouseLocation(location: WarehouseLocationParts): string {
  const warehouseCode = location.warehouse.toUpperCase() === "BRISBANE" ? "BNE" : location.warehouse;
  return `${warehouseCode}-${location.zone}-${location.binCode}`;
}
