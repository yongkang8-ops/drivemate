import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRepository } from "../lib/memoryRepository";

describe("warehouse label print audit", () => {
  const repository = new MemoryRepository();

  beforeEach(async () => {
    await repository.resetForTests();
  });

  it("atomically creates a pending print job with every immutable item snapshot", async () => {
    const job = await repository.createWarehouseLabelPrintJobWithItems(
      {
        templateId: "unit_product",
        requestedQuantity: 2,
        payloadSnapshot: { partNumber: "DM-GWM-OF-001", barcode: "DMPGWMOF001" },
        itemPayloadSnapshots: [
          { partNumber: "DM-GWM-OF-001", copy: 1 },
          { partNumber: "DM-GWM-OF-001", copy: 2 },
        ],
      },
      { actorId: "demo-warehouse-user" },
    );

    expect(job).toMatchObject({
      ok: true,
      job: {
        status: "pending",
        createdBy: "demo-warehouse-user",
        requestedQuantity: 2,
      },
      items: [
        { sequence: 1, payloadSnapshot: { partNumber: "DM-GWM-OF-001", copy: 1 } },
        { sequence: 2, payloadSnapshot: { partNumber: "DM-GWM-OF-001", copy: 2 } },
      ],
    });
    if (!job.ok) return;

    const audit = await repository.getWarehouseLabelPrintJob(job.job.id);
    expect(audit).toMatchObject({
      ok: true,
      job: { payloadSnapshot: { partNumber: "DM-GWM-OF-001", barcode: "DMPGWMOF001" } },
      items: [
        { sequence: 1, payloadSnapshot: { partNumber: "DM-GWM-OF-001", copy: 1 } },
        { sequence: 2, payloadSnapshot: { partNumber: "DM-GWM-OF-001", copy: 2 } },
      ],
    });
    expect(job.items.map((item) => item.sourceItemId)).toEqual([undefined, undefined]);
  });

  it("rejects an invalid item count without leaving a pending job", async () => {
    await expect(repository.createWarehouseLabelPrintJobWithItems({
      templateId: "bin_location",
      requestedQuantity: 2,
      payloadSnapshot: { scopeKind: "location" },
      itemPayloadSnapshots: [{ scopeKind: "location", copy: 1 }],
    })).resolves.toEqual({
      ok: false,
      message: "Label item count must equal the requested quantity.",
    });

    const created = await repository.createWarehouseLabelPrintJobWithItems({
      templateId: "bin_location",
      requestedQuantity: 1,
      payloadSnapshot: { scopeKind: "location" },
      itemPayloadSnapshots: [{ scopeKind: "location", copy: 1 }],
    });
    expect(created).toMatchObject({
      ok: true,
      job: { id: "memory-label-job-1" },
      items: [{ id: "memory-label-item-1" }],
    });
  });

  it("blocks outcomes and reprints for an incomplete legacy job", async () => {
    const incomplete = await repository.createWarehouseLabelPrintJob({
      templateId: "receiving_carton",
      requestedQuantity: 1,
      payloadSnapshot: { cartonId: "CARTON-00042", barcode: "DMCARTON:CARTON-00042" },
    });
    expect(incomplete.ok).toBe(true);
    if (!incomplete.ok) return;

    await expect(repository.recordWarehouseLabelPrintOutcome(incomplete.job.id, "printed")).resolves.toEqual({
      ok: false,
      message: "Warehouse label print job is incomplete and cannot record an outcome.",
    });
    await expect(repository.createWarehouseLabelReprint({
      reprintOfJobId: incomplete.job.id,
      requestedQuantity: 1,
      reason: "Label was damaged during receiving.",
    })).resolves.toEqual({
      ok: false,
      message: "Original warehouse label print job is incomplete and cannot be reprinted.",
    });
  });

  it("records a user-confirmed print outcome for a complete job", async () => {
    const job = await repository.createWarehouseLabelPrintJobWithItems({
      templateId: "bin_location",
      requestedQuantity: 1,
      payloadSnapshot: { locationCode: "BNE-A01-03", barcode: "DMLOC:BNE-A01-03" },
      itemPayloadSnapshots: [{ locationCode: "BNE-A01-03", barcode: "DMLOC:BNE-A01-03" }],
    });
    expect(job.ok).toBe(true);
    if (!job.ok) return;

    await expect(repository.recordWarehouseLabelPrintOutcome(job.job.id, "printed")).resolves.toEqual({
      ok: true,
      job: expect.objectContaining({ id: job.job.id, status: "printed", printedAt: expect.any(String) }),
    });
  });

  it("persists the exact original item id when reprinting one of identical payloads", async () => {
    const original = await repository.createWarehouseLabelPrintJobWithItems({
      templateId: "unit_product",
      requestedQuantity: 2,
      payloadSnapshot: { shipmentId: "shipment-test-1", sku: "DM-GWM-OF-001" },
      itemPayloadSnapshots: [
        { sku: "DM-GWM-OF-001", barcode: "DMPGWMOF001" },
        { sku: "DM-GWM-OF-001", barcode: "DMPGWMOF001" },
      ],
    });
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    const reprint = await repository.createWarehouseLabelPrintJobWithItems({
      templateId: original.job.templateId,
      requestedQuantity: 1,
      payloadSnapshot: original.job.payloadSnapshot,
      itemPayloadSnapshots: [original.items[1].payloadSnapshot],
      reprintOfJobId: original.job.id,
      reprintReason: "Second copy was damaged.",
      reprintSourceItemIds: [original.items[1].id],
    });
    expect(reprint).toMatchObject({
      ok: true,
      job: { reprintOfJobId: original.job.id, requestedQuantity: 1 },
      items: [{ sourceItemId: original.items[1].id }],
    });
    if (!reprint.ok) return;

    const audit = await repository.getWarehouseLabelPrintJob(reprint.job.id);
    expect(audit).toMatchObject({
      ok: true,
      items: [{
        sourceItemId: original.items[1].id,
        payloadSnapshot: { sku: "DM-GWM-OF-001", barcode: "DMPGWMOF001" },
      }],
    });
  });

  it("keeps the atomic label RPCs executable by service_role after public access is revoked", () => {
    const createSignature = "public.dm_create_warehouse_label_print_job_with_items( text, jsonb, integer, jsonb, uuid, uuid, text, uuid[] )";
    const outcomeSignature = "public.dm_record_warehouse_label_print_outcome(uuid, text)";

    for (const filePath of [
      join(process.cwd(), "supabase", "migrations", "20260903_v18_atomic_warehouse_label_jobs.sql"),
      join(process.cwd(), "supabase", "schema.sql"),
    ]) {
      const sql = readFileSync(filePath, "utf8").replace(/\s+/g, " ");
      expect(sql).toContain(`revoke all on function ${createSignature} from public;`);
      expect(sql).toContain(`revoke all on function ${outcomeSignature} from public;`);
      expect(sql).toContain(`grant execute on function ${createSignature} to service_role;`);
      expect(sql).toContain(`grant execute on function ${outcomeSignature} to service_role;`);
    }
  });
});
