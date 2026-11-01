import { z } from "zod";
import type { ProductLabelPage } from "./productLabelBatch";
import { readProductLabelSnapshot } from "./warehouseLabelContent";

export const testPrintItemsSchema = z
  .array(
    z
      .object({
        sku: z.string().trim().min(1).max(120),
        copies: z.number().int().min(1).max(5),
      })
      .strict(),
  )
  .min(1)
  .max(10)
  .refine(
    (items) => new Set(items.map((i) => i.sku)).size === items.length,
    "Duplicate SKU",
  )
  .refine(
    (items) => items.reduce((n, i) => n + i.copies, 0) <= 20,
    "Maximum 20 labels",
  );
export type TestPrintSelection = z.infer<typeof testPrintItemsSchema>[number];
export type TestPrintOutcome = "printed" | "failed" | "cancelled";
export type TestPrintCreateInput = {
  requestId: string;
  requestKey: string;
  shipmentId: string;
  labels: ProductLabelPage[];
};
export type TestPrintJob = TestPrintCreateInput & {
  id: string;
  status: "pending" | TestPrintOutcome;
  createdBy: string;
  createdAt: string;
  outcomeBy?: string;
  outcomeAt?: string;
  reason?: string;
};
export type TestPrintResult =
  | { ok: true; job: TestPrintJob }
  | { ok: false; code: "conflict" | "not_found"; message: string };
export interface TestPrintStore {
  create(input: TestPrintCreateInput, actor: string): Promise<TestPrintResult>;
  get(id: string): Promise<TestPrintJob | null>;
  findByRequest(requestId: string, actor: string): Promise<TestPrintJob | null>;
  list(
    shipmentId: string,
    page: number,
  ): Promise<{ jobs: TestPrintJob[]; total: number }>;
  recordOutcome(
    id: string,
    outcome: TestPrintOutcome,
    reason: string,
    actor: string,
  ): Promise<TestPrintResult>;
}
export function validateTestPrintSelection(value: unknown) {
  const items = testPrintItemsSchema.parse(value);
  return { items, total: items.reduce((n, i) => n + i.copies, 0) };
}
export function prepareTestPrintBatch(job: TestPrintJob): ProductLabelPage[] {
  if (
    job.status !== "pending" ||
    !Array.isArray(job.labels) ||
    !job.labels.length ||
    job.labels.length > 20
  )
    throw Error("This test task cannot be printed.");
  const ids = new Set<string>();
  const pages = job.labels.map((label, index) => {
    if (!label.itemId || ids.has(label.itemId) || label.sequence !== index + 1)
      throw Error("Invalid test label sequence.");
    ids.add(label.itemId);
    const content = readProductLabelSnapshot(label.labelContent);
    if (content.sku !== label.sku || content.productBarcode !== label.barcode)
      throw Error("Test label identity mismatch.");
    return { ...label, labelContent: content };
  });
  const counts = new Map<string, number>();
  for (const p of pages) counts.set(p.sku, (counts.get(p.sku) ?? 0) + 1);
  validateTestPrintSelection(
    [...counts].map(([sku, copies]) => ({ sku, copies })),
  );
  return structuredClone(pages);
}
export function testPrintConflict(): TestPrintResult {
  return {
    ok: false,
    code: "conflict",
    message:
      "This test request has already been saved with different details. Review its record.",
  };
}
export function testPrintMissing(): TestPrintResult {
  return {
    ok: false,
    code: "not_found",
    message: "Test print task was not found.",
  };
}
export function existingTestOutcome(
  job: TestPrintJob,
  outcome: TestPrintOutcome,
  reason: string,
): TestPrintResult {
  return job.status === outcome && (job.reason ?? "") === reason
    ? { ok: true, job }
    : testPrintConflict();
}
