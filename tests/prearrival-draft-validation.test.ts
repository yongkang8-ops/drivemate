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
});
