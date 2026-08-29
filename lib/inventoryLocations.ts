const LOCATION_BARCODE_PREFIX = "DMLOC:";
const CARTON_BARCODE_PREFIX = "DMCARTON:";
const locationCodePattern = /^BNE-([A-Z0-9]+(?:-[A-Z0-9]+){0,2})-([A-Z0-9]+)$/;

export type ParsedInventoryLocationCode = {
  ok: true;
  locationCode: string;
  barcode: string;
  warehouse: "Brisbane";
  zone: string;
  binCode: string;
};

export type InvalidInventoryLocationCode = {
  ok: false;
  message: string;
};

export type InventoryLocationCodeParseResult = ParsedInventoryLocationCode | InvalidInventoryLocationCode;

export type LocationCodeBatchParseResult =
  | { ok: true; locations: ParsedInventoryLocationCode[] }
  | InvalidInventoryLocationCode;

function normalizeIdentifier(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

export function createLocationBarcode(locationCode: string): string {
  const identifier = normalizeIdentifier(locationCode);
  if (!identifier) throw new Error("Location barcode requires an identifier.");
  if (identifier.startsWith(LOCATION_BARCODE_PREFIX) || identifier.startsWith(CARTON_BARCODE_PREFIX)) {
    throw new Error("Location barcode identifier must not contain a reserved barcode prefix.");
  }

  return `${LOCATION_BARCODE_PREFIX}${identifier}`;
}

export function parseInventoryLocationCode(value: string): InventoryLocationCodeParseResult {
  const locationCode = value.trim().toUpperCase().replace(/\s+/g, "");
  const match = locationCode.match(locationCodePattern);
  if (!match) {
    return { ok: false, message: "Location code must use the BNE-<segment>-<segment> format." };
  }

  return {
    ok: true,
    locationCode,
    barcode: createLocationBarcode(locationCode),
    warehouse: "Brisbane",
    zone: match[1],
    binCode: match[2],
  };
}

export function parseLocationCodeBatch(value: string): LocationCodeBatchParseResult {
  const locations: ParsedInventoryLocationCode[] = [];
  const seenLocationCodes = new Set<string>();

  for (const [index, line] of value.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;

    const parsed = parseInventoryLocationCode(line);
    if (!parsed.ok) {
      return { ok: false, message: `Line ${index + 1} must use a canonical BNE location code.` };
    }
    if (seenLocationCodes.has(parsed.locationCode)) continue;

    seenLocationCodes.add(parsed.locationCode);
    locations.push(parsed);
  }

  return { ok: true, locations };
}
