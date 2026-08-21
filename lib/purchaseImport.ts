import { createHash } from "node:crypto";
import readXlsxFile from "read-excel-file/node";

export const AUTHORITATIVE_PI = {
  fileName: "附件一_GWM首批汽配_Final_PI_20260820.xlsx",
  sha256: "F7C6F6BB4576CCCA62221E50D27E2FCCF3CAB3C46F9889404F87C0B59E9ABB4C",
  contractNumber: "AJG-YJ-GWM-202608-01",
  lineCount: 119,
  quantity: 706,
} as const;

export type RiskTier = "low" | "medium" | "high";

export type PurchaseImportLine = {
  sku: string;
  sourceRowNumber: number;
  partNumber: string;
  nameZh: string;
  nameEn: string;
  category: string;
  sourceFitmentText: string;
  quality: string;
  originCountry: string;
  unit: string;
  quantity: number;
  unitPriceInclVatMinor: number;
  originalAmountMinor: number;
  allocatedDiscountMinor: number;
  cashPurchaseCostMinor: number;
  riskTier: RiskTier;
  position?: string;
  packaging?: SupplementalPackaging;
  sourceEvidence: Array<{ file: string; sha256: string; row: number; fields: string[] }>;
};

export type SupplementalPackaging = {
  sourceRow?: number;
  cartonNumber?: string;
  palletNumber?: string;
  unitDimensions?: string;
  unitGrossWeightGrams?: number;
  outerDimensions?: string;
  outerGrossWeightGrams?: number;
};

export type PurchaseImportPreview = {
  authoritative: typeof AUTHORITATIVE_PI;
  sourceSha256: string;
  supplementalSha256?: string;
  supplierName: string;
  lines: PurchaseImportLine[];
  cartons: SupplementalCarton[];
  pallets: SupplementalPallet[];
  warnings: string[];
  excludedSupplementalPartNumbers: string[];
  summary: {
    lineCount: number;
    uniquePartNumbers: number;
    quantity: number;
    subtotalMinor: number;
    discountMinor: number;
    finalTotalMinor: number;
    riskCounts: Record<RiskTier, number>;
    supplementedLines: number;
  };
};

export type SupplementalCarton = {
  cartonNumber: string;
  palletNumber?: string;
  cartonCount: number;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  grossWeightGrams?: number;
  contents?: string;
};

export type SupplementalPallet = {
  palletNumber: string;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  grossWeightGrams?: number;
  cartonNumbers: string[];
};

type SupplementalData = {
  metadata?: { contract_no?: string };
  items?: Array<Record<string, unknown>>;
  excluded_items?: Array<Record<string, unknown>>;
  cartons?: Array<Record<string, unknown>>;
  pallets?: Array<Record<string, unknown>>;
};

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function integer(value: unknown, label: string, row: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} is invalid at source row ${row}.`);
  return parsed;
}

function moneyMinor(value: unknown, label: string, row: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} is invalid at source row ${row}.`);
  return Math.round((parsed + Number.EPSILON) * 100);
}

function numberOrUndefined(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mm(value: unknown) {
  const parsed = numberOrUndefined(value);
  return parsed === undefined ? undefined : Math.round(parsed * 10);
}

function grams(value: unknown) {
  const parsed = numberOrUndefined(value);
  return parsed === undefined ? undefined : Math.round(parsed * 1000);
}

export function classifyRisk(nameEn: string, category: string): RiskTier {
  const value = `${nameEn} ${category}`.toLowerCase();
  const high = [
    "brake pad",
    "brake disc",
    "brake rotor",
    "shock absorber",
    "control arm",
    "tie rod",
    "stabilizer",
    "wheel hub",
    "wheel bearing",
    "steering",
  ];
  if (high.some((keyword) => value.includes(keyword))) return "high";

  const medium = [
    "timing belt",
    "water pump",
    "tensioner",
    "engine mount",
    "transmission mount",
    "transmission oil pan",
    "transmission filter",
  ];
  return medium.some((keyword) => value.includes(keyword)) ? "medium" : "low";
}

export function inferPosition(nameEn: string, fitment: string) {
  const value = `${nameEn} ${fitment}`.toLowerCase();
  const positions = [
    ["front left", "front-left"],
    ["front right", "front-right"],
    ["rear left", "rear-left"],
    ["rear right", "rear-right"],
    [" lh", "left"],
    [" rh", "right"],
    ["front", "front"],
    ["rear", "rear"],
  ] as const;
  return positions.find(([needle]) => value.includes(needle))?.[1];
}

export function allocateDiscountLargestRemainder(amounts: number[], discountMinor: number) {
  const subtotal = amounts.reduce((sum, value) => sum + value, 0);
  if (subtotal <= 0 || discountMinor < 0 || discountMinor > subtotal) {
    throw new Error("Discount allocation inputs are invalid.");
  }

  const allocations = amounts.map((amount, index) => {
    const numerator = BigInt(amount) * BigInt(discountMinor);
    const denominator = BigInt(subtotal);
    return {
      index,
      floor: Number(numerator / denominator),
      remainder: numerator % denominator,
    };
  });
  let remaining = discountMinor - allocations.reduce((sum, row) => sum + row.floor, 0);
  const ranked = [...allocations].sort((left, right) => {
    if (left.remainder === right.remainder) return left.index - right.index;
    return left.remainder > right.remainder ? -1 : 1;
  });
  for (let index = 0; index < remaining; index += 1) ranked[index].floor += 1;
  return allocations.sort((left, right) => left.index - right.index).map((row) => row.floor);
}

function parseSupplemental(buffer: Buffer | undefined, partNumbers: Set<string>) {
  if (!buffer) {
    return {
      sha256: undefined,
      packaging: new Map<string, SupplementalPackaging>(),
      cartons: [] as SupplementalCarton[],
      pallets: [] as SupplementalPallet[],
      excluded: [] as string[],
      warnings: ["Supplemental packing JSON was not supplied."],
    };
  }

  const parsed = JSON.parse(buffer.toString("utf8")) as SupplementalData;
  if (parsed.metadata?.contract_no && parsed.metadata.contract_no !== AUTHORITATIVE_PI.contractNumber) {
    throw new Error("Supplemental JSON contract number does not match the authoritative PI.");
  }

  const warnings: string[] = [];
  const packaging = new Map<string, SupplementalPackaging>();
  for (const item of parsed.items ?? []) {
    const partNumber = text(item.pn).toUpperCase();
    if (!partNumbers.has(partNumber)) {
      warnings.push(`Supplemental PN ${partNumber || "(blank)"} is not present in the PI and was ignored.`);
      continue;
    }
    packaging.set(partNumber, {
      sourceRow: numberOrUndefined(item.source_row),
      cartonNumber: text(item.box_no) || undefined,
      palletNumber: text(item.pallet_note) || undefined,
      unitDimensions: text(item.unit_dimensions) || undefined,
      unitGrossWeightGrams: grams(item.unit_gross_weight),
      outerDimensions: text(item.outer_dimensions) || undefined,
      outerGrossWeightGrams: grams(item.outer_gross_weight),
    });
  }

  const excluded = (parsed.excluded_items ?? []).map((item) => text(item.pn).toUpperCase()).filter(Boolean);
  const overlap = excluded.filter((partNumber) => partNumbers.has(partNumber));
  if (overlap.length) {
    warnings.push(`Supplemental excluded_items overlap the PI and were not imported: ${overlap.join(", ")}.`);
  }

  const cartons = (parsed.cartons ?? []).map((carton) => ({
    cartonNumber: text(carton.box_no),
    palletNumber: text(carton.pallet_note) || undefined,
    cartonCount: Math.max(1, integer(carton.carton_count ?? 1, "Carton count", 0)),
    lengthMm: mm(carton.length_cm),
    widthMm: mm(carton.width_cm),
    heightMm: mm(carton.height_cm),
    grossWeightGrams: grams(carton.gross_weight_kg),
    contents: text(carton.contents) || undefined,
  })).filter((carton) => carton.cartonNumber);

  const pallets = (parsed.pallets ?? []).map((pallet) => ({
    palletNumber: text(pallet.pallet_no),
    lengthMm: mm(pallet.length_cm),
    widthMm: mm(pallet.width_cm),
    heightMm: mm(pallet.height_cm),
    grossWeightGrams: grams(pallet.measured_gross_weight_kg),
    cartonNumbers: Array.isArray(pallet.box_numbers) ? pallet.box_numbers.map(text).filter(Boolean) : [],
  })).filter((pallet) => pallet.palletNumber);

  return { sha256: sha256(buffer), packaging, cartons, pallets, excluded, warnings };
}

export async function previewPurchaseImport(
  piBuffer: Buffer,
  supplementalBuffer?: Buffer,
): Promise<PurchaseImportPreview> {
  const sourceSha256 = sha256(piBuffer);
  if (sourceSha256 !== AUTHORITATIVE_PI.sha256) {
    throw new Error(`PI SHA256 mismatch. Expected ${AUTHORITATIVE_PI.sha256}, received ${sourceSha256}.`);
  }

  const rows = await readXlsxFile(piBuffer);
  if (rows.length < 129) throw new Error("The authoritative PI does not contain the expected rows.");

  const contractCell = text(rows[1]?.[0]);
  if (!contractCell.includes(AUTHORITATIVE_PI.contractNumber)) throw new Error("PI contract number mismatch.");
  const supplierCell = text(rows[2]?.[6]);
  const supplierName = supplierCell.replace(/^.*?[:：]\s*/, "").trim() || "PI supplier";

  const rawLines = rows.slice(6, 125).map((row, index) => {
    const sourceRowNumber = index + 7;
    const sequence = integer(row[0], "Line number", sourceRowNumber);
    if (sequence !== index + 1) throw new Error(`Unexpected line sequence at source row ${sourceRowNumber}.`);
    const partNumber = text(row[1]).toUpperCase();
    if (!partNumber) throw new Error(`Part Number is blank at source row ${sourceRowNumber}.`);
    const quantity = integer(row[9], "Quantity", sourceRowNumber);
    const unitPriceInclVatMinor = moneyMinor(row[10], "Unit price", sourceRowNumber);
    const originalAmountMinor = moneyMinor(row[11], "Line amount", sourceRowNumber);
    if (unitPriceInclVatMinor * quantity !== originalAmountMinor) {
      throw new Error(`Line amount does not equal quantity x unit price at source row ${sourceRowNumber}.`);
    }
    return {
      sku: `DM-GWM-${String(sequence).padStart(4, "0")}`,
      sourceRowNumber,
      partNumber,
      nameZh: text(row[2]),
      nameEn: text(row[3]),
      category: text(row[4]),
      sourceFitmentText: text(row[5]),
      quality: text(row[6]),
      originCountry: text(row[7]),
      unit: text(row[8]),
      quantity,
      unitPriceInclVatMinor,
      originalAmountMinor,
    };
  });

  const uniquePartNumbers = new Set(rawLines.map((line) => line.partNumber));
  const subtotalMinor = rawLines.reduce((sum, line) => sum + line.originalAmountMinor, 0);
  const quantity = rawLines.reduce((sum, line) => sum + line.quantity, 0);
  const workbookSubtotalMinor = moneyMinor(rows[126]?.[11], "Merchandise subtotal", 127);
  const workbookDiscountMinor = Math.abs(Math.round(Number(rows[127]?.[11]) * 100));
  const workbookFinalMinor = moneyMinor(rows[128]?.[11], "Final contract amount", 129);

  const actuals = {
    lineCount: rawLines.length,
    uniquePartNumbers: uniquePartNumbers.size,
    quantity,
    subtotalMinor,
    workbookSubtotalMinor,
    workbookDiscountMinor,
    workbookFinalMinor,
  };
  if (
    actuals.lineCount !== AUTHORITATIVE_PI.lineCount ||
    actuals.uniquePartNumbers !== AUTHORITATIVE_PI.lineCount ||
    actuals.quantity !== AUTHORITATIVE_PI.quantity ||
    actuals.subtotalMinor !== actuals.workbookSubtotalMinor ||
    actuals.workbookFinalMinor !== actuals.workbookSubtotalMinor - actuals.workbookDiscountMinor
  ) {
    throw new Error(`PI control totals failed: ${JSON.stringify(actuals)}.`);
  }

  const supplemental = parseSupplemental(supplementalBuffer, uniquePartNumbers);
  const discounts = allocateDiscountLargestRemainder(
    rawLines.map((line) => line.originalAmountMinor),
    workbookDiscountMinor,
  );
  const riskCounts: Record<RiskTier, number> = { low: 0, medium: 0, high: 0 };
  const lines: PurchaseImportLine[] = rawLines.map((line, index) => {
    const riskTier = classifyRisk(line.nameEn, line.category);
    riskCounts[riskTier] += 1;
    return {
      ...line,
      allocatedDiscountMinor: discounts[index],
      cashPurchaseCostMinor: line.originalAmountMinor - discounts[index],
      riskTier,
      position: inferPosition(line.nameEn, line.sourceFitmentText),
      packaging: supplemental.packaging.get(line.partNumber),
      sourceEvidence: [{
        file: AUTHORITATIVE_PI.fileName,
        sha256: sourceSha256,
        row: line.sourceRowNumber,
        fields: ["part_number", "names", "category", "fitment", "quality", "origin", "unit", "quantity", "price"],
      }],
    };
  });

  const allocatedDiscount = lines.reduce((sum, line) => sum + line.allocatedDiscountMinor, 0);
  const cashTotal = lines.reduce((sum, line) => sum + line.cashPurchaseCostMinor, 0);
  if (allocatedDiscount !== workbookDiscountMinor || cashTotal !== workbookFinalMinor) {
    throw new Error("Largest remainder discount allocation did not reconcile to the contract total.");
  }

  return {
    authoritative: AUTHORITATIVE_PI,
    sourceSha256,
    supplementalSha256: supplemental.sha256,
    supplierName,
    lines,
    cartons: supplemental.cartons,
    pallets: supplemental.pallets,
    warnings: supplemental.warnings,
    excludedSupplementalPartNumbers: supplemental.excluded,
    summary: {
      lineCount: lines.length,
      uniquePartNumbers: uniquePartNumbers.size,
      quantity,
      subtotalMinor,
      discountMinor: allocatedDiscount,
      finalTotalMinor: cashTotal,
      riskCounts,
      supplementedLines: lines.filter((line) => line.packaging).length,
    },
  };
}
