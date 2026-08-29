import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getLocations, POST as createLocations } from "../app/api/inventory/locations/route";
import { PATCH as patchLocation } from "../app/api/inventory/locations/[locationId]/route";
import { POST as setLocationStatus } from "../app/api/inventory/locations/[locationId]/status/route";
import { POST as createLocationPrintJob } from "../app/api/inventory/locations/print/route";
import {
  GET as getLabelJob,
  POST as updateLabelJob,
} from "../app/api/warehouse/labels/[jobId]/route";
import { MemoryRepository } from "../lib/memoryRepository";
import { buildWarehouseReceiptScope } from "../lib/warehouseLabels";

let repository: MemoryRepository;

function warehouseRequest(url: string, init: RequestInit = {}) {
  return new Request(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-drivemate-role": "partner",
      ...init.headers,
    },
  });
}

function labelJobContext(jobId: string) {
  return { params: Promise.resolve({ jobId }) };
}

function locationContext(locationId: string) {
  return { params: Promise.resolve({ locationId }) };
}

async function createPhysicalLocation(locationCode = "BNE-A01-03") {
  const response = await createLocations(warehouseRequest(
    "https://drivemateparts.com.au/api/inventory/locations",
    {
      method: "POST",
      body: JSON.stringify({ locationCodes: [locationCode] }),
    },
  ));
  expect(response.status).toBe(201);
  const body = await response.json();
  return body.locations[0] as { id: string; locationCode: string; barcode: string };
}

async function unitProductGate() {
  const selection = { shipmentId: "shipment-test-1", cartonNumbers: ["C001"] };
  const [expected, shipment] = await Promise.all([
    repository.getWarehouseExpectedReceipt(selection),
    repository.getPrearrivalShipment(selection.shipmentId),
  ]);
  if (!expected.ok || !shipment.ok) throw new Error("Test receipt scope was not available.");
  const scope = buildWarehouseReceiptScope(expected.receipt, shipment.shipment.productBarcodes);
  return repository.checkWarehouseReceiptPrintGate(scope);
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

describe("inventory locations API", () => {
  it("requires warehouse access for a saved location master list", async () => {
    const response = await getLocations(new Request(
      "https://drivemateparts.com.au/api/inventory/locations",
    ));

    expect(response.status).toBe(403);
  });

  it("lets a Partner create, search, list and edit only saved master fields", async () => {
    const createdResponse = await createLocations(warehouseRequest(
      "https://drivemateparts.com.au/api/inventory/locations",
      {
        method: "POST",
        body: JSON.stringify({
          locationCodes: "BNE-A01-03\nBNE-B02-01",
        }),
      },
    ));
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    expect(created).toMatchObject({
      ok: true,
      locations: [
        { locationCode: "BNE-A01-03", barcode: "DMLOC:BNE-A01-03", status: "active" },
        { locationCode: "BNE-B02-01", barcode: "DMLOC:BNE-B02-01", status: "active" },
      ],
    });

    const listResponse = await getLocations(new Request(
      "https://drivemateparts.com.au/api/inventory/locations?search=A01&status=active&barcode=DMLOC%3ABNE-A01-03",
      { headers: { "x-drivemate-role": "partner" } },
    ));
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({
      ok: true,
      locations: [expect.objectContaining({
        id: created.locations[0].id,
        locationCode: "BNE-A01-03",
        barcode: "DMLOC:BNE-A01-03",
        status: "active",
        isPutawayDestination: true,
        physicalDescription: null,
        notes: null,
      })],
    });

    const invalidPatch = await patchLocation(warehouseRequest(
      `https://drivemateparts.com.au/api/inventory/locations/${created.locations[0].id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ locationCode: "BNE-Z99-01" }),
      },
    ), locationContext(created.locations[0].id));
    expect(invalidPatch.status).toBe(400);

    const updatedResponse = await patchLocation(warehouseRequest(
      `https://drivemateparts.com.au/api/inventory/locations/${created.locations[0].id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          physicalDescription: "Aisle A01, shelf 03",
          notes: "Counted during setup",
        }),
      },
    ), locationContext(created.locations[0].id));
    expect(updatedResponse.status).toBe(200);
    await expect(updatedResponse.json()).resolves.toMatchObject({
      ok: true,
      location: {
        id: created.locations[0].id,
        locationCode: "BNE-A01-03",
        barcode: "DMLOC:BNE-A01-03",
        physicalDescription: "Aisle A01, shelf 03",
        notes: "Counted during setup",
      },
    });
  });

  it("preserves a batch parser error and creates no partial locations", async () => {
    const response = await createLocations(warehouseRequest(
      "https://drivemateparts.com.au/api/inventory/locations",
      {
        method: "POST",
        body: JSON.stringify({ locationCodes: "BNE-A01-03\nAISLE-A" }),
      },
    ));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "Line 2 must use a canonical BNE location code.",
    });
    await expect(repository.listInventoryLocations({ search: "A01" })).resolves.toEqual([]);
  });

  it("lets a Partner set only accepted location lifecycle statuses", async () => {
    const created = await createPhysicalLocation();

    const invalid = await setLocationStatus(warehouseRequest(
      `https://drivemateparts.com.au/api/inventory/locations/${created.id}/status`,
      { method: "POST", body: JSON.stringify({ status: "inactive" }) },
    ), locationContext(created.id));
    expect(invalid.status).toBe(400);

    const response = await setLocationStatus(warehouseRequest(
      `https://drivemateparts.com.au/api/inventory/locations/${created.id}/status`,
      { method: "POST", body: JSON.stringify({ status: "disabled" }) },
    ), locationContext(created.id));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      location: { id: created.id, status: "disabled" },
    });
  });

  it("prints only active physical destinations with immutable location item snapshots", async () => {
    const physicalLocation = await createPhysicalLocation();
    const staging = (await repository.listInventoryLocations({ barcode: "DMLOC:BNE-RECEIVING-STAGING" }))[0];
    const stateBefore = await repository.getAdminState();

    const stagingRequest = await createLocationPrintJob(warehouseRequest(
      "https://drivemateparts.com.au/api/inventory/locations/print",
      { method: "POST", body: JSON.stringify({ locationIds: [staging.id] }) },
    ));
    expect(stagingRequest.status).toBe(422);

    const response = await createLocationPrintJob(warehouseRequest(
      "https://drivemateparts.com.au/api/inventory/locations/print",
      { method: "POST", body: JSON.stringify({ locationIds: [physicalLocation.id] }) },
    ));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      job: {
        templateId: "bin_location",
        requestedQuantity: 1,
        payloadSnapshot: { scopeKind: "location", locationIds: [physicalLocation.id] },
      },
      items: [{
        sequence: 1,
        payloadSnapshot: {
          scopeKind: "location",
          locationId: physicalLocation.id,
          locationCode: "BNE-A01-03",
          barcode: "DMLOC:BNE-A01-03",
        },
      }],
    });
    expect(await repository.getAdminState()).toEqual(stateBefore);
  });

  it("writes every selected physical location label in one complete atomic job", async () => {
    const first = await createPhysicalLocation("BNE-A01-03");
    const second = await createPhysicalLocation("BNE-B02-01");

    const response = await createLocationPrintJob(warehouseRequest(
      "https://drivemateparts.com.au/api/inventory/locations/print",
      { method: "POST", body: JSON.stringify({ locationIds: [first.id, second.id] }) },
    ));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      job: { requestedQuantity: 2 },
      items: [
        { sequence: 1, payloadSnapshot: { locationId: first.id, locationCode: "BNE-A01-03" } },
        { sequence: 2, payloadSnapshot: { locationId: second.id, locationCode: "BNE-B02-01" } },
      ],
    });

    const audit = await repository.getWarehouseLabelPrintJob(body.job.id);
    expect(audit).toMatchObject({
      ok: true,
      job: { requestedQuantity: 2 },
      items: [{ sequence: 1 }, { sequence: 2 }],
    });
    if (!audit.ok) return;
    expect(audit.items.map((item) => item.sourceItemId)).toEqual([undefined, undefined]);
  });

  it("rejects generic printed and reprint actions for an incomplete job", async () => {
    const incomplete = await repository.createWarehouseLabelPrintJob({
      templateId: "bin_location",
      requestedQuantity: 1,
      payloadSnapshot: { scopeKind: "location" },
    });
    expect(incomplete.ok).toBe(true);
    if (!incomplete.ok) return;

    const printed = await updateLabelJob(warehouseRequest(
      `https://drivemateparts.com.au/api/warehouse/labels/${incomplete.job.id}`,
      { method: "POST", body: JSON.stringify({ action: "outcome", outcome: "printed" }) },
    ), labelJobContext(incomplete.job.id));
    expect(printed.status).toBe(422);

    const reprint = await updateLabelJob(warehouseRequest(
      `https://drivemateparts.com.au/api/warehouse/labels/${incomplete.job.id}`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "reprint",
          requestedQuantity: 1,
          reason: "Label was damaged before printing.",
        }),
      },
    ), labelJobContext(incomplete.job.id));
    expect(reprint.status).toBe(422);
    await expect(reprint.json()).resolves.toEqual({
      ok: false,
      message: "Original warehouse label print job is incomplete and cannot be reprinted.",
    });
  });

  it("reprints an explicitly selected location label item without widening the audited range", async () => {
    const first = await createPhysicalLocation("BNE-A01-03");
    const second = await createPhysicalLocation("BNE-B02-01");
    const originalResponse = await createLocationPrintJob(warehouseRequest(
      "https://drivemateparts.com.au/api/inventory/locations/print",
      { method: "POST", body: JSON.stringify({ locationIds: [first.id, second.id] }) },
    ));
    expect(originalResponse.status).toBe(201);
    const original = await originalResponse.json();
    const secondItem = original.items[1];

    const missingReason = await updateLabelJob(warehouseRequest(
      `https://drivemateparts.com.au/api/warehouse/labels/${original.job.id}`,
      { method: "POST", body: JSON.stringify({ action: "reprint", itemIds: [secondItem.id] }) },
    ), labelJobContext(original.job.id));
    expect(missingReason.status).toBe(400);

    const unknownItem = await updateLabelJob(warehouseRequest(
      `https://drivemateparts.com.au/api/warehouse/labels/${original.job.id}`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "reprint",
          itemIds: ["memory-label-item-unknown"],
          reason: "Label was damaged while mounting the rack.",
        }),
      },
    ), labelJobContext(original.job.id));
    expect(unknownItem.status).toBe(422);

    const duplicateItem = await updateLabelJob(warehouseRequest(
      `https://drivemateparts.com.au/api/warehouse/labels/${original.job.id}`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "reprint",
          itemIds: [secondItem.id, secondItem.id],
          reason: "Label was damaged while mounting the rack.",
        }),
      },
    ), labelJobContext(original.job.id));
    expect(duplicateItem.status).toBe(400);

    const reprintResponse = await updateLabelJob(warehouseRequest(
      `https://drivemateparts.com.au/api/warehouse/labels/${original.job.id}`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "reprint",
          itemIds: [secondItem.id],
          reason: "Label was damaged while mounting the rack.",
        }),
      },
    ), labelJobContext(original.job.id));
    expect(reprintResponse.status).toBe(201);
    const reprint = await reprintResponse.json();
    expect(reprint).toMatchObject({
      ok: true,
      job: {
        requestedQuantity: 1,
        reprintOfJobId: original.job.id,
        reprintReason: "Label was damaged while mounting the rack.",
        payloadSnapshot: original.job.payloadSnapshot,
      },
      items: [{
        sourceItemId: secondItem.id,
        payloadSnapshot: {
          scopeKind: "location",
          locationId: second.id,
          locationCode: "BNE-B02-01",
          barcode: "DMLOC:BNE-B02-01",
        },
      }],
    });
    const reprintAudit = await getLabelJob(new Request(
      `https://drivemateparts.com.au/api/warehouse/labels/${reprint.job.id}`,
      { headers: { "x-drivemate-role": "partner" } },
    ), labelJobContext(reprint.job.id));
    expect(reprintAudit.status).toBe(200);
    await expect(reprintAudit.json()).resolves.toMatchObject({
      ok: true,
      items: [{ sourceItemId: secondItem.id }],
    });

    const quantityFallback = await updateLabelJob(warehouseRequest(
      `https://drivemateparts.com.au/api/warehouse/labels/${original.job.id}`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "reprint",
          requestedQuantity: 1,
          reason: "Legacy quantity-based reprint.",
        }),
      },
    ), labelJobContext(original.job.id));
    expect(quantityFallback.status).toBe(201);
    await expect(quantityFallback.json()).resolves.toMatchObject({
      ok: true,
      job: { requestedQuantity: 1, reprintOfJobId: original.job.id },
      items: [{
        sourceItemId: original.items[0].id,
        payloadSnapshot: {
          scopeKind: "location",
          locationId: first.id,
          locationCode: "BNE-A01-03",
          barcode: "DMLOC:BNE-A01-03",
        },
      }],
    });
  });

  it("reuses label outcomes and reprints without changing the Unit Product receipt gate", async () => {
    const physicalLocation = await createPhysicalLocation();
    expect(await unitProductGate()).toMatchObject({ ok: false });

    const printedResponse = await createLocationPrintJob(warehouseRequest(
      "https://drivemateparts.com.au/api/inventory/locations/print",
      { method: "POST", body: JSON.stringify({ locationIds: [physicalLocation.id] }) },
    ));
    const printedJob = (await printedResponse.json()).job;
    const printed = await updateLabelJob(warehouseRequest(
      `https://drivemateparts.com.au/api/warehouse/labels/${printedJob.id}`,
      { method: "POST", body: JSON.stringify({ action: "outcome", outcome: "printed" }) },
    ), labelJobContext(printedJob.id));
    expect(printed.status).toBe(200);
    await expect(printed.json()).resolves.toMatchObject({ ok: true, job: { status: "printed" } });
    expect(await unitProductGate()).toMatchObject({ ok: false });

    const cancelledResponse = await createLocationPrintJob(warehouseRequest(
      "https://drivemateparts.com.au/api/inventory/locations/print",
      { method: "POST", body: JSON.stringify({ locationIds: [physicalLocation.id] }) },
    ));
    const cancelledJob = (await cancelledResponse.json()).job;
    const cancelled = await updateLabelJob(warehouseRequest(
      `https://drivemateparts.com.au/api/warehouse/labels/${cancelledJob.id}`,
      { method: "POST", body: JSON.stringify({ action: "outcome", outcome: "cancelled" }) },
    ), labelJobContext(cancelledJob.id));
    expect(cancelled.status).toBe(200);
    await expect(cancelled.json()).resolves.toMatchObject({ ok: true, job: { status: "cancelled" } });

    const missingReason = await updateLabelJob(warehouseRequest(
      `https://drivemateparts.com.au/api/warehouse/labels/${printedJob.id}`,
      { method: "POST", body: JSON.stringify({ action: "reprint", requestedQuantity: 1 }) },
    ), labelJobContext(printedJob.id));
    expect(missingReason.status).toBe(400);

    const reprintResponse = await updateLabelJob(warehouseRequest(
      `https://drivemateparts.com.au/api/warehouse/labels/${printedJob.id}`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "reprint",
          requestedQuantity: 1,
          reason: "Label damaged while mounting the rack.",
        }),
      },
    ), labelJobContext(printedJob.id));
    expect(reprintResponse.status).toBe(201);
    const reprint = await reprintResponse.json();
    expect(reprint.job).toMatchObject({
      templateId: "bin_location",
      reprintOfJobId: printedJob.id,
      payloadSnapshot: printedJob.payloadSnapshot,
    });
    expect(reprint.items).toEqual([
      expect.objectContaining({
        payloadSnapshot: {
          scopeKind: "location",
          locationId: physicalLocation.id,
          locationCode: "BNE-A01-03",
          barcode: "DMLOC:BNE-A01-03",
        },
      }),
    ]);

    const audit = await getLabelJob(new Request(
      `https://drivemateparts.com.au/api/warehouse/labels/${reprint.job.id}`,
      { headers: { "x-drivemate-role": "partner" } },
    ), labelJobContext(reprint.job.id));
    expect(audit.status).toBe(200);
    await expect(audit.json()).resolves.toMatchObject({
      ok: true,
      job: { payloadSnapshot: printedJob.payloadSnapshot },
    });
  });
});
