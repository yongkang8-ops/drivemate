import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Draft = {
  importReady: boolean;
  shipment: {
    physicalPalletCount: number;
    mappedPalletCount: number;
    palletMappingStatus: string;
    cartonGroupCount: number;
    physicalCartonCount: number;
    skuLineCount: number;
    expectedQuantity: number;
  };
  controls: {
    readdedShockAbsorberQuantity: number;
    nonSaleableWarehouseEquipmentIncluded: boolean;
  };
  cartonGroups: Array<{
    sourceCartonNumber: string;
    sourceCartonCount: number;
    sourcePalletNumber: string | null;
    expectedQuantity: number;
    lines: Array<{ sku: string; partNumber: string; expectedQuantity: number }>;
  }>;
  masterDataLines: Array<{
    sourceCartonNumber: string;
    sourcePalletNumber: string | null;
    sku: string;
    partNumber: string;
    expectedQuantity: number;
  }>;
};

const draft = JSON.parse(readFileSync(resolve(
  process.cwd(),
  "docs/operations/inbound/2026-09-03-gwm-706-unit-inbound-master-data-draft.json",
), "utf8")) as Draft;

describe("706-unit inbound master-data draft", () => {
  it("reconciles the saleable inventory control totals", () => {
    expect(draft.shipment).toMatchObject({
      physicalPalletCount: 4,
      mappedPalletCount: 0,
      palletMappingStatus: "not_recorded",
      cartonGroupCount: 35,
      physicalCartonCount: 38,
      skuLineCount: 119,
      expectedQuantity: 706,
    });
    expect(draft.masterDataLines).toHaveLength(119);
    expect(draft.masterDataLines.reduce((sum, line) => sum + line.expectedQuantity, 0)).toBe(706);
    expect(new Set(draft.masterDataLines.map((line) => line.sku)).size).toBe(119);
    expect(new Set(draft.masterDataLines.map((line) => line.partNumber)).size).toBe(119);
  });

  it("keeps every pallet mapping empty and excludes warehouse equipment", () => {
    expect(draft.cartonGroups.every((carton) => carton.sourcePalletNumber === null)).toBe(true);
    expect(draft.masterDataLines.every((line) => line.sourcePalletNumber === null)).toBe(true);
    expect(draft.controls.nonSaleableWarehouseEquipmentIncluded).toBe(false);
    expect(draft.masterDataLines.some((line) => /printer|ribbon|label|shelving/i.test(line.partNumber))).toBe(false);
  });

  it("retains the 40 re-added shock absorbers and grouped-carton review gate", () => {
    expect(draft.controls.readdedShockAbsorberQuantity).toBe(40);
    expect(draft.masterDataLines
      .filter((line) => line.sourceCartonNumber === "29#")
      .reduce((sum, line) => sum + line.expectedQuantity, 0)).toBe(40);
    expect(draft.cartonGroups.filter((carton) => carton.sourceCartonCount > 1)
      .map((carton) => carton.sourceCartonNumber)).toEqual(["7#8#9#", "10#11#"]);
    expect(draft.importReady).toBe(false);
  });
});
