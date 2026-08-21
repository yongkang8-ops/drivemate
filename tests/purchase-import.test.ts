import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  AUTHORITATIVE_PI,
  allocateDiscountLargestRemainder,
  classifyRisk,
  previewPurchaseImport,
} from "../lib/purchaseImport";

describe("purchase import controls", () => {
  it("allocates discount exactly and deterministically", () => {
    const allocated = allocateDiscountLargestRemainder([100, 100, 100], 10);
    expect(allocated).toEqual([4, 3, 3]);
    expect(allocated.reduce((sum, value) => sum + value, 0)).toBe(10);
  });

  it("classifies safety-critical parts conservatively", () => {
    expect(classifyRisk("Front Brake Disc", "Chassis System")).toBe("high");
    expect(classifyRisk("Wheel Hub Bearing Assembly", "Chassis System")).toBe("high");
    expect(classifyRisk("Engine Water Pump", "Engine System")).toBe("medium");
    expect(classifyRisk("Cabin Air Filter", "Maintenance")).toBe("low");
  });

  const piPath = process.env.DRIVEMATE_AUTHORITATIVE_PI_PATH;
  const supplementalPath = process.env.DRIVEMATE_SUPPLEMENTAL_PACKING_PATH;
  it.skipIf(!piPath)("verifies the authoritative PI end to end", async () => {
    const preview = await previewPurchaseImport(
      await readFile(piPath!),
      supplementalPath ? await readFile(supplementalPath) : undefined,
    );
    expect(preview.sourceSha256).toBe(AUTHORITATIVE_PI.sha256);
    expect(preview.lines).toHaveLength(119);
    expect(new Set(preview.lines.map((line) => line.partNumber)).size).toBe(119);
    expect(preview.summary.quantity).toBe(706);
    expect(preview.summary.subtotalMinor - preview.summary.discountMinor).toBe(preview.summary.finalTotalMinor);
    expect(preview.lines.reduce((sum, line) => sum + line.allocatedDiscountMinor, 0)).toBe(preview.summary.discountMinor);
    expect(preview.lines[0].sku).toBe("DM-GWM-0001");
    expect(preview.lines.at(-1)?.sku).toBe("DM-GWM-0119");
  });
});
