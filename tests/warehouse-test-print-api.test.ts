import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { MemoryRepository } from "../lib/memoryRepository";
import { resolveWarehouseInboundScope } from "../lib/warehouseInboundScope";
import { POST, GET } from "../app/api/warehouse/test-labels/route";
import { POST as outcome } from "../app/api/warehouse/test-labels/[jobId]/route";
import { POST as formalOutcome } from "../app/api/warehouse/labels/[jobId]/route";
const repo = new MemoryRepository();
let selection: { shipmentId: string };
let items: { sku: string; copies: number }[];
const requestId = "11111111-1111-4111-8111-111111111111";
it("rejects a test creation while a persisted formal print task is unresolved", async () => {
  await repo.createWarehouseLabelPrintJob({
    templateId: "unit_product",
    requestedQuantity: 2,
    payloadSnapshot: { shipmentId: selection.shipmentId },
  });
  expect((await POST(request({ requestId, selection, items }))).status).toBe(
    409,
  );
  expect((await repo.testPrint.list(selection.shipmentId, 1)).total).toBe(0);
});
function request(body: unknown, role = "warehouse_staff") {
  return new Request("http://localhost/api/warehouse/test-labels", {
    method: "POST",
    headers: { "content-type": "application/json", "x-drivemate-role": role },
    body: JSON.stringify(body),
  });
}
beforeEach(async () => {
  vi.stubEnv("DRIVEMATE_REPOSITORY", "memory");
  vi.stubEnv("DRIVEMATE_ENABLE_DEMO_AUTH", "true");
  await repo.resetForTests();
  selection = { shipmentId: "shipment-test-1" };
  const s = await resolveWarehouseInboundScope(repo, selection);
  if (!s.ok) throw Error("fixture");
  items = s.scope.lines.slice(0, 3).map((l) => ({ sku: l.sku, copies: 2 }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it.each(["missing", "duplicate", "barcode"] as const)(
  "rejects %s product evidence without saving a test job",
  async (kind) => {
    const original = await repo.getWarehouseLabelProducts(
      items.map((i) => i.sku),
    );
    vi.spyOn(
      MemoryRepository.prototype,
      "getWarehouseLabelProducts",
    ).mockResolvedValue(
      kind === "missing"
        ? original.map((p) => ({ ...p, labelProfile: null }))
        : kind === "duplicate"
          ? [...original, original[0]]
          : original.map((p) => ({ ...p, barcode: "WRONG" })),
    );
    expect((await POST(request({ requestId, selection, items }))).status).toBe(
      422,
    );
    expect((await repo.testPrint.list(selection.shipmentId, 1)).total).toBe(0);
  },
);
it("creates six test labels, deduplicates a request and leaves print gate locked", async () => {
  items = items.map((item) => ({ ...item, copies: 3 })); // Local seed has two SKUs; 3x2 is covered by the domain/browser fixture.
  const response = await POST(request({ requestId, selection, items }));
  expect(response.status).toBe(201);
  const { job } = await response.json();
  expect(job.labels).toHaveLength(6);
  const again = await POST(request({ requestId, selection, items }));
  expect((await again.json()).job.id).toBe(job.id);
  const done = await outcome(request({ outcome: "printed", reason: "" }), {
    params: Promise.resolve({ jobId: job.id }),
  });
  expect(done.status).toBe(200);
  const scope = await resolveWarehouseInboundScope(repo, selection);
  if (!scope.ok) throw Error("scope");
  expect((await repo.checkWarehouseReceiptPrintGate(scope.scope)).ok).toBe(
    false,
  );
  expect(await repo.getWarehouseLabelPrintJob(job.id)).toMatchObject({
    ok: false,
  });
  const rejected = await formalOutcome(
    request({ action: "outcome", outcome: "printed" }),
    { params: Promise.resolve({ jobId: job.id }) },
  );
  expect(rejected.status).toBeGreaterThanOrEqual(400);
});
it.each(["public", "trade"])("rejects %s", async (role) => {
  expect(
    (await POST(request({ requestId, selection, items }, role))).status,
  ).toBe(403);
});
it.each(["admin", "partner", "warehouse_staff"])(
  "allows %s without global MFA",
  async (role) => {
    expect(
      (await POST(request({ requestId, selection, items }, role))).status,
    ).toBe(201);
  },
);
it("rejects malformed JSON, quantity overflow, duplicates and forged artwork", async () => {
  expect(
    (
      await POST(
        new Request("http://localhost/api/warehouse/test-labels", {
          method: "POST",
          headers: { "x-drivemate-role": "admin" },
          body: "{",
        }),
      )
    ).status,
  ).toBe(400);
  for (const body of [
    { requestId, selection, items: [] },
    { requestId, selection, items: [{ sku: items[0].sku, copies: 6 }] },
    { requestId, selection, items: [items[0], items[0]] },
    { requestId, selection, items, labels: [] },
  ])
    expect((await POST(request(body))).status).toBe(400);
});
it("rejects foreign SKUs and conflicting idempotency reuse", async () => {
  expect(
    (
      await POST(
        request({
          requestId,
          selection,
          items: [{ sku: "NOT-IN-SHIPMENT", copies: 2 }],
        }),
      )
    ).status,
  ).toBe(422);
  await POST(request({ requestId, selection, items }));
  expect(
    (
      await POST(
        request({ requestId, selection, items: [{ ...items[0], copies: 1 }] }),
      )
    ).status,
  ).toBe(409);
});
it("rejects cookie-auth mutations without CSRF before looking up the task", async () => {
  expect(
    (
      await POST(
        new Request("http://localhost/api/warehouse/test-labels", {
          method: "POST",
          headers: { origin: "https://evil.invalid" },
          body: "{}",
        }),
      )
    ).status,
  ).toBe(403);
});
it("reconciles own request and rejects formal IDs in the test API", async () => {
  await POST(request({ requestId, selection, items }));
  const response = await GET(
    new Request(
      `http://localhost/api/warehouse/test-labels?requestId=${requestId}`,
      { headers: { "x-drivemate-role": "warehouse_staff" } },
    ),
  );
  expect((await response.json()).job.status).toBe("pending");
  const formal = await repo.createWarehouseLabelPrintJob({
    templateId: "unit_product",
    requestedQuantity: 1,
    payloadSnapshot: {},
  });
  if (!formal.ok) throw Error("fixture");
  const rejected = await outcome(request({ outcome: "printed", reason: "" }), {
    params: Promise.resolve({ jobId: formal.job.id }),
  });
  expect(rejected.status).toBeGreaterThanOrEqual(400);
});
