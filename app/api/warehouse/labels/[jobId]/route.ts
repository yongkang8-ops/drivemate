import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../../lib/auth";
import { getRepository } from "../../../../../lib/repository";
import { mutationRequestAllowed } from "../../../../../lib/requestSecurity";
import { getRequestContext, requestCan } from "../../../../../lib/serverAuth";

const actionSchema = z.object({
  action: z.enum(["outcome", "reprint"]),
  outcome: z.enum(["printed", "cancelled"]).optional(),
  reason: z.string().trim().min(3).max(500).optional(),
  requestedQuantity: z.number().int().positive().optional(),
  itemIds: z.array(z.string().trim().min(1).max(240)).min(1).optional(),
}).strict().superRefine((value, context) => {
  if (value.itemIds && new Set(value.itemIds).size !== value.itemIds.length) {
    context.addIssue({
      code: "custom",
      path: ["itemIds"],
      message: "Reprint item ids must be unique.",
    });
  }
});

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!(await requestCan(request, "warehouse_label_print"))) {
    return NextResponse.json(
      { ok: false, message: "Warehouse label audit requires warehouse label access." },
      { status: 403 },
    );
  }
  const { jobId } = await context.params;
  const result = await getRepository().getWarehouseLabelPrintJob(jobId);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const auth = await getRequestContext(request);
  if (!can(auth.role, "warehouse_label_print")) {
    return NextResponse.json(
      { ok: false, message: "Warehouse label actions require warehouse label access." },
      { status: 403 },
    );
  }
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }
  const { jobId } = await context.params;
  const repository = getRepository();

  if (parsed.data.action === "outcome") {
    if (!parsed.data.outcome) {
      return NextResponse.json({ ok: false, message: "Print outcome is required." }, { status: 400 });
    }
    const result = await repository.recordWarehouseLabelPrintOutcome(jobId, parsed.data.outcome);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  }

  if (!parsed.data.reason || (!parsed.data.itemIds && !parsed.data.requestedQuantity)) {
    return NextResponse.json(
      { ok: false, message: "A reprint reason and either item ids or requested quantity are required." },
      { status: 400 },
    );
  }
  const original = await repository.getWarehouseLabelPrintJob(jobId);
  if (!original.ok) return NextResponse.json(original, { status: 404 });
  if (original.items.length !== original.job.requestedQuantity) {
    return NextResponse.json(
      { ok: false, message: "Original warehouse label print job is incomplete and cannot be reprinted." },
      { status: 422 },
    );
  }
  let selectedItems;
  if (parsed.data.itemIds) {
    const itemsById = new Map(original.items.map((item) => [item.id, item]));
    const unknownItemId = parsed.data.itemIds.find((itemId) => !itemsById.has(itemId));
    if (unknownItemId) {
      return NextResponse.json(
        { ok: false, message: `Reprint item ${unknownItemId} does not belong to the original audited label job.` },
        { status: 422 },
      );
    }
    selectedItems = parsed.data.itemIds.map((itemId) => itemsById.get(itemId)!);
  } else {
    const requestedQuantity = parsed.data.requestedQuantity;
    if (!requestedQuantity) {
      return NextResponse.json(
        { ok: false, message: "A requested reprint quantity is required when item ids are not supplied." },
        { status: 400 },
      );
    }
    if (requestedQuantity > original.items.length) {
      return NextResponse.json(
        { ok: false, message: "Requested reprint quantity exceeds the original audited label range." },
        { status: 422 },
      );
    }
    selectedItems = original.items.slice(0, requestedQuantity);
  }

  if (!selectedItems.length) {
    return NextResponse.json(
      { ok: false, message: "At least one original label item is required for a reprint." },
      { status: 422 },
    );
  }

  const reprint = await repository.createWarehouseLabelPrintJobWithItems({
    templateId: original.job.templateId,
    payloadSnapshot: original.job.payloadSnapshot,
    requestedQuantity: selectedItems.length,
    itemPayloadSnapshots: selectedItems.map((item) => item.payloadSnapshot),
    reprintOfJobId: jobId,
    reprintReason: parsed.data.reason,
    reprintSourceItemIds: selectedItems.map((item) => item.id),
  }, { actorId: auth.userId });
  if (!reprint.ok) return NextResponse.json(reprint, { status: 422 });

  return NextResponse.json({ ok: true, job: reprint.job, items: reprint.items }, { status: 201 });
}
