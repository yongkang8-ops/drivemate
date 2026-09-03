import type { WarehouseExpectedReceipt } from "./warehouseLabels";

export type PackingListLineInput = {
  sku: string;
  expectedQuantity: number;
  batchLot?: string;
};

export type PackingListCartonInput = {
  sourceCartonNumber: string;
  sourcePalletNumber?: string | null;
  lines: PackingListLineInput[];
};

export type PackingListCartonScopeInput = PackingListCartonInput & (
  | {
      kind: "carton";
      physicalCartonCount: 1;
      memberCartonNumbers: string[];
    }
  | {
      kind: "carton_group";
      physicalCartonCount: number;
      memberCartonNumbers: string[];
    }
);

export type PackingListRevisionInputV1 = {
  schemaVersion?: 1;
  shipmentId: string;
  pallets: Array<{
    sourcePalletNumber: string;
    cartons: Array<{
      sourceCartonNumber: string;
      lines: PackingListLineInput[];
    }>;
  }>;
};

export type PackingListRevisionInputV2 = {
  schemaVersion: 2;
  shipmentId: string;
  physicalPalletCount?: number | null;
  cartons: PackingListCartonInput[];
};

export type PackingListRevisionInputV3 = {
  schemaVersion: 3;
  shipmentId: string;
  physicalPalletCount?: number | null;
  cartons: PackingListCartonScopeInput[];
};

export type PackingListRevisionInput = PackingListRevisionInputV1 | PackingListRevisionInputV2 | PackingListRevisionInputV3;

export type ValidatedPackingListRevisionV2 = {
  schemaVersion: 2;
  shipmentId: string;
  physicalPalletCount: number | null;
  cartons: PackingListCartonInput[];
};

export type ValidatedPackingListRevisionV3 = {
  schemaVersion: 3;
  shipmentId: string;
  physicalPalletCount: number | null;
  cartons: PackingListCartonScopeInput[];
};

export type ValidatedPackingListRevision = ValidatedPackingListRevisionV2 | ValidatedPackingListRevisionV3;

export type CartonStructureSummary = {
  sourceScopeCount: number;
  physicalCartonCount: number;
  cartonGroupCount: number;
};

export type PalletMappingStatus = "not_recorded" | "partial" | "complete";

export type PalletMappingSummary = {
  status: PalletMappingStatus;
  physicalPalletCount: number | null;
  mappedPalletCount: number;
  mappedCartonCount: number;
  totalCartonCount: number;
};

export type PackingListRevisionValidationResult =
  | {
      ok: true;
      revision: ValidatedPackingListRevision;
      totalExpectedQuantity: number;
      palletMapping: PalletMappingSummary;
    }
  | { ok: false; message: string };

export type PackingListRevisionValidationOptions = {
  knownSkus?: readonly string[];
};

export type ShipmentProductRecord = {
  id: string;
  sku: string;
  barcode?: string | null;
};

const SHIPMENT_SCOPE_PAGE_SIZE = 500;
const SHIPMENT_PRODUCT_CHUNK_SIZE = 100;

export async function loadCompleteShipmentProductPages<T>(
  loadPage: (from: number, to: number) => Promise<{ rows: T[]; count: number | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  let expectedCount: number | undefined;

  while (expectedCount === undefined || rows.length < expectedCount) {
    const page = await loadPage(rows.length, rows.length + SHIPMENT_SCOPE_PAGE_SIZE - 1);
    if (page.count === null || (expectedCount !== undefined && page.count !== expectedCount)) {
      throw new Error("Purchase-order line scope count was unavailable or changed.");
    }
    expectedCount ??= page.count;
    if (!page.rows.length && rows.length < expectedCount) {
      throw new Error("Purchase-order line scope was incomplete.");
    }
    rows.push(...page.rows);
    if (rows.length > expectedCount) {
      throw new Error("Purchase-order line scope exceeded its exact count.");
    }
  }

  return rows;
}

export function chunkShipmentProductIds(
  productIds: readonly string[],
): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < productIds.length; index += SHIPMENT_PRODUCT_CHUNK_SIZE) {
    chunks.push(productIds.slice(index, index + SHIPMENT_PRODUCT_CHUNK_SIZE));
  }
  return chunks;
}

export function assertCompleteShipmentProductRecords(
  requestedIds: readonly string[],
  productRecords: readonly ShipmentProductRecord[],
): void {
  const requested = new Set(requestedIds);
  const returned = new Set<string>();
  for (const product of productRecords) {
    if (!requested.has(product.id) || returned.has(product.id)) {
      throw new Error("Shipment product scope was incomplete.");
    }
    returned.add(product.id);
  }
  if (returned.size !== requested.size) {
    throw new Error("Shipment product scope was incomplete.");
  }
}

export function buildShipmentProductScope(
  purchaseOrderLines: readonly { productId: string }[],
  products: readonly ShipmentProductRecord[],
): {
  allowedSkus: string[];
  productRecords: ShipmentProductRecord[];
} {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const matchedLines = purchaseOrderLines.flatMap((line) => {
    const product = productsById.get(line.productId);
    if (!product) return [];
    if (product.sku !== product.sku.trim()) return [];
    const normalizedSku = product.sku.trim().toUpperCase();
    return normalizedSku ? [{ normalizedSku, product }] : [];
  });
  const lineCountBySku = new Map<string, number>();
  for (const { normalizedSku } of matchedLines) {
    lineCountBySku.set(normalizedSku, (lineCountBySku.get(normalizedSku) ?? 0) + 1);
  }

  const allowedSkus: string[] = [];
  const productRecords: ShipmentProductRecord[] = [];
  const addedSkus = new Set<string>();
  for (const { normalizedSku, product } of matchedLines) {
    if (lineCountBySku.get(normalizedSku) !== 1 || addedSkus.has(normalizedSku)) continue;
    addedSkus.add(normalizedSku);
    allowedSkus.push(normalizedSku);
    productRecords.push(product);
  }

  return { allowedSkus, productRecords };
}

export type PackingListReadiness = "not_started" | "draft" | "confirmed";

export type PackingListRevisionReadiness = {
  version: number;
  status: "draft" | "confirmed" | "superseded";
};

export function summarizePackingListReadiness(
  revisions: readonly PackingListRevisionReadiness[],
): {
  packingListStatus: PackingListReadiness;
  latestPackingListVersion?: number;
  confirmedPackingListVersion?: number;
} {
  const latestPackingListVersion = revisions.length
    ? Math.max(...revisions.map((revision) => revision.version))
    : undefined;
  const confirmedPackingListVersion = revisions
    .filter((revision) => revision.status === "confirmed")
    .reduce<number | undefined>(
      (latest, revision) => latest === undefined || revision.version > latest
        ? revision.version
        : latest,
      undefined,
    );

  return {
    packingListStatus: confirmedPackingListVersion !== undefined
      ? "confirmed"
      : revisions.some((revision) => revision.status === "draft")
        ? "draft"
        : "not_started",
    latestPackingListVersion,
    confirmedPackingListVersion,
  };
}

export function receiptFromPackingListRevision(
  input: PackingListRevisionInput,
): WarehouseExpectedReceipt {
  const validation = validatePackingListRevision(input);
  if (!validation.ok) throw new Error(validation.message);
  const revision = validation.revision;
  const palletNumbers = [...new Set(
    revision.cartons
      .map((carton) => carton.sourcePalletNumber)
      .filter((value): value is string => Boolean(value)),
  )];
  return {
    shipmentId: revision.shipmentId,
    physicalPalletCount: revision.physicalPalletCount,
    palletMappingStatus: derivePalletMappingSummary(revision).status,
    pallets: palletNumbers.map((sourcePalletNumber) => ({ sourcePalletNumber })),
    cartons: revision.cartons.map((carton) => ({
      sourceCartonNumber: carton.sourceCartonNumber,
      ...("kind" in carton ? {
        kind: carton.kind,
        physicalCartonCount: carton.physicalCartonCount,
        memberCartonNumbers: [...carton.memberCartonNumbers],
      } : {}),
      ...(carton.sourcePalletNumber
        ? { sourcePalletNumber: carton.sourcePalletNumber }
        : {}),
    })),
    lines: revision.cartons.flatMap((carton) =>
      carton.lines.map((line) => ({
        ...(carton.sourcePalletNumber
          ? { sourcePalletNumber: carton.sourcePalletNumber }
          : {}),
        sourceCartonNumber: carton.sourceCartonNumber,
        sku: line.sku,
        expectedQuantity: line.expectedQuantity,
      })),
    ),
  };
}

export function mapReceiptProductBarcodes(
  receiptLines: readonly { sku: string }[],
  productRecords: readonly { sku: string; barcode?: string | null }[],
): Record<string, string> {
  const productsBySku = new Map<string, { barcode: string; normalizedBarcode: string }>();
  for (const product of productRecords) {
    const barcode = product.barcode?.trim();
    if (!barcode) continue;

    const sku = product.sku.trim().toUpperCase();
    const normalizedBarcode = barcode.toUpperCase();
    const existing = productsBySku.get(sku);
    if (existing && existing.normalizedBarcode !== normalizedBarcode) {
      throw new Error(`Conflicting product barcodes for normalized SKU ${sku}.`);
    }
    if (!existing) productsBySku.set(sku, { barcode, normalizedBarcode });
  }

  return Object.fromEntries(
    receiptLines.flatMap((line) => {
      const barcode = productsBySku.get(line.sku.trim().toUpperCase())?.barcode;
      return barcode ? [[line.sku, barcode]] : [];
    }),
  );
}

export function normalizePackingIdentifier(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

export function preservesUsedPackingScopes(
  previous: ValidatedPackingListRevision,
  next: ValidatedPackingListRevision,
  usedScopeNumbers: readonly string[],
): boolean {
  const contract = (carton: PackingListCartonInput | PackingListCartonScopeInput) => JSON.stringify({
    kind: "kind" in carton ? carton.kind : "carton",
    count: "physicalCartonCount" in carton ? carton.physicalCartonCount : 1,
    members: ("memberCartonNumbers" in carton ? carton.memberCartonNumbers : [carton.sourceCartonNumber]).map(normalizePackingIdentifier).sort(),
    lines: carton.lines.map(line => [line.sku.trim().toUpperCase(), line.expectedQuantity, line.batchLot ?? null]).sort(),
  });
  return usedScopeNumbers.every(identifier => {
    const key = normalizePackingIdentifier(identifier);
    const before = previous.cartons.find(carton => normalizePackingIdentifier(carton.sourceCartonNumber) === key);
    const after = next.cartons.find(carton => normalizePackingIdentifier(carton.sourceCartonNumber) === key);
    return Boolean(before && after && contract(before) === contract(after));
  });
}

function normalizeSkuIdentifier(value: string): string {
  return value.trim().toUpperCase();
}

function hasIdentifier(value: string): boolean {
  return Boolean(normalizePackingIdentifier(value));
}

export function derivePalletMappingSummary(input: {
  physicalPalletCount?: number | null;
  cartons: readonly { sourcePalletNumber?: string | null }[];
}): PalletMappingSummary {
  const mappedPallets = new Set<string>();
  let mappedCartonCount = 0;
  for (const carton of input.cartons) {
    const palletNumber = normalizePackingIdentifier(carton.sourcePalletNumber ?? "");
    if (!palletNumber) continue;
    mappedCartonCount += 1;
    mappedPallets.add(palletNumber);
  }
  return {
    status: mappedCartonCount === 0
      ? "not_recorded"
      : mappedCartonCount === input.cartons.length
        ? "complete"
        : "partial",
    physicalPalletCount: input.physicalPalletCount ?? null,
    mappedPalletCount: mappedPallets.size,
    mappedCartonCount,
    totalCartonCount: input.cartons.length,
  };
}

export function deriveCartonStructureSummary(
  input: PackingListRevisionInput | ValidatedPackingListRevision,
): CartonStructureSummary {
  if ("schemaVersion" in input && input.schemaVersion === 3) {
    return {
      sourceScopeCount: input.cartons.length,
      physicalCartonCount: input.cartons.reduce(
        (total, carton) => total + carton.physicalCartonCount,
        0,
      ),
      cartonGroupCount: input.cartons.filter((carton) => carton.kind === "carton_group").length,
    };
  }
  const cartons = "cartons" in input
    ? input.cartons
    : input.pallets.flatMap((pallet) => pallet.cartons);

  return {
    sourceScopeCount: cartons.length,
    physicalCartonCount: cartons.length,
    cartonGroupCount: 0,
  };
}

function normalizePackingListInput(
  input: PackingListRevisionInput,
): ValidatedPackingListRevision {
  if ("schemaVersion" in input && input.schemaVersion === 3) {
    return {
      schemaVersion: 3,
      shipmentId: input.shipmentId,
      physicalPalletCount: input.physicalPalletCount ?? null,
      cartons: input.cartons.map((carton) => ({
        sourceCartonNumber: carton.sourceCartonNumber,
        sourcePalletNumber: normalizePackingIdentifier(carton.sourcePalletNumber ?? "") || null,
        kind: carton.kind,
        physicalCartonCount: carton.physicalCartonCount,
        memberCartonNumbers: [...carton.memberCartonNumbers],
        lines: carton.lines.map((line) => ({ ...line })),
      })) as PackingListCartonScopeInput[],
    };
  }

  if ("schemaVersion" in input && input.schemaVersion === 2) {
    return {
      schemaVersion: 2,
      shipmentId: input.shipmentId,
      physicalPalletCount: input.physicalPalletCount ?? null,
      cartons: input.cartons.map((carton) => ({
        sourceCartonNumber: carton.sourceCartonNumber,
        sourcePalletNumber: normalizePackingIdentifier(carton.sourcePalletNumber ?? "") || null,
        lines: carton.lines.map((line) => ({ ...line })),
      })),
    };
  }

  return {
    schemaVersion: 2,
    shipmentId: input.shipmentId,
    physicalPalletCount: input.pallets.length || null,
    cartons: input.pallets.flatMap((pallet) =>
      pallet.cartons.map((carton) => ({
        sourceCartonNumber: carton.sourceCartonNumber,
        sourcePalletNumber: pallet.sourcePalletNumber,
        lines: carton.lines.map((line) => ({ ...line })),
      })),
    ),
  };
}

export function validatePackingListRevision(
  input: PackingListRevisionInput,
  options: PackingListRevisionValidationOptions = {},
): PackingListRevisionValidationResult {
  if (!hasIdentifier(input.shipmentId)) {
    return { ok: false, message: "Shipment is required." };
  }
  const revision = normalizePackingListInput(input);
  if (!revision.cartons.length) return { ok: false, message: "At least one carton is required." };
  if (
    revision.physicalPalletCount !== null
    && (!Number.isSafeInteger(revision.physicalPalletCount) || revision.physicalPalletCount <= 0)
  ) return { ok: false, message: "Physical pallet count must be a positive whole number when provided." };

  const knownSkus = options.knownSkus
    ? new Set(options.knownSkus.map(normalizeSkuIdentifier).filter(Boolean))
    : undefined;
  const cartonNumbers = new Set<string>();
  const memberCartonNumbers = new Set<string>();
  let totalExpectedQuantity = 0;

  for (const carton of revision.cartons) {
      const cartonNumber = normalizePackingIdentifier(carton.sourceCartonNumber);
      if (!cartonNumber) return { ok: false, message: "Every carton needs a source carton number." };
      if (cartonNumbers.has(cartonNumber)) {
        return { ok: false, message: `Duplicate carton number: ${carton.sourceCartonNumber}.` };
      }
      if (revision.schemaVersion === 3 && memberCartonNumbers.has(cartonNumber)) {
        return { ok: false, message: "A carton member cannot also be a source carton scope." };
      }
      cartonNumbers.add(cartonNumber);

      if (revision.schemaVersion === 3) {
        const cartonScope = carton as PackingListCartonScopeInput;
        const isSingleCarton = cartonScope.kind === "carton";
        if (!Number.isSafeInteger(cartonScope.physicalCartonCount) || cartonScope.physicalCartonCount <= 0) {
          return { ok: false, message: "Physical carton count must be a positive whole number." };
        }
        if (isSingleCarton && cartonScope.physicalCartonCount !== 1) {
          return { ok: false, message: "A single carton must have a physical carton count of 1." };
        }
        if (!isSingleCarton && cartonScope.physicalCartonCount < 2) {
          return { ok: false, message: "A carton group needs at least two physical cartons." };
        }
        if (cartonScope.memberCartonNumbers.length !== cartonScope.physicalCartonCount) {
          return { ok: false, message: "Member carton count must match the physical carton count." };
        }

        const scopeMembers = new Set<string>();
        for (const memberCartonNumber of cartonScope.memberCartonNumbers) {
          const member = normalizePackingIdentifier(memberCartonNumber);
          if (!member) return { ok: false, message: "Every carton member needs a carton number." };
          if (scopeMembers.has(member) || memberCartonNumbers.has(member)) {
            return { ok: false, message: `Duplicate carton member: ${memberCartonNumber}.` };
          }
          if (!isSingleCarton && cartonNumbers.has(member)) {
            return { ok: false, message: "A source carton scope cannot also be a carton member." };
          }
          scopeMembers.add(member);
          memberCartonNumbers.add(member);
        }
        if (isSingleCarton && !scopeMembers.has(cartonNumber)) {
          return { ok: false, message: "A single carton must list its own source carton number as its member." };
        }
      }

      if (!carton.lines.length) {
        return { ok: false, message: `Carton ${carton.sourceCartonNumber} needs at least one SKU line.` };
      }

      const cartonSkus = new Set<string>();
      for (const line of carton.lines) {
        const sku = normalizeSkuIdentifier(line.sku);
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

  for (const carton of revision.cartons) {
    carton.sourceCartonNumber = normalizePackingIdentifier(carton.sourceCartonNumber);
    carton.sourcePalletNumber = normalizePackingIdentifier(carton.sourcePalletNumber ?? "") || null;
    if (revision.schemaVersion === 3) {
      const cartonScope = carton as PackingListCartonScopeInput;
      cartonScope.memberCartonNumbers = cartonScope.memberCartonNumbers.map(normalizePackingIdentifier);
    }
    for (const line of carton.lines) line.sku = normalizeSkuIdentifier(line.sku);
  }

  const palletMapping = derivePalletMappingSummary(revision);
  if (
    palletMapping.physicalPalletCount !== null
    && palletMapping.mappedPalletCount > palletMapping.physicalPalletCount
  ) return { ok: false, message: "Mapped pallet count cannot exceed the physical pallet count." };
  if (
    palletMapping.status === "complete"
    && palletMapping.physicalPalletCount !== null
    && palletMapping.mappedPalletCount !== palletMapping.physicalPalletCount
  ) return { ok: false, message: "Complete pallet mapping must match the physical pallet count." };

  return {
    ok: true,
    revision,
    totalExpectedQuantity,
    palletMapping,
  };
}
