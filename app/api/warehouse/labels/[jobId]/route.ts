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
}).strict();

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!(await requestCan(request, "warehouse_read"))) {
    return NextResponse.json(
      { ok: false, message: "Warehouse label audit requires Partner access." },
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
  if (auth.mfaRequired || !can(auth.role, "inventory_write")) {
    return NextResponse.json(
      { ok: false, message: "Warehouse label actions require Partner access with the required assurance level." },
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

  if (!parsed.data.reason || !parsed.data.requestedQuantity) {
    return NextResponse.json(
      { ok: false, message: "A reprint reason and requested quantity are required." },
      { status: 400 },
    );
  }
  const original = await repository.getWarehouseLabelPrintJob(jobId);
  if (!original.ok) return NextResponse.json(original, { status: 404 });
  if (parsed.data.requestedQuantity > original.items.length) {
    return NextResponse.json(
      { ok: false, message: "Requested reprint quantity exceeds the original audited label range." },
      { status: 422 },
    );
  }
  const reprint = await repository.createWarehouseLabelReprint({
    reprintOfJobId: jobId,
    requestedQuantity: parsed.data.requestedQuantity,
    reason: parsed.data.reason,
  }, { actorId: auth.userId });
  if (!reprint.ok) return NextResponse.json(reprint, { status: 422 });

  const items = await repository.appendWarehouseLabelPrintItems(
    reprint.job.id,
    original.items.slice(0, parsed.data.requestedQuantity).map((item) => item.payloadSnapshot),
  );
  if (!items.ok) return NextResponse.json(items, { status: 422 });
  return NextResponse.json({ ok: true, job: reprint.job, items: items.items }, { status: 201 });
}
