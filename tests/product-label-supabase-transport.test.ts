import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SupabaseRepository } from "../lib/supabaseRepository";
import type { AdminState } from "../lib/repository";
const profile = { schemaVersion: 1 as const, displayName: "OIL FILTER", vehicleMakes: ["Toyota"], partReference: "F12", position: { status: "not_applicable" as const } };
const requests: Array<{ url: URL; method: string; body: Record<string, unknown> }> = [];
let saved: Record<string, unknown>;
class Repository extends SupabaseRepository {
  override async getAdminState() {
    return { catalogue: [{ sku: "QA1", labelProfile: saved.label_profile ?? null }] } as AdminState;
  }
}
beforeEach(() => {
  saved = { label_profile: profile }; requests.length = 0;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://label-transport.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "local-test-placeholder");
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    expect(url.hostname).toBe("label-transport.invalid");
    const method = init?.method ?? "GET"; const body = init?.body ? JSON.parse(String(init.body)) : {};
    requests.push({ url, method, body });
    if (method !== "GET") Object.assign(saved, body);
    return new Response(JSON.stringify(method === "GET" ? [{ sku: "QA1", barcode: "CODE1", label_profile: saved.label_profile }] : { sku: "QA1" }), { status: 200, headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("writes profile, preserves omission and sends explicit null on clear through the real SDK", async () => {
  const repository = new Repository();
  await repository.createProductMaster({ sku: "QA1", barcode: "CODE1", brand: "GWM", name: "Filter", category: "Service", labelProfile: profile });
  expect(requests[0].body.label_profile).toEqual(profile);
  await repository.updateProductMaster({ sku: "QA1", name: "Changed" });
  expect(requests[1].body).not.toHaveProperty("label_profile");
  expect((await repository.getWarehouseLabelProducts(["QA1"]))[0].labelProfile).toEqual(profile);
  await repository.updateProductMaster({ sku: "QA1", labelProfile: null });
  expect(requests.at(-1)!.body.label_profile).toBeNull();
  expect((await repository.getWarehouseLabelProducts(["QA1"]))[0].labelProfile).toBeNull();
});
it("uses a limited product projection and does not query costs or accounts", async () => {
  await new Repository().getWarehouseLabelProducts(["QA1", "QA1"]);
  expect(requests).toHaveLength(1);
  expect(requests[0].url.pathname).toBe("/rest/v1/products");
  expect(requests[0].url.searchParams.get("select")).toBe("sku,barcode,label_profile");
  expect(requests[0].url.searchParams.get("sku")).toBe("in.(QA1)");
  expect(await new Repository().getWarehouseLabelProducts([])).toEqual([]);
  expect(requests).toHaveLength(1);
});
