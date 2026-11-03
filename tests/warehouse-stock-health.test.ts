import { expect, it, vi } from "vitest";
import { GET } from "../app/api/health/route";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({ createServiceSupabaseClient: () => ({ rpc }) }));
vi.mock("../lib/runtimeReadiness", () => ({
  getRuntimeReadiness: () => ({ environment: "production", repository: { mode: "supabase" }, auth: { supabaseConfigured: true }, checks: [] }),
}));

const importedPurchase = {
  purchase_order_count: 1, line_count: 119, unique_part_number_count: 119,
  quantity: 706, subtotal_minor: 6313780, discount_minor: 13780,
  cash_cost_minor: 6300000, final_total_minor: 6300000,
  gate_mismatch_count: 0, public_product_count: 0,
};

it.each([
  ["awaiting receipt", { available_stock: 0 }, 200],
  ["two units put away", { available_stock: 2 }, 200],
  ["invalid negative availability", { available_stock: -1 }, 503],
  ["missing availability", {}, 503],
  ["invalid fractional availability", { available_stock: 0.5 }, 503],
  ["purchase total mismatch", { available_stock: 2, quantity: 705 }, 503],
  ["unapproved publication", { available_stock: 2, public_product_count: 1 }, 503],
  ["release gate mismatch", { available_stock: 2, gate_mismatch_count: 1 }, 503],
] as const)("checks production readiness with %s", async (_case, fields, status) => {
  rpc.mockResolvedValue({ data: {
    schema: { missing_rls_count: 0, missing_function_count: 0, direct_client_write_grant_count: 0 },
    purchase_import: { ...importedPurchase, ...fields },
  }, error: null });
  const response = await GET();
  expect(response.status).toBe(status);
  expect((await response.json()).ready).toBe(status === 200);
});
