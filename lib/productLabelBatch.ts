import type { WarehouseLabelPrintItem, WarehouseLabelPrintJob } from "./repository";

export type ProductLabelPage = { itemId: string; sequence: number; sku: string; barcode: string };

/** Never rebuild a persisted job from the mutable screen selection or current product master. */
export function prepareProductLabelBatch(job: WarehouseLabelPrintJob, items: WarehouseLabelPrintItem[]): ProductLabelPage[] {
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
    return { itemId: item.id, sequence: item.sequence, sku, barcode: productBarcode };
  });
}
