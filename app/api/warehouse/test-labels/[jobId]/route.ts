import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "../../../../../lib/repository";
import { getRequestContext } from "../../../../../lib/serverAuth";
import { can } from "../../../../../lib/auth";
import { mutationRequestAllowed } from "../../../../../lib/requestSecurity";
type Context = { params: Promise<{ jobId: string }> };
const schema = z
  .object({
    outcome: z.enum(["printed", "failed", "cancelled"]),
    reason: z.string().trim().max(500).default(""),
  })
  .strict()
  .refine(
    (v) => v.outcome === "printed" || v.reason.length > 0,
    "Provide a reason",
  );
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request, context: Context) {
  const actor = await getRequestContext(request);
  if (!can(actor.role, "warehouse_label_print"))
    return reply(
      { ok: false, message: "Warehouse label permission is required." },
      403,
    );
  const { jobId } = await context.params;
  if (!z.uuid().safeParse(jobId).success)
    return reply({ ok: false, message: "Invalid test task ID." }, 400);
  try {
    const job = await getRepository().testPrint.get(jobId);
    return job
      ? reply({ ok: true, job })
      : reply({ ok: false, message: "Test task not found." }, 404);
  } catch {
    return reply({ ok: false, message: "Test task could not be loaded." }, 503);
  }
}
export async function POST(request: Request, context: Context) {
  if (!mutationRequestAllowed(request))
    return reply(
      { ok: false, message: "Request security validation failed." },
      403,
    );
  const actor = await getRequestContext(request);
  if (!actor.userId || !can(actor.role, "warehouse_label_print"))
    return reply(
      { ok: false, message: "Warehouse label permission is required." },
      403,
    );
  const { jobId } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(jobId).success)
    return reply(
      {
        ok: false,
        message:
          "Choose a test result and provide a reason for failure or cancellation.",
      },
      400,
    );
  try {
    const result = await getRepository().testPrint.recordOutcome(
      jobId,
      parsed.data.outcome,
      parsed.data.reason,
      actor.userId,
    );
    return reply(
      result,
      result.ok ? 200 : result.code === "not_found" ? 404 : 409,
    );
  } catch {
    return reply(
      {
        ok: false,
        message:
          "Test result could not be confirmed. Reload the task before retrying.",
      },
      503,
    );
  }
}
