export const RECEIVING_STAGING_LOCATION = "BNE-RECEIVING-STAGING";

export type WarehouseReceiptMode = "scan_each" | "counted_quantity";

export const RECEIPT_DISCREPANCY_TYPES = [
  "short_pack",
  "over_received",
  "damaged",
  "wrong_item",
  "unknown_barcode",
] as const;

export type ReceiptDiscrepancyType = (typeof RECEIPT_DISCREPANCY_TYPES)[number];

export type ReceiptDiscrepancy = {
  type: ReceiptDiscrepancyType;
  reason: string;
};

export type WarehouseReceiptScope = {
  shipmentId: string;
  cartonNumbers: string[];
  lines: Array<{
    sku: string;
    expectedQuantity: number;
    productBarcode: string;
  }>;
};

function normalizedReceiptScope(scope: WarehouseReceiptScope) {
  const normalize = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");
  return {
    shipmentId: normalize(scope.shipmentId),
    cartonNumbers: scope.cartonNumbers.map(normalize).sort(),
    lines: scope.lines.map((line) => [
      normalize(line.sku),
      normalizeBarcode(line.productBarcode),
      line.expectedQuantity,
    ] as const).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  };
}

/** Compares an audited receipt/print snapshot with the current canonical Packing List scope. */
export function warehouseReceiptScopesMatch(
  actual: WarehouseReceiptScope,
  expected: WarehouseReceiptScope,
): boolean {
  try {
    return JSON.stringify(normalizedReceiptScope(actual)) === JSON.stringify(normalizedReceiptScope(expected));
  } catch {
    return false;
  }
}

/** The operational unit is a whole source scope, even when its SKU also occurs in another scope. */
export function assertReceiptScopeAvailable(
  scope: WarehouseReceiptScope,
  sessions: readonly { id: string; status: string; scopeSnapshot: WarehouseReceiptScope }[],
  excludeSessionId?: string,
): { ok: true } | { ok: false; message: string } {
  const normalize = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");
  const cartonNumbers = new Set(scope.cartonNumbers.map(normalize));
  const overlap = sessions.find(session => session.id !== excludeSessionId
    && session.status === "confirmed"
    && normalize(session.scopeSnapshot.shipmentId) === normalize(scope.shipmentId)
    && session.scopeSnapshot.cartonNumbers.some(carton => cartonNumbers.has(normalize(carton))));
  return overlap
    ? { ok: false, message: "This source scope overlaps an already confirmed receipt. Review receipt history before receiving more stock." }
    : { ok: true };
}

export function receiptRequestFingerprint(input: {
  scope: WarehouseReceiptScope;
  mode: WarehouseReceiptMode;
  lines: PreparedReceiptLine[];
}): string {
  const normalize = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");
  return JSON.stringify({
    shipmentId: normalize(input.scope.shipmentId),
    cartons: input.scope.cartonNumbers.map(normalize).sort(),
    mode: input.mode,
    expected: input.scope.lines.map(line => [normalize(line.sku), normalizeBarcode(line.productBarcode), line.expectedQuantity]).sort(),
    actual: input.lines.map(line => [normalize(line.sku), normalizeBarcode(line.productBarcode), line.expectedQuantity, line.actualQuantity,
      line.discrepancy?.type ?? null, line.discrepancy?.reason.trim() ?? null]).sort(),
  });
}

export type CountedReceiptLine = {
  productBarcode: string;
  actualQuantity: number;
  discrepancy?: ReceiptDiscrepancy;
};

export type PrepareWarehouseReceiptInput = {
  expectedScope: WarehouseReceiptScope;
  mode: "scan_each";
  scannedProductBarcodes: string[];
} | {
  expectedScope: WarehouseReceiptScope;
  mode: "counted_quantity";
  scannedProductBarcodes: string[];
  countedLines: CountedReceiptLine[];
};

export type PreparedReceiptLine = {
  sku: string;
  productBarcode: string;
  expectedQuantity: number;
  actualQuantity: number;
  discrepancy?: ReceiptDiscrepancy;
};

export type PrepareWarehouseReceiptResult =
  | { ok: true; stagingLocation: typeof RECEIVING_STAGING_LOCATION; lines: PreparedReceiptLine[] }
  | { ok: false; message: string };

function normalizeBarcode(value: string) {
  return value.trim().toUpperCase();
}

function normaliseReason(value?: string) {
  return value?.trim();
}

function validDiscrepancy(discrepancy?: ReceiptDiscrepancy): discrepancy is ReceiptDiscrepancy {
  const reason = normaliseReason(discrepancy?.reason);
  return Boolean(
    discrepancy &&
    RECEIPT_DISCREPANCY_TYPES.includes(discrepancy.type) &&
    reason &&
    reason.length >= 3,
  );
}

function validateScope(scope: WarehouseReceiptScope): string | undefined {
  if (!scope.shipmentId.trim()) return "Shipment is required.";
  if (!scope.cartonNumbers.map((carton) => carton.trim()).filter(Boolean).length) {
    return "At least one source carton is required.";
  }
  if (!scope.lines.length) return "At least one expected receipt line is required.";

  const barcodes = new Set<string>();
  for (const line of scope.lines) {
    const barcode = normalizeBarcode(line.productBarcode);
    if (!line.sku.trim() || !barcode) return "Every expected receipt line needs a SKU and product barcode.";
    if (!Number.isInteger(line.expectedQuantity) || line.expectedQuantity <= 0) {
      return `Expected quantity for ${line.sku} must be a positive integer.`;
    }
    if (barcodes.has(barcode)) return `Duplicate expected product barcode ${barcode}.`;
    barcodes.add(barcode);
  }
}

export function prepareWarehouseReceipt(
  input: PrepareWarehouseReceiptInput,
): PrepareWarehouseReceiptResult {
  const scopeError = validateScope(input.expectedScope);
  if (scopeError) return { ok: false, message: scopeError };

  const expectedByBarcode = new Map(
    input.expectedScope.lines.map((line) => [normalizeBarcode(line.productBarcode), line]),
  );
  const counted = new Map<string, { actualQuantity: number; discrepancy?: ReceiptDiscrepancy }>();

  if (input.mode === "scan_each") {
    if (!input.scannedProductBarcodes.length) {
      return { ok: false, message: "Scan at least one product label before confirming receipt." };
    }
    for (const scannedBarcode of input.scannedProductBarcodes) {
      const barcode = normalizeBarcode(scannedBarcode);
      const expected = expectedByBarcode.get(barcode);
      if (!expected) return { ok: false, message: `Product barcode ${barcode} is not expected in the selected receipt scope.` };
      const current = counted.get(barcode) ?? { actualQuantity: 0 };
      counted.set(barcode, { actualQuantity: current.actualQuantity + 1 });
    }
  } else {
    if (!input.scannedProductBarcodes.length) {
      return { ok: false, message: "Scan every expected product barcode before entering counted quantities." };
    }
    const recognisedBarcodes = new Set<string>();
    for (const scannedBarcode of input.scannedProductBarcodes) {
      const barcode = normalizeBarcode(scannedBarcode);
      if (!expectedByBarcode.has(barcode)) {
        return { ok: false, message: `Product barcode ${barcode} is not expected in the selected receipt scope.` };
      }
      recognisedBarcodes.add(barcode);
    }
    if (recognisedBarcodes.size !== expectedByBarcode.size) {
      return { ok: false, message: "Scan every expected product barcode before entering counted quantities." };
    }
    if (!input.countedLines.length) {
      return { ok: false, message: "Enter at least one counted receipt line." };
    }
    for (const line of input.countedLines) {
      const barcode = normalizeBarcode(line.productBarcode);
      const expected = expectedByBarcode.get(barcode);
      if (!expected) return { ok: false, message: `Product barcode ${barcode} is not expected in the selected receipt scope.` };
      if (counted.has(barcode)) {
        return { ok: false, message: `Duplicate counted line for product barcode ${barcode}.` };
      }
      if (!Number.isInteger(line.actualQuantity) || line.actualQuantity < 0) {
        return { ok: false, message: `Actual quantity for ${expected.sku} must be a non-negative integer.` };
      }
      if (line.actualQuantity !== expected.expectedQuantity && !validDiscrepancy(line.discrepancy)) {
        return { ok: false, message: `A discrepancy reason is required for ${expected.sku}.` };
      }
      counted.set(barcode, {
        actualQuantity: line.actualQuantity,
        discrepancy: line.discrepancy && validDiscrepancy(line.discrepancy)
          ? { type: line.discrepancy.type, reason: line.discrepancy.reason.trim() }
          : undefined,
      });
    }
  }

  const lines: PreparedReceiptLine[] = [];
  for (const [barcode, expected] of expectedByBarcode) {
    const count = counted.get(barcode);
    if (!count) {
      return { ok: false, message: `A counted quantity is required for ${expected.sku}.` };
    }
    if (input.mode === "scan_each" && count.actualQuantity !== expected.expectedQuantity) {
      return { ok: false, message: `A discrepancy reason is required for ${expected.sku}.` };
    }
    lines.push({
      sku: expected.sku,
      productBarcode: expected.productBarcode,
      expectedQuantity: expected.expectedQuantity,
      actualQuantity: count.actualQuantity,
      ...(count.discrepancy ? { discrepancy: count.discrepancy } : {}),
    });
  }

  return { ok: true, stagingLocation: RECEIVING_STAGING_LOCATION, lines };
}
