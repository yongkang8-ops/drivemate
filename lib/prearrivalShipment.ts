export type PackingListRevisionInput = {
  shipmentId: string;
  pallets: Array<{
    sourcePalletNumber: string;
    cartons: Array<{
      sourceCartonNumber: string;
      lines: Array<{
        sku: string;
        expectedQuantity: number;
        batchLot?: string;
      }>;
    }>;
  }>;
};

export type ValidatedPackingListRevision = PackingListRevisionInput;

export type PackingListRevisionValidationResult =
  | {
      ok: true;
      revision: ValidatedPackingListRevision;
      totalExpectedQuantity: number;
    }
  | { ok: false; message: string };

export type PackingListRevisionValidationOptions = {
  knownSkus?: readonly string[];
};

function normalizeIdentifier(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function hasIdentifier(value: string): boolean {
  return Boolean(normalizeIdentifier(value));
}

export function validatePackingListRevision(
  input: PackingListRevisionInput,
  options: PackingListRevisionValidationOptions = {},
): PackingListRevisionValidationResult {
  if (!hasIdentifier(input.shipmentId)) {
    return { ok: false, message: "Shipment is required." };
  }
  if (!input.pallets.length) {
    return { ok: false, message: "At least one pallet is required." };
  }

  const knownSkus = options.knownSkus
    ? new Set(options.knownSkus.map(normalizeIdentifier).filter(Boolean))
    : undefined;
  const palletNumbers = new Set<string>();
  const cartonNumbers = new Set<string>();
  let totalExpectedQuantity = 0;

  for (const pallet of input.pallets) {
    const palletNumber = normalizeIdentifier(pallet.sourcePalletNumber);
    if (!palletNumber) return { ok: false, message: "Every pallet needs a source pallet number." };
    if (palletNumbers.has(palletNumber)) {
      return { ok: false, message: `Duplicate pallet number: ${pallet.sourcePalletNumber}.` };
    }
    palletNumbers.add(palletNumber);

    if (!pallet.cartons.length) {
      return { ok: false, message: `Pallet ${pallet.sourcePalletNumber} needs at least one carton.` };
    }

    for (const carton of pallet.cartons) {
      const cartonNumber = normalizeIdentifier(carton.sourceCartonNumber);
      if (!cartonNumber) return { ok: false, message: "Every carton needs a source carton number." };
      if (cartonNumbers.has(cartonNumber)) {
        return { ok: false, message: `Duplicate carton number: ${carton.sourceCartonNumber}.` };
      }
      cartonNumbers.add(cartonNumber);

      if (!carton.lines.length) {
        return { ok: false, message: `Carton ${carton.sourceCartonNumber} needs at least one SKU line.` };
      }

      const cartonSkus = new Set<string>();
      for (const line of carton.lines) {
        const sku = normalizeIdentifier(line.sku);
        if (!sku) return { ok: false, message: `Carton ${carton.sourceCartonNumber} has a blank SKU.` };
        if (cartonSkus.has(sku)) {
          return { ok: false, message: `Duplicate SKU ${line.sku} in carton ${carton.sourceCartonNumber}.` };
        }
        if (knownSkus && !knownSkus.has(sku)) {
          return { ok: false, message: `SKU ${line.sku} is not in the approved product master.` };
        }
        if (!Number.isInteger(line.expectedQuantity) || line.expectedQuantity <= 0) {
          return { ok: false, message: `SKU ${line.sku} needs a positive whole expected quantity.` };
        }
        cartonSkus.add(sku);
        totalExpectedQuantity += line.expectedQuantity;
      }
    }
  }

  return {
    ok: true,
    revision: structuredClone(input),
    totalExpectedQuantity,
  };
}
