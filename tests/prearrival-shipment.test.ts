import { describe, expect, it } from "vitest";
import { MemoryRepository } from "../lib/memoryRepository";
import {
  mapReceiptProductBarcodes,
  receiptFromPackingListRevision,
  validatePackingListRevision,
  type PackingListRevisionInput,
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

describe("pre-arrival packing-list revisions", () => {
  it("maps product barcodes by normalized SKU while preserving the receipt SKU key", () => {
    expect(
      mapReceiptProductBarcodes(
        [{ sku: "dm-gwm-of-001" }, { sku: "DM-GWM-AF-002" }],
        [
          { sku: "DM-GWM-OF-001", barcode: "DMPGWMOF001" },
          { sku: "DM-GWM-AF-002", barcode: null },
          { sku: "DM-GWM-BP-003", barcode: "DMPGWMBP003" },
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

  it("includes runtime-created products in the product-master SKU contract", async () => {
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
        productMasterSkus: expect.arrayContaining(["DM-GWM-NEW-099"]),
      },
    });
  });

  it("projects the confirmed packing-list snapshot into the receipt scope without reading mutable shipment rows", () => {
    expect(receiptFromPackingListRevision(validInput)).toEqual({
      shipmentId: "shipment-test-1",
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
      expect(result.revision.pallets[0].sourcePalletNumber).toBe("P001");
      expect(result.revision.pallets[0].cartons[0].sourceCartonNumber).toBe("C001");
    }
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
    const draft = await repository.createPackingListRevision(draftInput, {
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

  it("returns a product barcode keyed by the original lowercase and padded receipt SKU", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests({ packingList: "empty" });
    const lowercaseInput = structuredClone(validInput);
    lowercaseInput.pallets[0].cartons[0].lines[0].sku = " dm-gwm-of-001 ";

    const draft = await repository.createPackingListRevision(lowercaseInput, {
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
        productBarcodes: { " dm-gwm-of-001 ": "DMPGWMOF001" },
      },
    });
  });

  it("does not confirm a revision twice or accept an SKU outside the product master", async () => {
    const repository = new MemoryRepository();
    await repository.resetForTests();

    const unknownSku = await repository.createPackingListRevision(
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
      { actorId: "demo-partner-user" },
    );
    expect(unknownSku).toMatchObject({ ok: false, message: expect.stringMatching(/SKU/i) });

    const draft = await repository.createPackingListRevision(validInput, {
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
