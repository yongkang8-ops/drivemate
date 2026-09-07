import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { POST } from "../app/api/products/route";
import { PATCH } from "../app/api/products/[sku]/route";
import { MemoryRepository } from "../lib/memoryRepository";

let repository: MemoryRepository;
const labelProfile = { schemaVersion: 1, displayName: "OIL FILTER", vehicleMakes: ["Toyota"], partReference: "TEST-FILTER", position: { status: "not_applicable" } };
const body = { sku: "TEST-LABEL-API", barcode: "TESTLABELAPI", brand: "GWM", name: "Filter", category: "Service", labelProfile };
const request = (method: string, value: unknown, role = "admin") => new Request("http://localhost/api/products", { method, headers: { "content-type": "application/json", "x-drivemate-role": role }, body: JSON.stringify(value) });
beforeEach(async () => {
  vi.stubEnv("DRIVEMATE_REPOSITORY", "memory");
  vi.stubEnv("DRIVEMATE_ENABLE_DEMO_AUTH", "true");
  repository = new MemoryRepository();
  await repository.resetForTests();
  globalThis.__drivemateRepository = repository;
});
afterEach(() => { globalThis.__drivemateRepository = undefined; vi.unstubAllEnvs(); });
describe("protected product label metadata API", () => {
  it("roundtrips metadata and preserves omission while allowing explicit clearing", async () => {
    const response = await POST(request("POST", body));
    expect(response.status).toBe(201);
    expect((await response.json()).product.labelProfile).toEqual(labelProfile);
    const context = { params: Promise.resolve({ sku: body.sku }) };
    await PATCH(request("PATCH", { name: "Updated filter" }), context);
    expect((await repository.getAdminState()).catalogue.find(p => p.sku === body.sku)?.labelProfile).toEqual(labelProfile);
    const cleared = await PATCH(request("PATCH", { labelProfile: null }), context);
    expect((await cleared.json()).product.labelProfile).toBeNull();
  });
  it("rejects malformed Position before product changes", async () => {
    await POST(request("POST", body));
    const response = await PATCH(request("PATCH", { name: "Bad change", labelProfile: { ...labelProfile, position: { status: "specified" } } }), { params: Promise.resolve({ sku: body.sku }) });
    expect(response.status).toBe(400);
    expect((await repository.getAdminState()).catalogue.find(p => p.sku === body.sku)?.name).toBe("Filter");
  });
  it("does not let warehouse employees change product label definitions", async () => {
    expect((await POST(request("POST", body, "warehouse_staff"))).status).toBe(403);
    expect((await repository.getAdminState()).catalogue.some(p => p.sku === body.sku)).toBe(false);
  });
});
