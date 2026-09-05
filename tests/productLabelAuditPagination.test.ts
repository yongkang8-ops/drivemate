import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ count: 2201, cap: 1000, failAfter: Infinity }));
vi.mock("../lib/supabaseClient", () => ({ createServiceSupabaseClient: () => ({
  from(table: string) {
    let jobId = "";
    const query = {
      select: () => query,
      eq: (_field: string, id: string) => { jobId = id; return query; },
      order: () => query,
      maybeSingle: async () => ({ data: { id: jobId, template_id: "unit_product", payload_snapshot: { shipmentId: "shipment-a" }, requested_quantity: state.count, status: "pending", created_at: "2026-09-05T00:00:00Z" }, error: null }),
      range: async (from: number, to: number) => {
        if (from >= state.failAfter) return { data: null, error: new Error("page read failed") };
        return { data: Array.from({ length: Math.min(state.cap, to - from + 1, Math.max(0, state.count - from)) }, (_, i) => ({
          id: `item-${from + i + 1}`, job_id: jobId, sequence: from + i + 1, payload_snapshot: { sku: "SKU-A", productBarcode: "BARCODE-A", shipmentId: "shipment-a" }, created_at: "2026-09-05T00:00:00Z",
        })), error: null };
      },
      // Characterizes the external row cap when the real repository omits pagination.
      then(resolve: (value: unknown) => void) {
        if (table !== "warehouse_label_print_items") throw Error("Unexpected query");
        return query.range(0, state.cap - 1).then(resolve);
      },
    };
    return query;
  },
}) }));
import { SupabaseRepository } from "../lib/supabaseRepository";

describe("complete persisted product label audit", () => {
  beforeEach(() => Object.assign(state, { count: 2201, cap: 1000, failAfter: Infinity }));
  it.each([1000, 37])("retrieves all 2201 items even when the service caps reads at %s", async cap => {
    state.cap = cap;
    const result = await new SupabaseRepository().getWarehouseLabelPrintJob("job-a");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(2201);
    expect(result.items[0]).toMatchObject({ id: "item-1", jobId: "job-a", sequence: 1 });
    expect(result.items[2200]).toMatchObject({ id: "item-2201", jobId: "job-a", sequence: 2201 });
    expect(new Set(result.items.map(item => item.id)).size).toBe(2201);
  });
  it("does not return a partial batch as successful when a later page fails", async () => {
    state.failAfter = 500;
    await expect(new SupabaseRepository().getWarehouseLabelPrintJob("job-a")).rejects.toThrow("page read failed");
  });
});
