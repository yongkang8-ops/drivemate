import type { WarehouseLabelPrintItem, WarehouseLabelPrintJob } from "./repository";
import { readProductLabelSnapshot, type ProductLabelSnapshot } from "./warehouseLabelContent";

export type ProductLabelPage = { itemId: string; sequence: number; sku: string; barcode: string; labelContent?: ProductLabelSnapshot };

/** Never rebuild a persisted job from the mutable screen selection or current product master. */
export function prepareProductLabelBatch(job: WarehouseLabelPrintJob, items: WarehouseLabelPrintItem[]): ProductLabelPage[] {
  const version = job.payloadSnapshot.labelVersion;
  if (version !== undefined && version !== "unit-product-v4") throw new Error("The saved label version is not supported.");
  if (job.templateId !== "unit_product" || job.status !== "pending"
    || !Number.isSafeInteger(job.requestedQuantity) || job.requestedQuantity <= 0
    || !Array.isArray(items) || items.length !== job.requestedQuantity) {
    throw new Error("The saved product label batch is incomplete or cannot be printed.");
  }
  const ids = new Set<string>();
  return [...items].sort((a, b) => a.sequence - b.sequence).map((item, index) => {
    const { sku, productBarcode, shipmentId } = item.payloadSnapshot;
    if (!item.id || ids.has(item.id) || item.jobId !== job.id || item.sequence !== index + 1
      || typeof sku !== "string" || !sku.trim()
      || typeof productBarcode !== "string" || !/^[!-~]+$/.test(productBarcode)
      || /^(DMLOC:|DMCARTON:)/i.test(productBarcode)
      || !shipmentId || shipmentId !== job.payloadSnapshot.shipmentId) {
      throw new Error("The saved product label items are inconsistent. Cancel this job and review its audit record.");
    }
    ids.add(item.id);
    if (version === undefined && item.payloadSnapshot.labelContent !== undefined) throw new Error("An unversioned job cannot contain v4 artwork.");
    if (version === "unit-product-v4" && !item.payloadSnapshot.labelContent) throw new Error("A saved v4 label is missing its artwork.");
    const labelContent = item.payloadSnapshot.labelContent === undefined ? undefined : readProductLabelSnapshot(item.payloadSnapshot.labelContent);
    if (labelContent && (labelContent.sku !== sku || labelContent.productBarcode !== productBarcode)) throw new Error("Saved label content does not match its item.");
    return { itemId: item.id, sequence: item.sequence, sku, barcode: productBarcode, ...(labelContent ? { labelContent } : {}) };
  });
}
