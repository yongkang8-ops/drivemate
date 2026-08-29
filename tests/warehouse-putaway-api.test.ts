import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getHistory } from "../app/api/warehouse/history/route";
import { GET as getPutawayScope, POST as putAway } from "../app/api/warehouse/putaway/route";
import { MemoryRepository } from "../lib/memoryRepository";
import { buildWarehouseLabelPrintScope, buildWarehouseReceiptScope } from "../lib/warehouseLabels";
import { prepareWarehouseReceipt } from "../lib/warehouseReceiving";

const selection = { shipmentId: "shipment-test-1", cartonNumbers: ["C001"] };
let repository: MemoryRepository;

async function confirmReceipt() {
  const [expected, shipment] = await Promise.all([
    repository.getWarehouseExpectedReceipt(selection),
    repository.getPrearrivalShipment(selection.shipmentId),
  ]);
  if (!expected.ok || !shipment.ok) throw new Error("Test receipt scope was not available.");
  const printJob = await repository.createWarehouseLabelPrintJob({
    templateId: "unit_product",
    requestedQuantity: 18,
    payloadSnapshot: buildWarehouseLabelPrintScope(expected.receipt, "unit_product"),
  }, { actorId: "demo-partner-user" });
  if (!printJob.ok) throw new Error(printJob.message);
  await repository.recordWarehouseLabelPrintOutcome(printJob.job.id, "printed");
  const scope = buildWarehouseReceiptScope(expected.receipt, shipment.shipment.productBarcodes);
  const prepared = prepareWarehouseReceipt({
    expectedScope: scope,
    mode: "counted_quantity",
    scannedProductBarcodes: ["DMPGWMOF001", "DMPGWMAF002"],
    countedLines: [
      { productBarcode: "DMPGWMOF001", actualQuantity: 12 },
      { productBarcode: "DMPGWMAF002", actualQuantity: 6 },
    ],
  });
  if (!prepared.ok) throw new Error(prepared.message);
  const session = await repository.createWarehouseReceiptSession({
    scope,
    mode: "counted_quantity",
    lines: prepared.lines,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  });
  if (!session.ok) throw new Error(session.message);
  await repository.confirmWarehouseReceipt(session.session.id, { actorId: "demo-partner-user" });
}

function putawayRequest(body: Record<string, unknown>) {
  return new Request("https://drivemateparts.com.au/api/warehouse/putaway", {
    method: "POST",
    headers: { "content-type": "application/json", "x-drivemate-role": "partner" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  vi.stubEnv("DRIVEMATE_REPOSITORY", "memory");
  vi.stubEnv("DRIVEMATE_ENABLE_DEMO_AUTH", "true");
  repository = new MemoryRepository();
  await repository.resetForTests();
  globalThis.__drivemateRepository = repository;
});

afterEach(() => {
  globalThis.__drivemateRepository = undefined;
  vi.unstubAllEnvs();
});

describe("warehouse putaway API", () => {
  it("requires a DMLOC destination barcode", async () => {
    const response = await putAway(putawayRequest({
      selection,
      productBarcode: "DMPGWMOF001",
      destinationBarcode: "BNE-A01-03",
      quantity: 1,
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      message: "Scan a DMLOC destination label before putaway.",
    });
  });

  it("returns remaining scoped staging quantity and records a confirmed putaway", async () => {
    await confirmReceipt();

    const scopeResponse = await getPutawayScope(new Request(
      "https://drivemateparts.com.au/api/warehouse/putaway?shipmentId=shipment-test-1&cartonNumber=C001",
      { headers: { "x-drivemate-role": "partner" } },
    ));
    await expect(scopeResponse.json()).resolves.toMatchObject({
      ok: true,
      lines: expect.arrayContaining([
        expect.objectContaining({ sku: "DM-GWM-OF-001", remainingQuantity: 12 }),
      ]),
    });

    const response = await putAway(putawayRequest({
      selection,
      productBarcode: "DMPGWMOF001",
      destinationBarcode: "DMLOC:BNE-A01-03",
      quantity: 2,
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      sourceLocation: "BNE-RECEIVING-STAGING",
      destinationLocation: "BNE-A01-03",
      remainingQuantity: 10,
    });

    const historyResponse = await getHistory(new Request(
      "https://drivemateparts.com.au/api/warehouse/history?shipmentId=shipment-test-1&timeZone=Australia%2FBrisbane",
      { headers: { "x-drivemate-role": "partner" } },
    ));
    await expect(historyResponse.json()).resolves.toMatchObject({
      ok: true,
      rows: expect.arrayContaining([
        expect.objectContaining({
          action: "putaway_confirmed",
          actionLabel: "Putaway confirmed",
          reference: "BNE-A01-03",
          timeZone: "Australia/Brisbane",
        }),
      ]),
    });
  });
});
