import { beforeEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
const { factory } = vi.hoisted(() => ({ factory: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({
  createServiceSupabaseClient: factory,
}));
import { SupabaseTestPrintStore } from "../lib/supabaseTestPrintStore";
import type { TestPrintCreateInput } from "../lib/warehouseTestPrint";
const row = {
  id: "11111111-1111-4111-8111-111111111111",
  request_id: "22222222-2222-4222-8222-222222222222",
  request_key: "key",
  shipment_id: "shipment",
  labels: [],
  status: "printed",
  created_by: "actor",
  created_at: "2026-11-01T00:00:00Z",
  outcome_by: "operator",
  outcome_at: "2026-11-01T01:00:00Z",
  reason: "",
};
const input: TestPrintCreateInput = {
  requestId: row.request_id,
  requestKey: "key",
  shipmentId: "shipment",
  labels: [],
};
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetcher = vi.fn();
  factory.mockReturnValue(
    createClient("https://test.invalid", "local-test-key", {
      global: { fetch: fetcher as typeof fetch },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  );
});
const reply = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
it("deduplicates unique conflicts through an actor-scoped lookup and maps stored audit fields", async () => {
  fetcher
    .mockImplementationOnce(async () =>
      reply({ code: "23505", message: "unique" }, 409),
    )
    .mockImplementationOnce(async (url: string) => {
      const q = new URL(url);
      expect(q.searchParams.get("created_by")).toBe("eq.actor");
      expect(q.searchParams.get("request_id")).toBe(`eq.${row.request_id}`);
      return reply([row]);
    });
  const result = await new SupabaseTestPrintStore().create(input, "actor");
  expect(result).toMatchObject({
    ok: true,
    job: {
      id: row.id,
      createdBy: "actor",
      outcomeBy: "operator",
      outcomeAt: row.outcome_at,
      status: "printed",
    },
  });
});
it("updates only pending records, then reconciles concurrent terminal results without another write", async () => {
  fetcher
    .mockImplementationOnce(async (url: string, init: RequestInit) => {
      expect(init.method).toBe("PATCH");
      expect(new URL(url).searchParams.get("status")).toBe("eq.pending");
      expect(JSON.parse(init.body as string)).toMatchObject({
        status: "printed",
        outcome_by: "operator",
      });
      return reply([]);
    })
    .mockImplementationOnce(async () => reply([row]));
  expect(
    await new SupabaseTestPrintStore().recordOutcome(
      row.id,
      "printed",
      "",
      "operator",
    ),
  ).toMatchObject({
    ok: true,
    job: { status: "printed", outcomeAt: row.outcome_at },
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("reports conflicting terminal results instead of overwriting them", async () => {
  fetcher.mockResolvedValueOnce(reply([])).mockResolvedValueOnce(reply([row]));
  expect(
    await new SupabaseTestPrintStore().recordOutcome(
      row.id,
      "failed",
      "jam",
      "operator",
    ),
  ).toMatchObject({ ok: false, code: "conflict" });
});
it("surfaces storage outages and never reports an empty list as success", async () => {
  fetcher.mockResolvedValue(
    reply({ code: "42P01", message: "table unavailable" }, 400),
  );
  await expect(
    new SupabaseTestPrintStore().list("shipment", 1),
  ).rejects.toMatchObject({ code: "42P01" });
});
