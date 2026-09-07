import { z } from "zod";
import { getProductLabelProfileIssues, productLabelProfileSchema, type ProductLabelProfile } from "./productLabelProfile";

export type WarehouseLabelProduct = { sku: string; barcode: string; labelProfile?: ProductLabelProfile | null };
export const productLabelSnapshotSchema = z.object({
  version: z.literal("unit-product-v4"), sku: z.string().min(1), productBarcode: z.string().min(1),
  profile: productLabelProfileSchema, companyName: z.literal("DRIVER MATE PTY LTD"), website: z.literal("drivemateparts.com.au"),
}).strict();
export type ProductLabelSnapshot = z.infer<typeof productLabelSnapshotSchema>;
export type ProductLabelReadiness = { sku: string; issues: string[]; content?: ProductLabelSnapshot };
export function describeProductLabelIssues(issues: string[]): string {
  const names: Record<string, string> = {
    labelProfile: "label details not entered", product: "product record needs review", displayName: "English product name",
    vehicleMakes: "compatible vehicle makes", partReference: "part reference", position: "Position applicability or value",
    barcode: "barcode needs review for this label size", "layout.sku": "SKU is too long for this label size",
    "layout.displayName": "shorten product name to fit two lines", "layout.vehicleMakes": "shorten vehicle makes for this label size",
    "layout.partReference": "part reference exceeds 26 characters", "layout.position": "Position exceeds 26 characters",
  };
  return issues.map(issue => names[issue] ?? "label data format needs review").join("; ");
}

/** Conservative physical-layout limits, separate from the editable draft schema. Never truncate print text. */
export function buildProductLabelContent(product: WarehouseLabelProduct): ProductLabelReadiness {
  const issues = getProductLabelProfileIssues(product.labelProfile);
  if (!/^[!-~]{1,24}$/.test(product.sku)) issues.push("layout.sku");
  if (!/^[!-~]{1,18}$/.test(product.barcode) || /^(DMLOC:|DMCARTON:)/i.test(product.barcode)) issues.push("barcode");
  const parsed = productLabelProfileSchema.safeParse(product.labelProfile);
  if (parsed.success) {
    const p = parsed.data;
    let nameLines = 1; let used = 0;
    for (const word of p.displayName.split(/\s+/)) {
      if (used && used + 1 + word.length > 26) { nameLines++; used = word.length; }
      else used += (used ? 1 : 0) + word.length;
    }
    if (p.displayName.length > 48 || nameLines > 2 || p.displayName.split(/\s+/).some(word => word.length > 24)) issues.push("layout.displayName");
    if (p.vehicleMakes.join(" / ").length > 32) issues.push("layout.vehicleMakes");
    if (p.partReference.length > 26) issues.push("layout.partReference");
    if (p.position.status === "specified" && p.position.value.length > 26) issues.push("layout.position");
  }
  if (issues.length || !parsed.success) return { sku: product.sku, issues };
  return { sku: product.sku, issues: [], content: {
    version: "unit-product-v4", sku: product.sku, productBarcode: product.barcode,
    profile: structuredClone(parsed.data), companyName: "DRIVER MATE PTY LTD", website: "drivemateparts.com.au",
  } };
}

export function readProductLabelSnapshot(value: unknown): ProductLabelSnapshot {
  const parsed = productLabelSnapshotSchema.parse(value);
  const result = buildProductLabelContent({ sku: parsed.sku, barcode: parsed.productBarcode, labelProfile: parsed.profile });
  if (result.issues.length) throw new Error("Saved label artwork is incomplete or exceeds the supported physical layout.");
  return parsed;
}
