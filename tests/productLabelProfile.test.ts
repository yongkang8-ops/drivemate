import { beforeEach, describe, expect, it } from "vitest";
import { productMasterCreateSchema, productMasterUpdateSchema } from "../lib/validators";
import { createProductMasterData, findProductBySku, getCatalogueWithAvailability, resetProductMasterData, updateProductMasterData } from "../lib/catalogue";

const profile = () => ({ schemaVersion: 1 as const, displayName: "BRAKE DISC (ROTOR)", vehicleMakes: ["GWM", "HAVAL"], partReference: "3501302XGW04A", position: { status: "specified" as const, value: "Front" } });
const input = () => ({ sku: "DM-TEST-LABEL", barcode: "DMTESTLABEL", brand: "GWM" as const, name: "Front brake disc", category: "Brakes", labelProfile: profile() });

describe("product label profile persistence contract", () => {
  beforeEach(resetProductMasterData);
  it("retains structured metadata through existing create and update validation", () => {
    expect(productMasterCreateSchema.parse(input()).labelProfile).toEqual(profile());
    expect(productMasterUpdateSchema.parse({ labelProfile: profile() }).labelProfile).toEqual(profile());
  });
  it("accepts additional vehicle makes independently of the product brand enum", () => {
    expect(productMasterUpdateSchema.parse({ labelProfile: { ...profile(), vehicleMakes: ["Toyota", "Lexus"] } }).labelProfile?.vehicleMakes).toEqual(["Toyota", "Lexus"]);
  });
  it.each([
    { ...profile(), schemaVersion: 2 },
    { ...profile(), vehicleMakes: ["GWM", " gwm "] },
    { ...profile(), vehicleMakes: ["GWM\nMG"] },
    { ...profile(), displayName: "刹车盘" },
    { ...profile(), position: { status: "not_applicable", value: "Front" } },
    { ...profile(), position: { status: "specified", value: "" } },
    { ...profile(), position: { status: "universal" } },
    { ...profile(), manufacturer: "Invented brand" },
  ])("rejects invalid or conflicting metadata instead of silently dropping it %#", (labelProfile) => {
    expect(productMasterUpdateSchema.safeParse({ labelProfile }).success).toBe(false);
  });
  it("keeps draft unknown position distinct from not applicable", () => {
    const labelProfile = { ...profile(), position: { status: "unknown" as const } };
    expect(productMasterUpdateSchema.parse({ labelProfile }).labelProfile?.position).toEqual({ status: "unknown" });
  });
  it("deep clones metadata on input and returned catalogue reads", () => {
    const original = input();
    const created = createProductMasterData(original);
    expect(created.ok).toBe(true);
    original.labelProfile.vehicleMakes[0] = "MUTATED";
    const read = getCatalogueWithAvailability([], { includeInactive: true }).find(p => p.sku === original.sku)!;
    expect(read.labelProfile?.vehicleMakes).toEqual(["GWM", "HAVAL"]);
    read.labelProfile!.vehicleMakes[0] = "READ MUTATION";
    expect(findProductBySku(original.sku)?.labelProfile?.vehicleMakes).toEqual(["GWM", "HAVAL"]);
  });
  it("preserves omitted metadata and clears only explicit null", () => {
    createProductMasterData(input());
    updateProductMasterData({ sku: input().sku, name: "Updated catalogue name" });
    expect(findProductBySku(input().sku)?.labelProfile).toEqual(profile());
    updateProductMasterData({ sku: input().sku, labelProfile: null });
    expect(findProductBySku(input().sku)?.labelProfile).toBeNull();
  });
  it("rejects invalid profile before changing other product fields", () => {
    createProductMasterData(input());
    const invalid = { ...profile(), vehicleMakes: ["GWM", "GWM"] };
    const result = updateProductMasterData({ sku: input().sku, name: "Should not save", labelProfile: invalid });
    expect(result.ok).toBe(false);
    expect(findProductBySku(input().sku)?.name).toBe("Front brake disc");
  });
});
