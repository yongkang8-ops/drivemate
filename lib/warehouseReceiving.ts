export const RECEIVING_STAGING_LOCATION = "BNE-RECEIVING-STAGING";

export type WarehouseReceiptMode = "scan_each" | "counted_quantity";

export type ExpectedCartonReceipt = {
  shipmentId: string;
  cartonNumber: string;
  lines: Array<{
    sku: string;
    expectedQuantity: number;
    productBarcode: string;
  }>;
};

type CountedReceiptLine = {
  productBarcode: string;
  actualQuantity: number;
  discrepancyReason?: string;
};

type PrepareWarehouseReceiptInput = {
  expectedCarton: ExpectedCartonReceipt;
  mode: "scan_each";
  scannedProductBarcodes: string[];
} | {
  expectedCarton: ExpectedCartonReceipt;
  mode: "counted_quantity";
  countedLines: CountedReceiptLine[];
};

type PreparedReceiptLine = {
  sku: string;
  expectedQuantity: number;
  actualQuantity: number;
  discrepancyReason?: string;
};

export type PrepareWarehouseReceiptResult =
  | { ok: true; stagingLocation: typeof RECEIVING_STAGING_LOCATION; lines: PreparedReceiptLine[] }
  | { ok: false; message: string };

function normalizeBarcode(value: string) {
  return value.trim().toUpperCase();
}

export function prepareWarehouseReceipt(
  input: PrepareWarehouseReceiptInput,
): PrepareWarehouseReceiptResult {
  const expectedByBarcode = new Map(
    input.expectedCarton.lines.map((line) => [normalizeBarcode(line.productBarcode), line]),
  );
  const counted = new Map<string, { actualQuantity: number; discrepancyReason?: string }>();

  if (input.mode === "scan_each") {
    for (const scannedBarcode of input.scannedProductBarcodes) {
      const barcode = normalizeBarcode(scannedBarcode);
      const expected = expectedByBarcode.get(barcode);
      if (!expected) return { ok: false, message: `Product barcode ${barcode} is not expected in carton ${input.expectedCarton.cartonNumber}.` };
      const current = counted.get(barcode) ?? { actualQuantity: 0 };
      counted.set(barcode, { actualQuantity: current.actualQuantity + 1 });
    }
  } else {
    for (const line of input.countedLines) {
      const barcode = normalizeBarcode(line.productBarcode);
      const expected = expectedByBarcode.get(barcode);
      if (!expected) return { ok: false, message: `Product barcode ${barcode} is not expected in carton ${input.expectedCarton.cartonNumber}.` };
      if (!Number.isInteger(line.actualQuantity) || line.actualQuantity < 0) {
        return { ok: false, message: `Actual quantity for ${expected.sku} must be a non-negative integer.` };
      }
      const discrepancyReason = line.discrepancyReason?.trim();
      if (line.actualQuantity !== expected.expectedQuantity && !discrepancyReason) {
        return { ok: false, message: `A discrepancy reason is required for ${expected.sku}.` };
      }
      counted.set(barcode, { actualQuantity: line.actualQuantity, discrepancyReason });
    }
  }

  const lines: PreparedReceiptLine[] = [];
  for (const [barcode, count] of counted) {
    const expected = expectedByBarcode.get(barcode);
    if (!expected) continue;
    if (input.mode === "scan_each" && count.actualQuantity !== expected.expectedQuantity) {
      return { ok: false, message: `A discrepancy reason is required for ${expected.sku}.` };
    }
    lines.push({
      sku: expected.sku,
      expectedQuantity: expected.expectedQuantity,
      actualQuantity: count.actualQuantity,
      discrepancyReason: count.discrepancyReason,
    });
  }

  return { ok: true, stagingLocation: RECEIVING_STAGING_LOCATION, lines };
}
