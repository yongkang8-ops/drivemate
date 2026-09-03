import { describe, expect, it } from "vitest";
import {
  mapPackingListServerErrors,
  packingListFieldKey,
  validatePackingListDraft,
} from "../lib/prearrivalDraftValidation";

const blankDraft = {
  shipmentId: "shipment-test-1",
  pallets: [
    {
      sourcePalletNumber: "",
      cartons: [
        {
          sourceCartonNumber: "",
          lines: [
            {
              sku: "",
              expectedQuantity: 0,
            },
          ],
        },
      ],
    },
  ],
};

describe("pre-arrival Packing List draft validation", () => {
  it("reports v3 carton-group member structure errors on their exact fields", () => {
    const result = validatePackingListDraft({
      schemaVersion: 3,
      shipmentId: "shipment-test-1",
      physicalPalletCount: 4,
      cartons: [
        {
          sourceCartonNumber: "7#8#9#",
          kind: "carton_group",
          physicalCartonCount: 3,
          memberCartonNumbers: ["7#", "7#"],
          sourcePalletNumber: null,
          lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 10 }],
        },
        {
          sourceCartonNumber: "7#",
          kind: "carton",
          physicalCartonCount: 1,
          memberCartonNumbers: ["7#"],
          sourcePalletNumber: null,
          lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 10 }],
        },
        {
          sourceCartonNumber: "10#11#",
          kind: "carton_group",
          physicalCartonCount: 3,
          memberCartonNumbers: ["10#", "11#"],
          sourcePalletNumber: null,
          lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 10 }],
        },
        {
          sourceCartonNumber: "12#",
          kind: "carton_group",
          physicalCartonCount: 1,
          memberCartonNumbers: [""],
          sourcePalletNumber: null,
          lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 10 }],
        },
      ],
    }, ["DM-GWM-OF-001"]);

    expect(result.fieldErrors).toMatchObject({
      "cartons.0.memberCartonNumbers.1": "Use each carton member once.",
      "cartons.1.sourceCartonNumber": "A carton member cannot also be a source carton scope.",
      "cartons.2.memberCartonNumbers": "List exactly one member carton for each physical carton.",
      "cartons.3.physicalCartonCount": "A carton group needs at least two physical cartons.",
      "cartons.3.memberCartonNumbers.0": "Enter a carton member number.",
    });
  });

  it("allows a v2 carton draft with no pallet mapping", () => {
    const result = validatePackingListDraft({
      schemaVersion: 2,
      shipmentId: "shipment-test-1",
      physicalPalletCount: 4,
      cartons: [{
        sourceCartonNumber: "CTN-001",
        sourcePalletNumber: null,
        lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 12 }],
      }],
    }, ["DM-GWM-OF-001"]);

    expect(result).toEqual({
      ok: true,
      fieldErrors: {},
      firstField: undefined,
      summary: undefined,
    });
  });

  it("validates v2 carton-first paths and physical pallet count", () => {
    const result = validatePackingListDraft({
      schemaVersion: 2,
      shipmentId: "shipment-test-1",
      physicalPalletCount: 0,
      cartons: [{
        sourceCartonNumber: "",
        sourcePalletNumber: null,
        lines: [{ sku: "", expectedQuantity: 0 }],
      }],
    }, ["DM-GWM-OF-001"]);

    expect(result.fieldErrors).toMatchObject({
      physicalPalletCount: "Enter a positive whole number of physical pallets, or leave it blank.",
      "cartons.0.sourceCartonNumber": "Enter the carton number.",
      "cartons.0.lines.0.sku": "Enter a recognised SKU.",
      "cartons.0.lines.0.expectedQuantity": "Enter a positive whole quantity.",
    });
    expect(result.fieldErrors).not.toHaveProperty("cartons.0.sourcePalletNumber");
  });

  it("keeps contradictory complete pallet mapping local", () => {
    const result = validatePackingListDraft({
      schemaVersion: 2,
      shipmentId: "shipment-test-1",
      physicalPalletCount: 4,
      cartons: [{
        sourceCartonNumber: "CTN-001",
        sourcePalletNumber: "P001",
        lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 12 }],
      }],
    }, ["DM-GWM-OF-001"]);

    expect(result.fieldErrors.physicalPalletCount).toBe(
      "Complete pallet mapping must match the physical pallet count.",
    );
  });
  it("returns every invalid field in traversal order and identifies the first field", () => {
    const result = validatePackingListDraft(blankDraft, ["DM-GWM-OF-001"]);

    expect(result.ok).toBe(false);
    expect(result.fieldErrors).toEqual({
      "pallets.0.sourcePalletNumber": "Enter the pallet number.",
      "pallets.0.cartons.0.sourceCartonNumber": "Enter the carton number.",
      "pallets.0.cartons.0.lines.0.sku": "Enter a recognised SKU.",
      "pallets.0.cartons.0.lines.0.expectedQuantity":
        "Enter a positive whole quantity.",
    });
    expect(result.firstField).toBe("pallets.0.sourcePalletNumber");
    expect(result.summary).toBe(
      "Complete the highlighted Packing List fields before confirming.",
    );
  });

  it("rejects an SKU that is absent from the product master", () => {
    const result = validatePackingListDraft(
      {
        shipmentId: "shipment-test-1",
        pallets: [
          {
            sourcePalletNumber: "P001",
            cartons: [
              {
                sourceCartonNumber: "C001",
                lines: [{ sku: "UNKNOWN-SKU", expectedQuantity: 1 }],
              },
            ],
          },
        ],
      },
      ["DM-GWM-OF-001"],
    );

    expect(result.fieldErrors["pallets.0.cartons.0.lines.0.sku"]).toBe(
      "Select an SKU from the product master.",
    );
  });

  it("rejects normalized duplicate pallet, carton and per-carton SKU values", () => {
    const draft = {
      shipmentId: "shipment-test-1",
      pallets: [
        {
          sourcePalletNumber: "P001",
          cartons: [
            {
              sourceCartonNumber: "C001",
              lines: [
                { sku: "DM-GWM-OF-001", expectedQuantity: 1 },
                { sku: " dm-gwm-of-001 ", expectedQuantity: 2 },
              ],
            },
          ],
        },
        {
          sourcePalletNumber: " p001 ",
          cartons: [
            {
              sourceCartonNumber: " c001 ",
              lines: [{ sku: "DM-GWM-AF-002", expectedQuantity: 3 }],
            },
          ],
        },
      ],
    };

    const result = validatePackingListDraft(draft, [
      "DM-GWM-OF-001",
      "DM-GWM-AF-002",
    ]);

    expect(result.fieldErrors).toMatchObject({
      "pallets.0.cartons.0.lines.1.sku": "Use each SKU once per carton.",
      "pallets.1.sourcePalletNumber": "Use a unique pallet number.",
      "pallets.1.cartons.0.sourceCartonNumber": "Use a unique carton number.",
    });
    expect(draft.pallets[1].sourcePalletNumber).toBe(" p001 ");
    expect(draft.pallets[0].cartons[0].lines[1].sku).toBe(" dm-gwm-of-001 ");
  });

  it("maps server paths and local paths to the same field key", () => {
    expect(
      mapPackingListServerErrors({
        fieldErrors: [
          {
            path: ["pallets", 0, "cartons", 0, "lines", 0, "sku"],
            message: "SKU is invalid.",
          },
        ],
      }),
    ).toEqual({
      "pallets.0.cartons.0.lines.0.sku": "SKU is invalid.",
    });
    expect(packingListFieldKey(["pallets", 0, "sourcePalletNumber"])).toBe(
      "pallets.0.sourcePalletNumber",
    );
  });

  it("returns no field errors when the server error payload or list is missing", () => {
    expect(mapPackingListServerErrors()).toEqual({});
    expect(mapPackingListServerErrors({ fieldErrors: [] })).toEqual({});
    expect(mapPackingListServerErrors({ fieldErrors: "invalid" })).toEqual({});
  });

  it("keeps the first duplicate server path and ignores unsafe numeric paths", () => {
    expect(
      mapPackingListServerErrors({
        fieldErrors: [
          { path: ["pallets", 0, "sourcePalletNumber"], message: "First." },
          { path: ["pallets", 0, "sourcePalletNumber"], message: "Second." },
          {
            path: ["pallets", Number.MAX_SAFE_INTEGER + 1, "sourcePalletNumber"],
            message: "Unsafe.",
          },
          {
            path: ["pallets", -1, "sourcePalletNumber"],
            message: "Negative.",
          },
        ],
      }),
    ).toEqual({
      "pallets.0.sourcePalletNumber": "First.",
    });
  });

  it("rejects a positive integer quantity outside the safe integer range", () => {
    const result = validatePackingListDraft(
      {
        shipmentId: "shipment-test-1",
        pallets: [
          {
            sourcePalletNumber: "P001",
            cartons: [
              {
                sourceCartonNumber: "C001",
                lines: [{
                  sku: "DM-GWM-OF-001",
                  expectedQuantity: Number.MAX_SAFE_INTEGER + 1,
                }],
              },
            ],
          },
        ],
      },
      ["DM-GWM-OF-001"],
    );

    expect(result.fieldErrors).toMatchObject({
      "pallets.0.cartons.0.lines.0.expectedQuantity":
        "Enter a positive whole quantity.",
    });
  });
});
