import { availableStock, type InventoryRow } from "./inventory";
import { cloneProductLabelProfile, optionalProductLabelProfileSchema, type ProductLabelProfile } from "./productLabelProfile";

export type Product = {
  labelProfile?: ProductLabelProfile | null;
  sku: string;
  barcode: string;
  oemPartNumber?: string;
  aliases?: string[];
  brand: "GWM" | "BYD" | "MG";
  name: string;
  category: string;
  vehicle: string;
  fitment: string;
  reorderPoint: number;
  reorderQuantity: number;
  status: "active" | "draft" | "paused";
};

export type FitmentRule = {
  sku: string;
  make: string;
  model: string;
  yearFrom: number;
  yearTo?: number;
  engine?: string;
  confidence: "exact" | "likely" | "confirm_vin";
};

export type CreateFitmentRuleInput = {
  sku: string;
  make: string;
  model: string;
  yearFrom: number;
  yearTo?: number;
  engine?: string;
  confidence: FitmentRule["confidence"];
};

const defaultProducts: Product[] = [
  {
    sku: "DM-GWM-OF-001",
    // Memory/demo fixture only; never used to backfill Production product records.
    labelProfile: { schemaVersion: 1, displayName: "OIL FILTER", vehicleMakes: ["GWM"], partReference: "QA-OF-001", position: { status: "not_applicable" } },
    barcode: "DMPGWMOF001",
    oemPartNumber: "GWM-OEM-OF-001",
    aliases: ["GWM-ALPHA-OIL-FILTER", "OF-GWM-001"],
    brand: "GWM",
    name: "Genuine Engine Oil Filter",
    category: "Service Filter",
    vehicle: "Cannon Alpha 2.4D 2024-on",
    fitment: "GW4D24 diesel",
    reorderPoint: 12,
    reorderQuantity: 48,
    status: "active",
  },
  {
    sku: "DM-GWM-AF-002",
    labelProfile: { schemaVersion: 1, displayName: "AIR FILTER", vehicleMakes: ["GWM"], partReference: "QA-AF-002", position: { status: "not_applicable" } },
    barcode: "DMPGWMAF002",
    oemPartNumber: "GWM-OEM-AF-002",
    aliases: ["GWM-ALPHA-AIR-FILTER", "AF-GWM-002"],
    brand: "GWM",
    name: "Genuine Air Filter",
    category: "Service Filter",
    vehicle: "Cannon Alpha 2.4D 2024-on",
    fitment: "GWM WA5661 equivalent",
    reorderPoint: 12,
    reorderQuantity: 48,
    status: "active",
  },
  {
    sku: "DM-GWM-CF-003",
    labelProfile: { schemaVersion: 1, displayName: "CABIN FILTER", vehicleMakes: ["GWM"], partReference: "QA-CF-003", position: { status: "not_applicable" } },
    barcode: "DMPGWMCF003",
    oemPartNumber: "GWM-OEM-CF-003",
    aliases: ["GWM-ALPHA-CABIN-FILTER", "CF-GWM-003"],
    brand: "GWM",
    name: "Genuine Cabin Filter",
    category: "Service Filter",
    vehicle: "Cannon Alpha 2.4D 2024-on",
    fitment: "GWM AU-spec cabin",
    reorderPoint: 12,
    reorderQuantity: 48,
    status: "active",
  },
  {
    sku: "DM-GWM-FF-004",
    labelProfile: { schemaVersion: 1, displayName: "FUEL FILTER", vehicleMakes: ["GWM"], partReference: "QA-FF-004", position: { status: "not_applicable" } },
    barcode: "DMPGWMFF004",
    oemPartNumber: "GWM-OEM-FF-004",
    aliases: ["GWM-ALPHA-FUEL-FILTER", "FF-GWM-004"],
    brand: "GWM",
    name: "Genuine Diesel Fuel Filter",
    category: "Service Filter",
    vehicle: "Cannon Alpha 2.4D 2024-on",
    fitment: "Cannon Alpha fuel system",
    reorderPoint: 12,
    reorderQuantity: 36,
    status: "active",
  },
  {
    sku: "DM-BYD-CF-007",
    labelProfile: { schemaVersion: 1, displayName: "CABIN FILTER", vehicleMakes: ["BYD"], partReference: "QA-CF-007", position: { status: "not_applicable" } },
    barcode: "DMPBYDCF007",
    oemPartNumber: "BYD-OEM-CF-007",
    aliases: ["BYD-CABIN-FILTER", "CF-BYD-007"],
    brand: "BYD",
    name: "Cabin Filter",
    category: "Service Filter",
    vehicle: "Atto 3 / Sealion 6",
    fitment: "Confirm by VIN",
    reorderPoint: 10,
    reorderQuantity: 40,
    status: "active",
  },
  {
    sku: "DM-MG-CF-008",
    labelProfile: { schemaVersion: 1, displayName: "CABIN FILTER", vehicleMakes: ["MG"], partReference: "QA-CF-008", position: { status: "not_applicable" } },
    barcode: "DMPMGCF008",
    oemPartNumber: "MG-OEM-CF-008",
    aliases: ["MG-CABIN-FILTER", "CF-MG-008"],
    brand: "MG",
    name: "Cabin Filter",
    category: "Service Filter",
    vehicle: "MG4 EV / ZS / HS",
    fitment: "Confirm by VIN",
    reorderPoint: 10,
    reorderQuantity: 40,
    status: "active",
  },
];

export type UpdateProductMasterInput = {
  labelProfile?: ProductLabelProfile | null;
  sku: string;
  barcode?: string;
  oemPartNumber?: string;
  brand?: Product["brand"];
  name?: string;
  category?: string;
  reorderPoint?: number;
  reorderQuantity?: number;
  status?: Product["status"];
};

export type CreateProductMasterInput = {
  labelProfile?: ProductLabelProfile | null;
  sku: string;
  barcode: string;
  oemPartNumber?: string;
  brand: Product["brand"];
  name: string;
  category: string;
  vehicle?: string;
  fitment?: string;
  reorderPoint?: number;
  reorderQuantity?: number;
  status?: Product["status"];
};

function cloneProduct(product: Product): Product {
  return { ...product, aliases: product.aliases ? [...product.aliases] : undefined, labelProfile: cloneProductLabelProfile(product.labelProfile) };
}

export const products: Product[] = defaultProducts.map(cloneProduct);

const defaultFitmentRules: FitmentRule[] = [
  {
    sku: "DM-GWM-OF-001",
    make: "GWM",
    model: "Cannon Alpha",
    yearFrom: 2024,
    engine: "GW4D24",
    confidence: "confirm_vin",
  },
  {
    sku: "DM-GWM-AF-002",
    make: "GWM",
    model: "Cannon Alpha",
    yearFrom: 2024,
    engine: "GW4D24",
    confidence: "confirm_vin",
  },
  {
    sku: "DM-GWM-CF-003",
    make: "GWM",
    model: "Cannon Alpha",
    yearFrom: 2024,
    engine: "GW4D24",
    confidence: "confirm_vin",
  },
  {
    sku: "DM-GWM-FF-004",
    make: "GWM",
    model: "Cannon Alpha",
    yearFrom: 2024,
    engine: "GW4D24",
    confidence: "confirm_vin",
  },
  {
    sku: "DM-BYD-CF-007",
    make: "BYD",
    model: "Atto 3",
    yearFrom: 2023,
    confidence: "likely",
  },
  {
    sku: "DM-MG-CF-008",
    make: "MG",
    model: "MG4",
    yearFrom: 2023,
    confidence: "likely",
  },
];

export const fitmentRules: FitmentRule[] = defaultFitmentRules.map((rule) => ({ ...rule }));

export const initialInventory: InventoryRow[] = [
  { sku: "DM-GWM-OF-001", onHand: 42, reserved: 1 },
  { sku: "DM-GWM-AF-002", onHand: 38, reserved: 1 },
  { sku: "DM-GWM-CF-003", onHand: 35, reserved: 0 },
  { sku: "DM-GWM-FF-004", onHand: 16, reserved: 0 },
  { sku: "DM-BYD-CF-007", onHand: 8, reserved: 0 },
  { sku: "DM-MG-CF-008", onHand: 0, reserved: 0 },
];

export function findProductBySku(sku: string): Product | undefined {
  return products.find((product) => product.sku === sku);
}

function productIdentifiers(product: Product): string[] {
  return [product.sku, product.barcode, product.oemPartNumber, ...(product.aliases ?? [])].filter(Boolean) as string[];
}

function findConflictingProduct(identifier: string | undefined, currentSku?: string): Product | undefined {
  const normalized = identifier?.trim().toUpperCase();
  if (!normalized) return undefined;

  return products.find(
    (product) =>
      product.sku !== currentSku &&
      productIdentifiers(product).some((alias) => alias.toUpperCase() === normalized),
  );
}

export function resolveSkuIdentifier(identifier: string): string | undefined {
  const normalized = identifier.trim().toUpperCase();
  if (!normalized) return undefined;

  return products.find((product) => {
    const aliases = productIdentifiers(product);
    return aliases.some((alias) => alias.toUpperCase() === normalized);
  })?.sku;
}

export function updateProductMasterData(input: UpdateProductMasterInput) {
  const product = products.find((candidate) => candidate.sku === input.sku);
  if (!product) return { ok: false as const, message: "SKU was not found." };
  const profile = optionalProductLabelProfileSchema.safeParse(input.labelProfile);
  if (!profile.success) return { ok: false as const, message: "Product label fields are invalid." };

  if (input.barcode !== undefined) {
    const barcode = input.barcode.trim();
    if (findConflictingProduct(barcode, product.sku)) {
      return { ok: false as const, message: "Barcode is already mapped to another SKU." };
    }
    product.barcode = barcode;
  }
  if (input.oemPartNumber !== undefined) {
    const oemPartNumber = input.oemPartNumber.trim();
    if (findConflictingProduct(oemPartNumber, product.sku)) {
      return { ok: false as const, message: "OEM part number is already mapped to another SKU." };
    }
    product.oemPartNumber = oemPartNumber || undefined;
  }
  if (input.brand !== undefined) product.brand = input.brand;
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return { ok: false as const, message: "Part name is required." };
    product.name = name;
  }
  if (input.category !== undefined) {
    const category = input.category.trim();
    if (!category) return { ok: false as const, message: "Category is required." };
    product.category = category;
  }
  if (input.reorderPoint !== undefined) {
    if (!Number.isInteger(input.reorderPoint) || input.reorderPoint < 0) {
      return { ok: false as const, message: "Reorder point must be zero or a positive integer." };
    }
    product.reorderPoint = input.reorderPoint;
  }
  if (input.reorderQuantity !== undefined) {
    if (!Number.isInteger(input.reorderQuantity) || input.reorderQuantity < 0) {
      return { ok: false as const, message: "Reorder quantity must be zero or a positive integer." };
    }
    product.reorderQuantity = input.reorderQuantity;
  }
  if (input.status !== undefined) product.status = input.status;
  if (input.labelProfile !== undefined) product.labelProfile = cloneProductLabelProfile(profile.data);

  return { ok: true as const, product: cloneProduct(product) };
}

export function createProductMasterData(input: CreateProductMasterInput) {
  const profile = optionalProductLabelProfileSchema.safeParse(input.labelProfile);
  if (!profile.success) return { ok: false as const, message: "Product label fields are invalid." };
  const sku = input.sku.trim().toUpperCase();
  const barcode = input.barcode.trim();
  const oemPartNumber = input.oemPartNumber?.trim();

  if (findConflictingProduct(sku)) return { ok: false as const, message: "SKU already exists." };
  if (findConflictingProduct(barcode)) return { ok: false as const, message: "Barcode is already mapped to another SKU." };
  if (findConflictingProduct(oemPartNumber)) {
    return { ok: false as const, message: "OEM part number is already mapped to another SKU." };
  }

  const product: Product = {
    labelProfile: cloneProductLabelProfile(profile.data),
    sku,
    barcode,
    oemPartNumber: oemPartNumber || undefined,
    brand: input.brand,
    name: input.name.trim(),
    category: input.category.trim(),
    vehicle: input.vehicle?.trim() || "Confirm by VIN",
    fitment: input.fitment?.trim() || "Confirm by VIN",
    reorderPoint: input.reorderPoint ?? 0,
    reorderQuantity: input.reorderQuantity ?? 0,
    status: input.status ?? "draft",
  };

  products.push(product);
  return { ok: true as const, product: cloneProduct(product) };
}

export function createFitmentRuleData(input: CreateFitmentRuleInput) {
  const sku = input.sku.trim().toUpperCase();
  const product = findProductBySku(sku);
  if (!product) return { ok: false as const, message: "SKU was not found." };
  if (!Number.isInteger(input.yearFrom) || input.yearFrom < 1900) {
    return { ok: false as const, message: "Year from must be a valid year." };
  }
  if (input.yearTo !== undefined && input.yearTo < input.yearFrom) {
    return { ok: false as const, message: "Year to must be after year from." };
  }

  const rule: FitmentRule = {
    sku,
    make: input.make.trim(),
    model: input.model.trim(),
    yearFrom: input.yearFrom,
    yearTo: input.yearTo,
    engine: input.engine?.trim() || undefined,
    confidence: input.confidence,
  };
  const duplicate = fitmentRules.some(
    (candidate) =>
      candidate.sku === rule.sku &&
      candidate.make.toLowerCase() === rule.make.toLowerCase() &&
      candidate.model.toLowerCase() === rule.model.toLowerCase() &&
      candidate.yearFrom === rule.yearFrom &&
      candidate.yearTo === rule.yearTo &&
      (candidate.engine ?? "").toLowerCase() === (rule.engine ?? "").toLowerCase(),
  );
  if (duplicate) return { ok: false as const, message: "Fitment rule already exists for this SKU and vehicle." };

  fitmentRules.push(rule);
  return { ok: true as const, rule: { ...rule } };
}

export function resetProductMasterData() {
  products.splice(0, products.length, ...defaultProducts.map(cloneProduct));
  fitmentRules.splice(0, fitmentRules.length, ...defaultFitmentRules.map((rule) => ({ ...rule })));
}

export function getCatalogueWithAvailability(
  rows: InventoryRow[] = initialInventory,
  options: { includeInactive?: boolean } = {},
) {
  return products.filter((product) => options.includeInactive || product.status === "active").map((product) => {
    const balance = rows.find((row) => row.sku === product.sku);
    return {
      ...cloneProduct(product),
      onHand: balance?.onHand ?? 0,
      reserved: balance?.reserved ?? 0,
      quarantine: balance?.quarantine ?? 0,
      available: balance ? availableStock(balance) : 0,
    };
  });
}
