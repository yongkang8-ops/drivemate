import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRepository } from "../lib/memoryRepository";

describe("warehouse label print audit", () => {
  const repository = new MemoryRepository();

  beforeEach(async () => {
    await repository.resetForTests();
  });

  it("creates a pending print job and preserves immutable item snapshots", async () => {
    const job = await repository.createWarehouseLabelPrintJob(
      {
        templateId: "unit_product",
        requestedQuantity: 2,
        payloadSnapshot: { partNumber: "DM-GWM-OF-001", barcode: "DMPGWMOF001" },
      },
      { actorId: "demo-warehouse-user" },
    );

    expect(job.ok).toBe(true);
    if (!job.ok) return;
    expect(job.job.status).toBe("pending");
    expect(job.job.createdBy).toBe("demo-warehouse-user");

    const itemPayload = { partNumber: "DM-GWM-OF-001", copy: 1 };
    const items = await repository.appendWarehouseLabelPrintItems(job.job.id, [itemPayload]);
    expect(items.ok).toBe(true);
    if (!items.ok) return;
    itemPayload.partNumber = "MUTATED";

    const audit = await repository.getWarehouseLabelPrintJob(job.job.id);
    expect(audit).toEqual({
      ok: true,
      job: expect.objectContaining({
        id: job.job.id,
        payloadSnapshot: { partNumber: "DM-GWM-OF-001", barcode: "DMPGWMOF001" },
      }),
      items: [
        expect.objectContaining({
          sequence: 1,
          payloadSnapshot: { partNumber: "DM-GWM-OF-001", copy: 1 },
        }),
      ],
    });
  });

  it("records a user-confirmed print outcome", async () => {
    const job = await repository.createWarehouseLabelPrintJob({
      templateId: "bin_location",
      requestedQuantity: 1,
      payloadSnapshot: { locationCode: "BNE-A01-03", barcode: "DMLOC:BNE-A01-03" },
    });
    expect(job.ok).toBe(true);
    if (!job.ok) return;

    const outcome = await repository.recordWarehouseLabelPrintOutcome(job.job.id, "printed");

    expect(outcome).toEqual({
      ok: true,
      job: expect.objectContaining({ id: job.job.id, status: "printed", printedAt: expect.any(String) }),
    });
  });

  it("requires a reason for a reprint and links the new job to the original", async () => {
    const original = await repository.createWarehouseLabelPrintJob({
      templateId: "receiving_carton",
      requestedQuantity: 1,
      payloadSnapshot: { cartonId: "CARTON-00042", barcode: "DMCARTON:CARTON-00042" },
    });
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    await expect(
      repository.createWarehouseLabelReprint({
        reprintOfJobId: original.job.id,
        requestedQuantity: 1,
      }),
    ).resolves.toEqual({ ok: false, message: "A reprint reason is required." });

    const reprint = await repository.createWarehouseLabelReprint({
      reprintOfJobId: original.job.id,
      requestedQuantity: 1,
      reason: "Label was damaged during receiving.",
    });

    expect(reprint).toEqual({
      ok: true,
      job: expect.objectContaining({
        templateId: "receiving_carton",
        reprintOfJobId: original.job.id,
        reprintReason: "Label was damaged during receiving.",
      }),
    });
  });
});
