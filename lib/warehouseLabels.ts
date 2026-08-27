export const WAREHOUSE_LABEL_TEMPLATE_IDS = [
  "unit_product",
  "receiving_carton",
  "bin_location",
  "dispatch_shipping",
] as const;

export type WarehouseLabelTemplateId = (typeof WAREHOUSE_LABEL_TEMPLATE_IDS)[number];
export type WarehouseBarcodeKind = "product" | "location" | "carton";

type WarehouseLabelVisibleField =
  | "brand"
  | "part_name"
  | "part_number"
  | "oem_part_number"
  | "batch_lot"
  | "quantity"
  | "origin"
  | "receipt_number"
  | "purchase_order"
  | "received_date"
  | "status"
  | "location_code"
  | "shipment_id"
  | "order_number"
  | "carton_count"
  | "barcode";

export type WarehouseLabelTemplate = {
  dimensionsMm: { width: number; height: number };
  barcodeSymbology: "CODE128";
  visibleFields: readonly WarehouseLabelVisibleField[];
};

export const WAREHOUSE_LABEL_TEMPLATES: Record<WarehouseLabelTemplateId, WarehouseLabelTemplate> = {
  unit_product: {
    dimensionsMm: { width: 70, height: 50 },
    barcodeSymbology: "CODE128",
    visibleFields: ["brand", "part_name", "part_number", "oem_part_number", "batch_lot", "quantity", "origin", "barcode"],
  },
  receiving_carton: {
    dimensionsMm: { width: 100, height: 80 },
    barcodeSymbology: "CODE128",
    visibleFields: ["receipt_number", "purchase_order", "part_number", "batch_lot", "quantity", "received_date", "status", "barcode"],
  },
  bin_location: {
    dimensionsMm: { width: 100, height: 50 },
    barcodeSymbology: "CODE128",
    visibleFields: ["location_code", "barcode"],
  },
  dispatch_shipping: {
    dimensionsMm: { width: 100, height: 150 },
    barcodeSymbology: "CODE128",
    visibleFields: ["shipment_id", "order_number", "carton_count", "barcode"],
  },
};

const LOCATION_BARCODE_PREFIX = "DMLOC:";
const CARTON_BARCODE_PREFIX = "DMCARTON:";

type ParsedWarehouseBarcode = {
  ok: true;
  kind: WarehouseBarcodeKind;
  value: string;
  barcode: string;
};

type InvalidWarehouseBarcode = {
  ok: false;
  message: string;
};

export type WarehouseBarcodeParseResult = ParsedWarehouseBarcode | InvalidWarehouseBarcode;

function normalizeIdentifier(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function createReservedBarcode(prefix: string, value: string, label: string): string {
  const identifier = normalizeIdentifier(value);
  if (!identifier) throw new Error(`${label} barcode requires an identifier.`);
  if (identifier.startsWith(LOCATION_BARCODE_PREFIX) || identifier.startsWith(CARTON_BARCODE_PREFIX)) {
    throw new Error(`${label} barcode identifier must not contain a reserved barcode prefix.`);
  }

  return `${prefix}${identifier}`;
}

export function createLocationBarcode(locationCode: string): string {
  return createReservedBarcode(LOCATION_BARCODE_PREFIX, locationCode, "Location");
}

export function createCartonBarcode(cartonId: string): string {
  return createReservedBarcode(CARTON_BARCODE_PREFIX, cartonId, "Carton");
}

export function parseWarehouseBarcode(value?: string | null): WarehouseBarcodeParseResult {
  const barcode = normalizeIdentifier(value ?? "");
  if (!barcode) return { ok: false, message: "Barcode is required." };

  if (barcode.startsWith(LOCATION_BARCODE_PREFIX)) {
    const locationCode = barcode.slice(LOCATION_BARCODE_PREFIX.length);
    if (!locationCode) return { ok: false, message: "Location barcode is missing its identifier." };
    return { ok: true, kind: "location", value: locationCode, barcode };
  }

  if (barcode.startsWith(CARTON_BARCODE_PREFIX)) {
    const cartonId = barcode.slice(CARTON_BARCODE_PREFIX.length);
    if (!cartonId) return { ok: false, message: "Carton barcode is missing its identifier." };
    return { ok: true, kind: "carton", value: cartonId, barcode };
  }

  return { ok: true, kind: "product", value: barcode, barcode };
}
