import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/warehouse/labels/route";
import { MemoryRepository } from "../lib/memoryRepository";
import { products, updateProductMasterData } from "../lib/catalogue";
import { prepareProductLabelBatch } from "../lib/productLabelBatch";
import { buildProductLabelContent } from "../lib/warehouseLabelContent";

const profile = { schemaVersion: 1 as const, displayName: "OIL FILTER", vehicleMakes: ["Toyota", "Lexus"], partReference: "FILTER-12", position: { status: "not_applicable" as const } };
let repository: MemoryRepository;
const request = () => new Request("http://localhost/api/warehouse/labels", { method: "POST", headers: { "content-type": "application/json", "x-drivemate-role": "partner" }, body: JSON.stringify({ selection: { shipmentId: "shipment-test-1", cartonNumbers: ["C001"] }, templateId: "unit_product" }) });
beforeEach(async () => {
  vi.stubEnv("DRIVEMATE_REPOSITORY", "memory"); vi.stubEnv("DRIVEMATE_ENABLE_DEMO_AUTH", "true");
  repository = new MemoryRepository(); await repository.resetForTests(); globalThis.__drivemateRepository = repository;
  for (const product of products) updateProductMasterData({ sku: product.sku, labelProfile: profile });
});
afterEach(() => { globalThis.__drivemateRepository = undefined; vi.unstubAllEnvs(); });

it("freezes full v4 content; a subsequent master edit cannot alter saved printing", async () => {
  const response = await POST(request()); expect(response.status).toBe(201);
  const body = await response.json();
  expect(body.items[0].payloadSnapshot.labelContent).toMatchObject({ version: "unit-product-v4", profile, companyName: "DRIVER MATE PTY LTD", website: "drivemateparts.com.au" });
  updateProductMasterData({ sku: body.items[0].payloadSnapshot.sku, labelProfile: { ...profile, displayName: "CHANGED" } });
  const saved = await repository.getWarehouseLabelPrintJob(body.job.id); if (!saved.ok) throw new Error(saved.message);
  expect(prepareProductLabelBatch(saved.job, saved.items)[0].labelContent?.profile.displayName).toBe("OIL FILTER");
});
it("reports selected missing metadata and creates no job", async () => {
  updateProductMasterData({ sku: "DM-GWM-OF-001", labelProfile: null });
  const create = vi.spyOn(repository, "createWarehouseLabelPrintJobWithItems");
  const response = await POST(request()); expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ labelIssues: [{ sku: "DM-GWM-OF-001", fields: ["labelProfile"] }] });
  expect(create).not.toHaveBeenCalled();
  const preview = await GET(new Request("http://localhost/api/warehouse/labels?shipmentId=shipment-test-1&cartonNumber=C001", { headers: { "x-drivemate-role": "partner" } }));
  expect(preview.status).toBe(200); expect((await preview.json()).labelProducts[0]).toHaveProperty("issues");
});
it("does not accept injected client artwork", async () => {
  const source = request(); const body = await source.json();
  const response = await POST(new Request(source.url, { method: "POST", headers: source.headers, body: JSON.stringify({ ...body, labelContent: profile }) }));
  expect(response.status).toBe(400);
});
it("rejects unsupported snapshot versions instead of falling back to legacy", async () => {
  const body = await (await POST(request())).json(); body.items[0].payloadSnapshot.labelContent.version = "future";
  expect(() => prepareProductLabelBatch(body.job, body.items)).toThrow();
});
it("a new job cannot silently print one missing-content item as a legacy label", async () => {
  const body = await (await POST(request())).json();
  expect(body.job.payloadSnapshot.labelVersion).toBe("unit-product-v4");
  delete body.items[0].payloadSnapshot.labelContent;
  expect(() => prepareProductLabelBatch(body.job, body.items)).toThrow();
});
it("rejects unversioned jobs carrying v4 artwork, including mixed batches", async () => {
  const body = await (await POST(request())).json();
  delete body.job.payloadSnapshot.labelVersion;
  expect(() => prepareProductLabelBatch(body.job, body.items)).toThrow();
  delete body.items[0].payloadSnapshot.labelContent;
  expect(() => prepareProductLabelBatch(body.job, body.items)).toThrow();
});
it("refuses missing positions, overlong artwork and reserved barcodes without inventing values", () => {
  expect(buildProductLabelContent({ sku: "SKU1", barcode: "CODE1", labelProfile: profile }).issues).toEqual([]);
  expect(buildProductLabelContent({ sku: "SKU1", barcode: "CODE1", labelProfile: { ...profile, position: { status: "unknown" } } }).issues).toContain("position");
  expect(buildProductLabelContent({ sku: "SKU1", barcode: "CODE1", labelProfile: { ...profile, displayName: "A".repeat(100) } }).issues).toContain("layout.displayName");
  expect(buildProductLabelContent({ sku: "SKU1", barcode: "CODE1", labelProfile: { ...profile, displayName: "ABCDEFGHIJKLMNOPQ RSTUVWXYZABCDEFG HIJKLMNOPQRS" } }).issues).toContain("layout.displayName");
  expect(buildProductLabelContent({ sku: "SKU1", barcode: "DMLOC:BIN1", labelProfile: profile }).issues).toContain("barcode");
});
