import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveCartonStructureSummary,
  validatePackingListRevision,
  type PackingListRevisionInputV3,
} from "../lib/prearrivalShipment";

type V3Draft = {
  schemaVersion: 3;
  readiness: {
    packingListDataReady: boolean;
    productBarcodeReadiness: string;
    productionImportAuthorized: boolean;
  };
  shipment: {
    physicalPalletCount: number;
    mappedPalletCount: number;
    palletMappingStatus: string;
    sourceScopeCount: number;
    physicalCartonCount: number;
    cartonGroupCount: number;
    skuLineCount: number;
    expectedQuantity: number;
  };
  controls: {
    readdedShockAbsorberQuantity: number;
    nonSaleableWarehouseEquipmentIncluded: boolean;
  };
  sourceFiles: Array<{ fileName: string; sha256: string; role: string }>;
  cartonScopes: Array<{
    sourceCartonNumber: string;
    sourcePalletNumber: null;
    kind: "carton" | "carton_group";
    physicalCartonCount: number;
    memberCartonNumbers: string[];
    expectedQuantity: number;
    lines: Array<{ sku: string; partNumber: string; expectedQuantity: number }>;
  }>;
  masterDataLines: Array<{
    sourceCartonNumber: string;
    sourcePalletNumber: null;
    sku: string;
    partNumber: string;
    expectedQuantity: number;
  }>;
  apiPayloadCandidate: PackingListRevisionInputV3;
};

const jsonPath = resolve(
  process.cwd(),
  "docs/operations/inbound/2026-09-03-gwm-706-unit-inbound-master-data-v3.json",
);
const csvPath = resolve(
  process.cwd(),
  "docs/operations/inbound/2026-09-03-gwm-706-unit-inbound-master-data-v3-lines.csv",
);
const draft = existsSync(jsonPath)
  ? JSON.parse(readFileSync(jsonPath, "utf8")) as V3Draft
  : undefined;

describe("authoritative 706-unit schema-v3 inbound master-data draft", () => {
  it("creates the required v3 JSON and line CSV artifacts", () => {
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(csvPath)).toBe(true);
  });

  it("reconciles source scopes independently from physical cartons", () => {
    expect(draft?.schemaVersion).toBe(3);
    expect(draft?.shipment).toMatchObject({
      physicalPalletCount: 4,
      mappedPalletCount: 0,
      palletMappingStatus: "not_recorded",
      sourceScopeCount: 35,
      physicalCartonCount: 38,
      cartonGroupCount: 2,
      skuLineCount: 119,
      expectedQuantity: 706,
    });
    expect(draft?.cartonScopes).toHaveLength(35);
    expect(draft?.cartonScopes.reduce(
      (sum, scope) => sum + scope.physicalCartonCount,
      0,
    )).toBe(38);
  });

  it("retains 119 unique product lines and 706 saleable units", () => {
    expect(draft?.masterDataLines).toHaveLength(119);
    expect(draft?.masterDataLines.reduce(
      (sum, line) => sum + line.expectedQuantity,
      0,
    )).toBe(706);
    expect(new Set(draft?.masterDataLines.map((line) => line.sku)).size).toBe(119);
    expect(new Set(draft?.masterDataLines.map((line) => line.partNumber)).size).toBe(119);
  });

  it("models the two source groups without multiplying product quantity", () => {
    expect(draft?.cartonScopes.filter((scope) => scope.kind === "carton_group")).toEqual([
      expect.objectContaining({
        sourceCartonNumber: "7#8#9#",
        physicalCartonCount: 3,
        memberCartonNumbers: ["7#", "8#", "9#"],
        expectedQuantity: 10,
      }),
      expect.objectContaining({
        sourceCartonNumber: "10#11#",
        physicalCartonCount: 2,
        memberCartonNumbers: ["10#", "11#"],
        expectedQuantity: 10,
      }),
    ]);
    expect(draft?.cartonScopes
      .filter((scope) => scope.kind === "carton_group")
      .reduce((sum, scope) => sum + scope.expectedQuantity, 0)).toBe(20);
  });

  it("keeps optional pallet mapping empty and excludes warehouse equipment", () => {
    expect(draft?.cartonScopes.every((scope) => scope.sourcePalletNumber === null)).toBe(true);
    expect(draft?.masterDataLines.every((line) => line.sourcePalletNumber === null)).toBe(true);
    expect(draft?.controls.nonSaleableWarehouseEquipmentIncluded).toBe(false);
    expect(draft?.masterDataLines.some((line) => /printer|scanner|ribbon|label|shelving/i.test(line.partNumber))).toBe(false);
  });

  it("retains the re-added 40 shock absorbers in source scope 29#", () => {
    expect(draft?.controls.readdedShockAbsorberQuantity).toBe(40);
    expect(draft?.masterDataLines
      .filter((line) => line.sourceCartonNumber === "29#")
      .reduce((sum, line) => sum + line.expectedQuantity, 0)).toBe(40);
  });

  it("separates data readiness, barcode readiness and Production authorization", () => {
    expect(draft?.readiness).toEqual({
      packingListDataReady: true,
      productBarcodeReadiness: "unknown_until_production_check",
      productionImportAuthorized: false,
    });
  });

  it("uses the exact current PI and customer Packing List hashes", () => {
    expect(draft?.sourceFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fileName: "附件一_GWM首批汽配_Final_PI_20260820.xlsx",
        sha256: "F7C6F6BB4576CCCA62221E50D27E2FCCF3CAB3C46F9889404F87C0B59E9ABB4C",
      }),
      expect.objectContaining({
        fileName: "客户装箱清单PL&INV_GWM首批汽配_材质价格版_20260822.xls",
        sha256: "7ADBE3D31F5D318D9D3E59A480D919A2BF2A588CCD79C4CAD1F24AF9BD5DEE47",
      }),
    ]));
  });

  it("produces a valid API candidate with the same quantity and structure totals", () => {
    expect(draft).toBeDefined();
    const validation = validatePackingListRevision(
      draft!.apiPayloadCandidate,
      { knownSkus: draft!.masterDataLines.map((line) => line.sku) },
    );
    expect(validation).toMatchObject({ ok: true, totalExpectedQuantity: 706 });
    expect(deriveCartonStructureSummary(draft!.apiPayloadCandidate)).toEqual({
      sourceScopeCount: 35,
      physicalCartonCount: 38,
      cartonGroupCount: 2,
    });
  });

  it("keeps the CSV export in exact one-row-per-SKU agreement", () => {
    expect(existsSync(csvPath)).toBe(true);
    if (!existsSync(csvPath)) return;
    const rows = readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
    expect(rows).toHaveLength(120);
    expect(rows[0]).toBe("source_scope_number,scope_kind,physical_carton_count,member_carton_numbers,source_pallet_number,sku,part_number,expected_quantity,pi_row,packing_row");
    const data = rows.slice(1).map((row) => row.split(","));
    expect(data.reduce((sum, row) => sum + Number(row[7]), 0)).toBe(706);
    expect(new Set(data.map((row) => row[5])).size).toBe(119);
  });
});
