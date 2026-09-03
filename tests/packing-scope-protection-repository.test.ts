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
});
