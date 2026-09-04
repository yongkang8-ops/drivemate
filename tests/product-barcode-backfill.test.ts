import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBackfillSql,
  buildProductBarcodeManifest,
  buildRollbackSql,
  deriveInternalProductBarcode,
  generateProductBarcodeArtifacts,
} from "../scripts/product-barcode-backfill";

const inboundDraft = JSON.parse(readFileSync(resolve(
  process.cwd(),
  "docs/operations/inbound/2026-09-03-gwm-706-unit-inbound-master-data-v3.json",
), "utf8")) as {
  masterDataLines: Array<{
    lineNumber: number;
    sku: string;
    partNumber: string;
  }>;
};

describe("product barcode master backfill", () => {
  it("derives the stable DriveMate Code 128 value from a canonical GWM SKU", () => {
    expect(deriveInternalProductBarcode("DM-GWM-0001")).toBe("DMPGWM0001");
    expect(deriveInternalProductBarcode("DM-GWM-0119")).toBe("DMPGWM0119");
  });

  it("builds one deterministic unique mapping for every authoritative SKU", () => {
    const manifest = buildProductBarcodeManifest(inboundDraft.masterDataLines);

    expect(manifest).toHaveLength(119);
    expect(manifest[0]).toEqual({
      sourceLineNumber: 46,
      sku: "DM-GWM-0001",
      partNumber: "1117100XKW09A",
      barcode: "DMPGWM0001",
    });
    expect(manifest.at(-1)).toEqual({
      sourceLineNumber: 103,
      sku: "DM-GWM-0119",
      partNumber: "1307100XEC71",
      barcode: "DMPGWM0119",
    });
    expect(new Set(manifest.map((row) => row.barcode)).size).toBe(119);
  });

  it("rejects incomplete, duplicate or non-canonical SKU input before emitting artifacts", () => {
    expect(() => buildProductBarcodeManifest(inboundDraft.masterDataLines.slice(0, 118)))
      .toThrow("Expected exactly 119 authoritative product rows");
    expect(() => buildProductBarcodeManifest([
      ...inboundDraft.masterDataLines.slice(0, 118),
      inboundDraft.masterDataLines[0],
    ])).toThrow("Duplicate authoritative SKU");
    expect(() => buildProductBarcodeManifest([
      ...inboundDraft.masterDataLines.slice(0, 118),
      { lineNumber: 999, sku: "GWM-INVALID", partNumber: "INVALID" },
    ])).toThrow("Unsupported product SKU");
  });

  it("emits an atomic backfill that refuses missing products, overwrites and normalized collisions", () => {
    const manifest = buildProductBarcodeManifest(inboundDraft.masterDataLines);
    const sql = buildBackfillSql(manifest, {
      actorEmail: "lee@drivemateparts.com.au",
      sourceFile: "2026-09-03-gwm-706-unit-inbound-master-data-v3.json",
      sourceHash: "A".repeat(64),
    }).replace(/\s+/g, " ");

    expect(sql).toContain("begin;");
    expect(sql).toContain("create temporary table dm_product_barcode_backfill");
    expect(sql).toContain("Expected exactly 119 staged product barcodes");
    expect(sql).toContain("lock table public.products in share row exclusive mode");
    expect(sql).toContain("Production SKU matching is incomplete or ambiguous");
    expect(sql).toContain("Existing product barcode would be overwritten");
    expect(sql).toContain("Generated barcode collides with another product");
    expect(sql).toContain("update public.products as product set barcode = target.barcode, updated_at = now()");
    expect(sql).toContain("'product_barcode_backfilled'");
    expect(sql).toContain("commit;");
  });

  it("emits a rollback reference that only clears unchanged generated values before warehouse use", () => {
    const manifest = buildProductBarcodeManifest(inboundDraft.masterDataLines);
    const sql = buildRollbackSql(manifest, {
      actorEmail: "lee@drivemateparts.com.au",
      sourceFile: "2026-09-03-gwm-706-unit-inbound-master-data-v3.json",
      sourceHash: "A".repeat(64),
    }).replace(/\s+/g, " ");

    expect(sql).toContain("ROLLBACK REFERENCE ONLY");
    expect(sql).toContain("lock table public.products in share row exclusive mode");
    expect(sql).toContain("Warehouse receipt history already references a generated barcode");
    expect(sql).toContain("Product barcode changed after this backfill");
    expect(sql).toContain("set barcode = null, updated_at = now()");
    expect(sql).toContain("'product_barcode_backfill_rolled_back'");
  });

  it("writes reproducible manifest and SQL artifacts without contacting Production", async () => {
    const outputRoot = await mkdtemp(resolve(tmpdir(), "drivemate-barcode-backfill-"));
    try {
      const result = await generateProductBarcodeArtifacts({
        inputPath: resolve(
          process.cwd(),
          "docs/operations/inbound/2026-09-03-gwm-706-unit-inbound-master-data-v3.json",
        ),
        outputRoot,
      });

      expect(result.rowCount).toBe(119);
      expect(result.sourceHash).toMatch(/^[A-F0-9]{64}$/);
      expect(existsSync(result.csvPath)).toBe(true);
      expect(existsSync(result.backfillSqlPath)).toBe(true);
      expect(existsSync(result.rollbackSqlPath)).toBe(true);
      const csv = await readFile(result.csvPath, "utf8");
      expect(csv.trim().split(/\r?\n/)).toHaveLength(120);
      expect(csv).toContain("46,DM-GWM-0001,1117100XKW09A,DMPGWM0001");
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});
