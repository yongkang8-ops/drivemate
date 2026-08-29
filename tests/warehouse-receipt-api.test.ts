import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as submitLabelJob } from "../app/api/warehouse/labels/route";
import { POST as submitReceipt } from "../app/api/warehouse/receipts/route";
import { MemoryRepository } from "../lib/memoryRepository";

const shipmentId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "22222222-2222-4222-8222-222222222222";

class ReceiptApiRepository extends MemoryRepository {
  override async getWarehouseExpectedReceipt(selection: {
    shipmentId: string;
    palletNumbers?: string[];
    cartonNumbers?: string[];
    skus?: string[];
  }) {
    const result = await super.getWarehouseExpectedReceipt({
      ...selection,
      shipmentId: "shipment-test-1",
    });
    if (!result.ok) return result;
    return {
      ok: true as const,
      receipt: { ...result.receipt, shipmentId: selection.shipmentId },
    };
  }

  override async getPrearrivalShipment(requestedShipmentId: string) {
    const result = await super.getPrearrivalShipment("shipment-test-1");
    if (!result.ok) return result;
    return {
      ok: true as const,
      shipment: { ...result.shipment, shipmentId: requestedShipmentId },
    };
  }
}

let repository: ReceiptApiRepository;

beforeEach(async () => {
  vi.stubEnv("DRIVEMATE_REPOSITORY", "memory");
  vi.stubEnv("DRIVEMATE_ENABLE_DEMO_AUTH", "true");
  repository = new ReceiptApiRepository();
  await repository.resetForTests();
  globalThis.__drivemateRepository = repository;
});

afterEach(() => {
  globalThis.__drivemateRepository = undefined;
  vi.unstubAllEnvs();
});

function receiptRequest(body: Record<string, unknown>) {
  return new Request("https://drivemateparts.com.au/api/warehouse/receipts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-drivemate-role": "partner",
    },
    body: JSON.stringify(body),
  });
}

function labelRequest(body: Record<string, unknown>) {
  return new Request("https://drivemateparts.com.au/api/warehouse/labels", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-drivemate-role": "partner",
    },
    body: JSON.stringify(body),
  });
}

const validPayload = {
  selection: { shipmentId, cartonNumbers: ["C001"] },
  mode: "counted_quantity",
  scannedProductBarcodes: ["DMPGWMOF001", "DMPGWMAF002"],
  countedLines: [
    { productBarcode: "DMPGWMOF001", actualQuantity: 12 },
    { productBarcode: "DMPGWMAF002", actualQuantity: 6 },
  ],
  idempotencyKey,
};

describe("warehouse receipt API", () => {
  it("blocks a receipt before any Unit Product labels for the selected carton are confirmed printed", async () => {
    const response = await submitReceipt(receiptRequest(validPayload));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("Unit Product labels"),
    });
  });

  it("rejects a caller-supplied location and confirms the receipt only after the matching labels are printed", async () => {
    const printResponse = await submitLabelJob(labelRequest({
      selection: validPayload.selection,
      templateId: "unit_product",
    }));
    expect(printResponse.status).toBe(201);
    const printJob = await printResponse.json();
    expect(printJob).toMatchObject({
      ok: true,
      job: { templateId: "unit_product", requestedQuantity: 18 },
      items: Array.from({ length: 18 }, (_, index) => expect.objectContaining({ sequence: index + 1 })),
    });
    const outcome = await repository.recordWarehouseLabelPrintOutcome(printJob.job.id, "printed");
    expect(outcome).toMatchObject({ ok: true, job: { status: "printed" } });

    const before = await repository.getAdminState();

    const rejected = await submitReceipt(receiptRequest({
      ...validPayload,
      locationId: "33333333-3333-4333-8333-333333333333",
    }));
    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toMatchObject({
      ok: false,
      error: {
        formErrors: expect.arrayContaining([expect.stringContaining("locationId")]),
      },
    });

    const confirmed = await submitReceipt(receiptRequest(validPayload));
    expect(confirmed.status).toBe(201);
    const confirmedBody = await confirmed.json();
    expect(confirmedBody).toMatchObject({
      ok: true,
      stagingLocation: "BNE-RECEIVING-STAGING",
      session: expect.objectContaining({
        shipmentId,
        status: "confirmed",
        mode: "counted_quantity",
      }),
    });

    const after = await repository.getAdminState();
    for (const expectedLine of validPayload.countedLines) {
      const beforeRow = before.catalogue.find((row) => row.barcode === expectedLine.productBarcode);
      const afterRow = after.catalogue.find((row) => row.barcode === expectedLine.productBarcode);
      expect(beforeRow).toBeTruthy();
      expect(afterRow).toMatchObject({
        onHand: (beforeRow?.onHand ?? 0) + expectedLine.actualQuantity,
        quarantine: (beforeRow?.quarantine ?? 0) + expectedLine.actualQuantity,
        available: beforeRow?.available,
      });
    }

    const replay = await submitReceipt(receiptRequest(validPayload));
    expect(replay.status).toBe(201);
    await expect(replay.json()).resolves.toMatchObject({
      session: { id: confirmedBody.session.id, status: "confirmed" },
    });
    expect((await repository.getAdminState()).stockMovements).toHaveLength(after.stockMovements.length);
  });
});
