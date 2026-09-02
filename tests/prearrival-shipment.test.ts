import { describe, expect, it } from "vitest";
import { MemoryRepository } from "../lib/memoryRepository";
import {
  assertCompleteShipmentProductRecords,
  buildShipmentProductScope,
  chunkShipmentProductIds,
  derivePalletMappingSummary,
  loadCompleteShipmentProductPages,
  mapReceiptProductBarcodes,
  receiptFromPackingListRevision,
  validatePackingListRevision,
  type PackingListRevisionInput,
  type PackingListRevisionInputV2,
  type ValidatedPackingListRevision,
} from "../lib/prearrivalShipment";

const validInput: PackingListRevisionInput = {
  shipmentId: "shipment-test-1",
  pallets: [
    {
      sourcePalletNumber: "P001",
      cartons: [
        {
          sourceCartonNumber: "C001",
          lines: [
            { sku: "DM-GWM-OF-001", expectedQuantity: 12, batchLot: "LOT-202608" },
          ],
        },
      ],
    },
  ],
};

function validated(input: PackingListRevisionInput): ValidatedPackingListRevision {
  const result = validatePackingListRevision(input);
  if (!result.ok) throw new Error(result.message);
  return result.revision;
}

describe("pre-arrival packing-list revisions", () => {
  it("accepts a carton-first revision without pallet mapping", () => {
    const input: PackingListRevisionInputV2 = {
      schemaVersion: 2,
      shipmentId: "shipment-test-1",
      physicalPalletCount: 4,
      cartons: [{
        sourceCartonNumber: "CTN-001",
        sourcePalletNumber: null,
        lines: [{ sku: "dm-gwm-of-001", expectedQuantity: 12 }],
      }],
    };

    const result = validatePackingListRevision(input, {
      knownSkus: ["DM-GWM-OF-001"],
    });

    expect(result).toEqual({
      ok: true,
      revision: {
        ...input,
        cartons: [{
          ...input.cartons[0],
          sourcePalletNumber: null,
          lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 12 }],
        }],
      },
      totalExpectedQuantity: 12,
      palletMapping: {
        status: "not_recorded",
        physicalPalletCount: 4,
        mappedPalletCount: 0,
        mappedCartonCount: 0,
        totalCartonCount: 1,
      },
    });
  });

  it("derives partial and complete pallet mapping without synthetic pallets", () => {
    expect(derivePalletMappingSummary({
      physicalPalletCount: 4,
      cartons: [
        { sourcePalletNumber: "P-01" },
        { sourcePalletNumber: null },
      ],
    })).toEqual({
      status: "partial",
      physicalPalletCount: 4,
      mappedPalletCount: 1,
      mappedCartonCount: 1,
      totalCartonCount: 2,
    });

    expect(derivePalletMappingSummary({
      physicalPalletCount: 2,
      cartons: [
        { sourcePalletNumber: "P-01" },
        { sourcePalletNumber: "p-02" },
      ],
    }).status).toBe("complete");
  });

  it("rejects mappings that exceed or contradict the known physical pallet count", () => {
    const tooMany: PackingListRevisionInputV2 = {
      schemaVersion: 2,
      shipmentId: "shipment-test-1",
      physicalPalletCount: 1,
      cartons: [
        { sourceCartonNumber: "C001", sourcePalletNumber: "P001", lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 1 }] },
        { sourceCartonNumber: "C002", sourcePalletNumber: "P002", lines: [{ sku: "DM-GWM-AF-002", expectedQuantity: 1 }] },
      ],
    };
    expect(validatePackingListRevision(tooMany)).toEqual({
      ok: false,
      message: "Mapped pallet count cannot exceed the physical pallet count.",
    });

    const incompleteCount: PackingListRevisionInputV2 = {
      ...tooMany,
      physicalPalletCount: 3,
    };
    expect(validatePackingListRevision(incompleteCount)).toEqual({
      ok: false,
      message: "Complete pallet mapping must match the physical pallet count.",
    });
  });

  it("normalizes a legacy pallet-first revision into the carton-first model", () => {
    const result = validatePackingListRevision(validInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.revision).toMatchObject({
      schemaVersion: 2,
      shipmentId: "shipment-test-1",
      physicalPalletCount: 1,
      cartons: [{
        sourceCartonNumber: "C001",
        sourcePalletNumber: "P001",
      }],
    });
    expect(result.palletMapping.status).toBe("complete");
  });
  it("loads every purchase-order line page before building the shipment scope", async () => {
    const rows = Array.from({ length: 1_200 }, (_, index) => ({
      productId: index === 1_199 ? "product-0" : `product-${index}`,
    }));
    const ranges: Array<[number, number]> = [];

    const loaded = await loadCompleteShipmentProductPages(async (from, to) => {
      ranges.push([from, to]);
      return { rows: rows.slice(from, to + 1), count: rows.length };
    });

    expect(ranges).toEqual([[0, 499], [500, 999], [1_000, 1_499]]);
    expect(loaded).toHaveLength(1_200);
    expect(buildShipmentProductScope(loaded, [
      { id: "product-0", sku: "DM-GWM-OF-001" },
    ])).toEqual({ allowedSkus: [], productRecords: [] });
  });

  it("fails closed when an exact page count cannot be fully loaded", async () => {
    await expect(loadCompleteShipmentProductPages(async (from) => ({
      rows: from === 0 ? [{ productId: "product-1" }] : [],
      count: 2,
    }))).rejects.toThrow("Purchase-order line scope was incomplete.");
  });

  it("chunks product ids and rejects an incomplete product response", () => {
    const ids = Array.from({ length: 205 }, (_, index) => `product-${index}`);
    expect(chunkShipmentProductIds(ids).map((chunk) => chunk.length)).toEqual([100, 100, 5]);
    expect(() => assertCompleteShipmentProductRecords(
      ["product-1", "product-2"],
      [{ id: "product-1", sku: "DM-GWM-OF-001" }],
    )).toThrow("Shipment product scope was incomplete.");
  });

  it("allows a product whose normalized SKU appears once on the purchase order", () => {
    expect(
      buildShipmentProductScope(
        [{ productId: "product-of" }],
        [{ id: "product-of", sku: "dm-gwm-of-001", barcode: "DMPGWMOF001" }],
      ),
    ).toEqual({
      allowedSkus: ["DM-GWM-OF-001"],
      productRecords: [
        { id: "product-of", sku: "dm-gwm-of-001", barcode: "DMPGWMOF001" },
      ],
    });
  });

  it("excludes a product master SKU with leading or trailing whitespace", () => {
    expect(buildShipmentProductScope(
      [{ productId: "product-of" }],
      [{ id: "product-of", sku: " DM-GWM-OF-001 ", barcode: "DMPGWMOF001" }],
    )).toEqual({ allowedSkus: [], productRecords: [] });
  });

  it("excludes an SKU when its product appears more than once on the purchase order", () => {
    expect(
      buildShipmentProductScope(
        [{ productId: "product-of" }, { productId: "product-of" }],
        [{ id: "product-of", sku: "DM-GWM-OF-001" }],
      ),
    ).toEqual({ allowedSkus: [], productRecords: [] });
  });

  it("excludes a purchase-order line whose product record is missing", () => {
    expect(
      buildShipmentProductScope(
        [{ productId: "missing-product" }],
        [{ id: "product-of", sku: "DM-GWM-OF-001" }],
      ),
    ).toEqual({ allowedSkus: [], productRecords: [] });
  });

  it("excludes a normalized SKU represented by multiple purchase-order lines", () => {
    expect(
      buildShipmentProductScope(
        [{ productId: "product-of-1" }, { productId: "product-of-2" }],
        [
          { id: "product-of-1", sku: "DM-GWM-OF-001" },
          { id: "product-of-2", sku: "dm-gwm-of-001" },
        ],
      ),
    ).toEqual({ allowedSkus: [], productRecords: [] });
  });

  it("maps product barcodes by normalized SKU while preserving the receipt SKU key", () => {
    expect(
      mapReceiptProductBarcodes(
        [
          { sku: "dm-gwm-of-001" },
          { sku: "DM-GWM-AF-002" },
          { sku: "DM-GWM-BLANK-003" },
          { sku: "DM-GWM-EMPTY-004" },
        ],
        [
          { sku: "DM-GWM-OF-001", barcode: " DMPGWMOF001 " },
          { sku: "DM-GWM-AF-002", barcode: null },
          { sku: "DM-GWM-BLANK-003", barcode: "   " },
          { sku: "DM-GWM-EMPTY-004", barcode: "" },
          { sku: "DM-GWM-BP-003", barcode: "DMPGWMBP003" },
        ],
      ),
    ).toEqual({ "dm-gwm-of-001": "DMPGWMOF001" });
  });

  it("rejects conflicting product barcodes for the same normalized SKU", () => {
    expect(() =>
      mapReceiptProductBarcodes(
        [{ sku: "dm-gwm-of-001" }],
        [
          { sku: "DM-GWM-OF-001", barcode: "DMPGWMOF001" },
          { sku: " dm-gwm-of-001 ", barcode: "DMPGWMOF999" },
        ],
      ),
    ).toThrowError("Conflicting product barcodes for normalized SKU DM-GWM-OF-001.");
  });

  it("allows duplicate normalized product SKUs when their normalized barcodes agree", () => {
    expect(
      mapReceiptProductBarcodes(
        [{ sku: "dm-gwm-of-001" }],
        [
          { sku: "DM-GWM-OF-001", barcode: "DMPGWMOF001" },
          { sku: " dm-gwm-of-001 ", barcode: " dmpgwmof001 " },
        ],
      ),
    ).toEqual({ "dm-gwm-of-001": "DMPGWMOF001" });
  });

  it("keeps an existing shipment actionable before its first packing-list revision", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests({ packingList: "empty" });

    await expect(repository.listPrearrivalShipments()).resolves.toEqual({
      ok: true,
      shipments: [
        {
          shipmentId: "shipment-test-1",
          shipmentReference: "BNE-TEST-001",
          status: "planned",
          packingListStatus: "not_started",
          latestPackingListVersion: undefined,
          confirmedPackingListVersion: undefined,
        },
      ],
    });

    await expect(
      repository.getPrearrivalShipment("shipment-test-1"),
    ).resolves.toEqual({
      ok: true,
      shipment: {
        shipmentId: "shipment-test-1",
        packingListStatus: "not_started",
        latestPackingListVersion: undefined,
        confirmedPackingListVersion: undefined,
        pallets: [],
        cartons: [],
        lines: [],
        productBarcodes: {},
        productMasterSkus: expect.arrayContaining([
          "DM-GWM-OF-001",
          "DM-GWM-AF-002",
        ]),
        revisions: [],
      },
    });
  });

  it("does not add runtime-created products to a shipment purchase-order SKU scope", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests({ packingList: "empty" });
    await repository.createProductMaster({
      sku: "DM-GWM-NEW-099",
      brand: "GWM",
      name: "Genuine Test Service Part",
      category: "Service Filter",
      barcode: "DMPGWMNEW099",
      status: "active",
    });

    const result = await repository.getPrearrivalShipment("shipment-test-1");

    expect(result).toMatchObject({
      ok: true,
      shipment: {
        productBarcodes: {},
        productMasterSkus: ["DM-GWM-OF-001", "DM-GWM-AF-002"],
      },
    });
  });

  it("projects the confirmed packing-list snapshot into the receipt scope without reading mutable shipment rows", () => {
    expect(receiptFromPackingListRevision(validInput)).toEqual({
      shipmentId: "shipment-test-1",
      physicalPalletCount: 1,
      palletMappingStatus: "complete",
      pallets: [{ sourcePalletNumber: "P001" }],
      cartons: [{ sourceCartonNumber: "C001", sourcePalletNumber: "P001" }],
      lines: [
        {
          sourcePalletNumber: "P001",
          sourceCartonNumber: "C001",
          sku: "DM-GWM-OF-001",
          expectedQuantity: 12,
        },
      ],
    });
  });

  it("accepts a canonical pallet, carton and SKU snapshot", () => {
    const result = validatePackingListRevision(validInput, {
      knownSkus: ["DM-GWM-OF-001"],
    });

    expect(result).toMatchObject({ ok: true, totalExpectedQuantity: 12 });
    if (result.ok) {
      expect(result.revision.cartons[0].sourcePalletNumber).toBe("P001");
      expect(result.revision.cartons[0].sourceCartonNumber).toBe("C001");
    }
  });

  it("canonicalizes revision SKUs without mutating the input snapshot", () => {
    const rawInput = structuredClone(validInput);
    rawInput.pallets[0].cartons[0].lines[0].sku = " dm-gwm-of-001 ";
    const originalInput = structuredClone(rawInput);

    const result = validatePackingListRevision(rawInput, {
      knownSkus: ["DM-GWM-OF-001"],
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.revision.cartons[0].lines[0].sku).toBe("DM-GWM-OF-001");
    expect(result.revision.shipmentId).toBe(rawInput.shipmentId);
    expect(result.revision.cartons[0].sourcePalletNumber).toBe(
      rawInput.pallets[0].sourcePalletNumber,
    );
    expect(result.revision.cartons[0].sourceCartonNumber).toBe(
      rawInput.pallets[0].cartons[0].sourceCartonNumber,
    );
    expect(rawInput).toEqual(originalInput);
  });

  it("preserves internal SKU spacing while trimming and uppercasing the revision", () => {
    const rawInput = structuredClone(validInput);
    rawInput.pallets[0].cartons[0].lines[0].sku = " dm  x ";
    const originalInput = structuredClone(rawInput);

    const result = validatePackingListRevision(rawInput, {
      knownSkus: ["DM  X"],
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.revision.cartons[0].lines[0].sku).toBe("DM  X");
    expect(result.revision.cartons[0].lines[0].sku).not.toBe("DM X");
    expect(rawInput).toEqual(originalInput);
  });

  it("rejects an empty packing list", () => {
    expect(
      validatePackingListRevision(
        { shipmentId: "shipment-test-1", pallets: [] },
        { knownSkus: ["DM-GWM-OF-001"] },
      ),
    ).toMatchObject({ ok: false });
  });

  it("rejects carton and SKU duplicates after identifier normalisation", () => {
    const duplicateCarton = structuredClone(validInput);
    duplicateCarton.pallets.push({
      sourcePalletNumber: "P002",
      cartons: [
        {
          sourceCartonNumber: " c001 ",
          lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 1 }],
        },
      ],
    });
    expect(
      validatePackingListRevision(duplicateCarton, {
        knownSkus: ["DM-GWM-OF-001"],
      }),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/carton/i) });

    const duplicateSku = structuredClone(validInput);
    duplicateSku.pallets[0].cartons[0].lines.push({
      sku: " dm-gwm-of-001 ",
      expectedQuantity: 1,
    });
    expect(
      validatePackingListRevision(duplicateSku, {
        knownSkus: ["DM-GWM-OF-001"],
      }),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/SKU/i) });
  });

  it("rejects unknown SKUs", () => {
    expect(
      validatePackingListRevision(
        {
          ...validInput,
          pallets: [
            {
              ...validInput.pallets[0],
              cartons: [
                {
                  ...validInput.pallets[0].cartons[0],
                  lines: [{ sku: "DM-UNKNOWN-001", expectedQuantity: 1 }],
                },
              ],
            },
          ],
        },
        { knownSkus: ["DM-GWM-OF-001"] },
      ),
    ).toMatchObject({ ok: false });
  });

  it("rejects non-positive expected quantities", () => {
    expect(
      validatePackingListRevision(
        {
          ...validInput,
          pallets: [
            {
              ...validInput.pallets[0],
              cartons: [
                {
                  ...validInput.pallets[0].cartons[0],
                  lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 0 }],
                },
              ],
            },
          ],
        },
        { knownSkus: ["DM-GWM-OF-001"] },
      ),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/quantity/i) });
  });

  it("confirms a new immutable revision and replaces the live packing hierarchy", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const before = await repository.getPrearrivalShipment("shipment-test-1");
    expect(before).toMatchObject({ ok: true });
    if (!before.ok) return;
    expect(before.shipment.revisions).toMatchObject([
      { version: 1, status: "confirmed" },
    ]);

    const draftInput = structuredClone(validInput);
    draftInput.pallets[0].cartons[0].lines[0].expectedQuantity = 13;
    const draft = await repository.createPackingListRevision(validated(draftInput), {
      actorId: "demo-partner-user",
    });
    expect(draft).toMatchObject({ ok: true, revision: { version: 2, status: "draft" } });
    if (!draft.ok) return;

    draftInput.pallets[0].cartons[0].lines[0].expectedQuantity = 99;
    const confirmed = await repository.confirmPackingListRevision(draft.revision.id, {
      actorId: "demo-partner-user",
    });
    expect(confirmed).toMatchObject({ ok: true, revision: { version: 2, status: "confirmed" } });

    const after = await repository.getPrearrivalShipment("shipment-test-1");
    expect(after).toMatchObject({
      ok: true,
      shipment: {
        revisions: [
          { version: 1, status: "superseded" },
          { version: 2, status: "confirmed" },
        ],
      },
    });
    const receipt = await repository.getWarehouseExpectedReceipt({
      shipmentId: "shipment-test-1",
    });
    expect(receipt).toMatchObject({
      ok: true,
      receipt: {
        lines: expect.arrayContaining([
          expect.objectContaining({ sku: "DM-GWM-OF-001", expectedQuantity: 13 }),
        ]),
      },
    });
  });

  it("persists a canonical SKU from lowercase padded input and maps its product barcode", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests({ packingList: "empty" });
    const lowercaseInput = structuredClone(validInput);
    lowercaseInput.pallets[0].cartons[0].lines[0].sku = " dm-gwm-of-001 ";

    const draft = await repository.createPackingListRevision(validated(lowercaseInput), {
      actorId: "demo-partner-user",
    });
    expect(draft).toMatchObject({ ok: true });
    if (!draft.ok) return;

    const confirmed = await repository.confirmPackingListRevision(draft.revision.id, {
      actorId: "demo-partner-user",
    });
    expect(confirmed).toMatchObject({ ok: true });

    await expect(repository.getPrearrivalShipment("shipment-test-1")).resolves.toMatchObject({
      ok: true,
      shipment: {
        lines: [expect.objectContaining({ sku: "DM-GWM-OF-001" })],
        productBarcodes: { "DM-GWM-OF-001": "DMPGWMOF001" },
      },
    });
    expect(lowercaseInput.pallets[0].cartons[0].lines[0].sku).toBe(" dm-gwm-of-001 ");
  });

  it("creates and confirms a revision containing the shipment purchase-order SKUs", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests({ packingList: "empty" });
    const purchaseOrderInput = structuredClone(validInput);
    purchaseOrderInput.pallets[0].cartons[0].lines.push({
      sku: "DM-GWM-AF-002",
      expectedQuantity: 6,
    });

    const draft = await repository.createPackingListRevision(validated(purchaseOrderInput), {
      actorId: "demo-partner-user",
    });
    expect(draft).toMatchObject({ ok: true, revision: { status: "draft" } });
    if (!draft.ok) return;

    await expect(repository.confirmPackingListRevision(draft.revision.id, {
      actorId: "demo-partner-user",
    })).resolves.toMatchObject({ ok: true, revision: { status: "confirmed" } });
  });

  it("rejects a product-master SKU outside the shipment purchase order without saving a draft", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests({ packingList: "empty" });
    const outsidePurchaseOrder = structuredClone(validInput);
    outsidePurchaseOrder.pallets[0].cartons[0].lines[0].sku = "DM-GWM-CF-003";

    await expect(repository.createPackingListRevision(validated(outsidePurchaseOrder), {
      actorId: "demo-partner-user",
    })).resolves.toMatchObject({
      ok: false,
      message: expect.stringMatching(/approved|allowed/i),
    });
    await expect(repository.getPrearrivalShipment("shipment-test-1")).resolves.toMatchObject({
      ok: true,
      shipment: { revisions: [] },
    });
  });

  it("does not confirm a revision twice or accept an unknown SKU", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const unknownSku = await repository.createPackingListRevision(
      validated({
        ...validInput,
        pallets: [
          {
            ...validInput.pallets[0],
            cartons: [
              {
                ...validInput.pallets[0].cartons[0],
                lines: [{ sku: "DM-UNKNOWN-001", expectedQuantity: 1 }],
              },
            ],
          },
        ],
      }),
      { actorId: "demo-partner-user" },
    );
    expect(unknownSku).toMatchObject({ ok: false, message: expect.stringMatching(/SKU/i) });

    const draft = await repository.createPackingListRevision(validated(validInput), {
      actorId: "demo-partner-user",
    });
    if (!draft.ok) return;
    await repository.confirmPackingListRevision(draft.revision.id, {
      actorId: "demo-partner-user",
    });
    await expect(
      repository.confirmPackingListRevision(draft.revision.id, {
        actorId: "demo-partner-user",
      }),
    ).resolves.toMatchObject({ ok: false });
  });
});
