import { beforeEach, expect, it } from "vitest";
import { MemoryRepository } from "../lib/memoryRepository";
import {
  validateTestPrintSelection,
  prepareTestPrintBatch,
  type TestPrintCreateInput,
} from "../lib/warehouseTestPrint";
import { buildProductLabelContent } from "../lib/warehouseLabelContent";

const repo = new MemoryRepository();
beforeEach(async () => {
  await repo.resetForTests();
});
const actor = "test-operator";
function input(): TestPrintCreateInput {
  const content = buildProductLabelContent({
    sku: "TEST-A",
    barcode: "DMPTESTA",
    labelProfile: {
      schemaVersion: 1,
      displayName: "OIL FILTER",
      vehicleMakes: ["GWM"],
      partReference: "PN-1",
      position: { status: "not_applicable" },
    },
  }).content!;
  return {
    requestId: "11111111-1111-4111-8111-111111111111",
    requestKey: "scope-A-2",
    shipmentId: "shipment-test-1",
    labels: [1, 2].map((sequence) => ({
      itemId: `item-${sequence}`,
      sequence,
      sku: "TEST-A",
      barcode: "DMPTESTA",
      labelContent: content,
    })),
  };
}
it("accepts three products with two copies and caps quantity", () => {
  expect(
    validateTestPrintSelection(
      ["A", "B", "C"].map((sku) => ({ sku, copies: 2 })),
    ).total,
  ).toBe(6);
});
it.each([
  [],
  [{ sku: "A", copies: 0 }],
  [{ sku: "A", copies: 6 }],
  [{ sku: "A", copies: 1.5 }],
  [
    { sku: "A", copies: 2 },
    { sku: "A", copies: 2 },
  ],
  Array.from({ length: 11 }, (_, i) => ({ sku: `A${i}`, copies: 1 })),
  Array.from({ length: 5 }, (_, i) => ({ sku: `A${i}`, copies: 5 })),
])("rejects invalid selections %#", (items) => {
  expect(() => validateTestPrintSelection(items)).toThrow();
});
it("deduplicates same actor request without overwriting immutable artwork", async () => {
  const request = input();
  const first = await repo.testPrint.create(request, actor);
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  request.labels[0].labelContent!.profile.displayName = "CHANGED";
  const again = await repo.testPrint.create(request, actor);
  expect(again).toMatchObject({ ok: true, job: { id: first.job.id } });
  const saved = await repo.testPrint.get(first.job.id);
  expect(saved?.labels[0].labelContent?.profile.displayName).toBe("OIL FILTER");
  expect(
    await repo.testPrint.create({ ...input(), requestKey: "different" }, actor),
  ).toMatchObject({ ok: false, code: "conflict" });
});
it.each(["printed", "failed", "cancelled"] as const)(
  "test %s leaves formal job storage, receipt and stock unchanged",
  async (outcome) => {
    const before = await repo.getAdminState();
    const result = await repo.testPrint.create(input(), actor);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(prepareTestPrintBatch(result.job)).toHaveLength(2);
    expect(
      await repo.testPrint.recordOutcome(
        result.job.id,
        outcome,
        "Calibration",
        actor,
      ),
    ).toMatchObject({ ok: true, job: { status: outcome, outcomeBy: actor } });
    expect(await repo.getWarehouseLabelPrintJob(result.job.id)).toMatchObject({
      ok: false,
    });
    expect(await repo.getAdminState()).toEqual(before);
  },
);
it("terminal retries are idempotent and conflicting outcomes are rejected", async () => {
  const created = await repo.testPrint.create(input(), actor);
  if (!created.ok) throw Error("create failed");
  const saved = await repo.testPrint.recordOutcome(
    created.job.id,
    "failed",
    "Paper jam",
    actor,
  );
  expect(
    await repo.testPrint.recordOutcome(
      created.job.id,
      "failed",
      "Paper jam",
      actor,
    ),
  ).toEqual(saved);
  expect(
    await repo.testPrint.recordOutcome(created.job.id, "printed", "", actor),
  ).toMatchObject({ ok: false, code: "conflict" });
  expect(
    await repo.testPrint.recordOutcome(
      created.job.id,
      "failed",
      "different",
      actor,
    ),
  ).toMatchObject({ ok: false, code: "conflict" });
  if (saved.ok) expect(() => prepareTestPrintBatch(saved.job)).toThrow();
});
it("only the originating actor can reconcile a request ID; list is paginated", async () => {
  await repo.testPrint.create(input(), actor);
  expect(
    await repo.testPrint.findByRequest(input().requestId, "another"),
  ).toBeNull();
  expect(await repo.testPrint.list("shipment-test-1", 1)).toMatchObject({
    total: 1,
    jobs: [{ createdBy: actor }],
  });
  expect((await repo.testPrint.list("shipment-test-1", 2)).jobs).toHaveLength(
    0,
  );
});
