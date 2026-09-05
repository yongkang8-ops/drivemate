import { describe, expect, it } from "vitest";
import { prepareProductLabelBatch } from "../lib/productLabelBatch";
import type { WarehouseLabelPrintItem, WarehouseLabelPrintJob } from "../lib/repository";

const job: WarehouseLabelPrintJob = {
  id: "job-a", templateId: "unit_product", requestedQuantity: 3,
  status: "pending", createdAt: "2026-09-05T00:00:00Z", payloadSnapshot: { shipmentId: "shipment-a" },
};
const items: WarehouseLabelPrintItem[] = ["DMPGWM0001", "DMPGWM0001", "DMPGWM0002"].map((barcode, i) => ({
  id: `item-${i}`, jobId: job.id, sequence: i + 1, createdAt: job.createdAt,
  payloadSnapshot: { shipmentId: "shipment-a", sku: i < 2 ? "DM-GWM-0001" : "DM-GWM-0002", productBarcode: barcode, copy: i < 2 ? i + 1 : 1 },
}));

describe("immutable product print output", () => {
  it("orders every copy by its persisted sequence without changing the snapshots", () => {
    const reversed = [...items].reverse();
    expect(prepareProductLabelBatch(job, reversed).map(p => [p.itemId, p.sku, p.barcode])).toEqual([
      ["item-0", "DM-GWM-0001", "DMPGWM0001"],
      ["item-1", "DM-GWM-0001", "DMPGWM0001"],
      ["item-2", "DM-GWM-0002", "DMPGWM0002"],
    ]);
    expect(reversed.map(p => p.sequence)).toEqual([3, 2, 1]);
  });
  it("uses only persisted reprint items rather than expanding the original scope", () => {
    expect(prepareProductLabelBatch({ ...job, requestedQuantity: 1, reprintOfJobId: "old-job" },
      [{ ...items[2], sequence: 1, sourceItemId: "original-item" }])).toHaveLength(1);
  });
  it.each([
    ["missing items", job, items.slice(0, 2)],
    ["duplicate item", job, [items[0], items[0], items[2]]],
    ["wrong job", job, items.map(p => ({ ...p, jobId: "other-job" }))],
    ["missing sequence", job, items.map(p => ({ ...p, sequence: p.sequence + 1 }))],
    ["empty job", { ...job, requestedQuantity: 0 }, []],
    ["cancelled job", { ...job, status: "cancelled" }, items],
    ["printed job", { ...job, status: "printed" }, items],
    ["wrong template", { ...job, templateId: "bin_location" }, items],
    ["blank barcode", job, items.map(p => ({ ...p, payloadSnapshot: { ...p.payloadSnapshot, productBarcode: "" } }))],
    ["non-encodable barcode", job, items.map(p => ({ ...p, payloadSnapshot: { ...p.payloadSnapshot, productBarcode: "配件" } }))],
    ["wrong shipment", job, items.map(p => ({ ...p, payloadSnapshot: { ...p.payloadSnapshot, shipmentId: "other" } }))],
  ])("rejects %s before producing any output", (_reason, candidateJob, candidateItems) => {
    expect(() => prepareProductLabelBatch(candidateJob as WarehouseLabelPrintJob, candidateItems as WarehouseLabelPrintItem[])).toThrow();
  });
});
