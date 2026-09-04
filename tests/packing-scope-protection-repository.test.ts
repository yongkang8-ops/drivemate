import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({ createServiceSupabaseClient: () => ({ rpc }) }));
import { SupabaseRepository } from "../lib/supabaseRepository";

describe("used source scope errors", () => {
  it("returns a recoverable result when the database refuses a changed used scope", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "A used source scope cannot be renamed, split or have its expected contents changed" } });
    await expect(new SupabaseRepository().confirmPackingListRevision("revision-id", { actorId: "actor-id" })).resolves.toEqual({
      ok: false, message: "A used source scope cannot be renamed, split or have its expected contents changed",
    });
    expect(rpc).toHaveBeenCalledWith("dm_confirm_packing_list_revision", { p_revision_id: "revision-id", p_actor_id: "actor-id" });
  });

  it("serializes Unit Product print confirmation with Packing List confirmation", () => {
    const sql = readFileSync(join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260906_v21_warehouse_receipt_scope_protection.sql",
    ), "utf8").replace(/\s+/g, " ");

    expect(sql).toContain("rename to dm_record_warehouse_label_print_outcome_v18;");
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended(v_shipment_id::text,617))");
    expect(sql).toContain("perform public.dm_assert_warehouse_receipt_scope(v_shipment_id,v_job.payload_snapshot)");
    expect(sql).toContain("revoke all on function public.dm_record_warehouse_label_print_outcome_v18(uuid,text) from public,anon,authenticated,service_role;");
    expect(sql).toContain("grant execute on function public.dm_record_warehouse_label_print_outcome(uuid,text) to service_role;");
  });
});
