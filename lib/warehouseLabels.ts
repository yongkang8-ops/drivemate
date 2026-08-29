export const WAREHOUSE_LABEL_TEMPLATE_IDS = [
  "unit_product",
  "receiving_carton",
  "bin_location",
  "dispatch_shipping",
] as const;

export type WarehouseLabelTemplateId = (typeof WAREHOUSE_LABEL_TEMPLATE_IDS)[number];
export type WarehouseBarcodeKind = "product" | "location" | "carton";

export type WarehouseInboundSelection = {
  shipmentId: string;
  palletNumbers?: string[];
  cartonNumbers?: string[];
  skus?: string[];
};

export type WarehouseExpectedReceipt = {
  shipmentId: string;
  pallets: Array<{ sourcePalletNumber: string }>;
  cartons: Array<{ sourceCartonNumber: string; sourcePalletNumber?: string }>;
  lines: Array<{
    sourcePalletNumber?: string;
    sourceCartonNumber: string;
    sku: string;
    expectedQuantity: number;
  }>;
};

export type WarehouseLabelPrintScope = {
  shipmentId: string;
  palletNumbers: string[];
  cartonNumbers: string[];
  lines: Array<{ sku: string; expectedQuantity: number; productBarcode: string }>;
};

export type WarehouseReceiptScopeInput = {
  [sku: string]: string | undefined;
};

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

export { createLocationBarcode } from "./inventoryLocations";

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

function normalizeScopeValues(values?: string[]) {
  return new Set((values ?? []).map(normalizeIdentifier).filter(Boolean));
}

export function filterWarehouseExpectedReceipt(
  receipt: WarehouseExpectedReceipt,
  selection: WarehouseInboundSelection,
): WarehouseExpectedReceipt {
  const pallets = normalizeScopeValues(selection.palletNumbers);
  const cartons = normalizeScopeValues(selection.cartonNumbers);
  const skus = normalizeScopeValues(selection.skus);
  const selectedCartons = receipt.cartons.filter((carton) => {
    const palletMatch = !pallets.size || (carton.sourcePalletNumber && pallets.has(normalizeIdentifier(carton.sourcePalletNumber)));
    const cartonMatch = !cartons.size || cartons.has(normalizeIdentifier(carton.sourceCartonNumber));
    return palletMatch && cartonMatch;
  });
  const cartonNumbers = new Set(selectedCartons.map((carton) => normalizeIdentifier(carton.sourceCartonNumber)));
  const selectedLines = receipt.lines.filter((line) =>
    cartonNumbers.has(normalizeIdentifier(line.sourceCartonNumber)) &&
    (!skus.size || skus.has(normalizeIdentifier(line.sku))),
  );
  const selectedPalletNumbers = new Set(
    selectedCartons.map((carton) => carton.sourcePalletNumber).filter(Boolean).map((value) => normalizeIdentifier(value as string)),
  );

  return {
    shipmentId: receipt.shipmentId,
    pallets: receipt.pallets.filter((pallet) => selectedPalletNumbers.has(normalizeIdentifier(pallet.sourcePalletNumber))),
    cartons: selectedCartons,
    lines: selectedLines,
  };
}

export function buildWarehouseLabelPrintScope(
  receipt: WarehouseExpectedReceipt,
  templateId: WarehouseLabelTemplateId,
): WarehouseLabelPrintScope {
  if (templateId !== "unit_product") throw new Error("Only unit product label scope is supported in the first receiving workflow.");

  const lines = new Map<string, { sku: string; expectedQuantity: number; productBarcode: string }>();
  for (const line of receipt.lines) {
    const product = findProductBySku(line.sku);
    if (!product) throw new Error(`Expected receipt SKU ${line.sku} was not found.`);
    const key = `${line.sku}\u0000${product.barcode.trim().toUpperCase()}`;
    const existing = lines.get(key);
    lines.set(key, {
      sku: line.sku,
      productBarcode: product.barcode,
      expectedQuantity: (existing?.expectedQuantity ?? 0) + line.expectedQuantity,
    });
  }

  return {
    shipmentId: receipt.shipmentId,
    palletNumbers: receipt.pallets.map((pallet) => pallet.sourcePalletNumber),
    cartonNumbers: receipt.cartons.map((carton) => carton.sourceCartonNumber),
    lines: [...lines.values()],
  };
}

export function buildWarehouseReceiptScope(
  receipt: WarehouseExpectedReceipt,
  productBarcodes: WarehouseReceiptScopeInput,
) {
  const lines = new Map<string, { sku: string; expectedQuantity: number; productBarcode: string }>();
  for (const line of receipt.lines) {
    const productBarcode = productBarcodes[line.sku];
    if (!productBarcode?.trim()) {
      throw new Error(`Expected receipt SKU ${line.sku} does not have a product barcode.`);
    }
    const key = `${line.sku}\u0000${productBarcode.trim().toUpperCase()}`;
    const existing = lines.get(key);
    lines.set(key, {
      sku: line.sku,
      expectedQuantity: (existing?.expectedQuantity ?? 0) + line.expectedQuantity,
      productBarcode,
    });
  }

  return {
    shipmentId: receipt.shipmentId,
    cartonNumbers: receipt.cartons.map((carton) => carton.sourceCartonNumber),
    lines: [...lines.values()],
  };
}
import { findProductBySku } from "./catalogue";
