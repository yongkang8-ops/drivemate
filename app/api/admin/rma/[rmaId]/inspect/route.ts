import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../../../lib/auth";
import { mutationRequestAllowed } from "../../../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../../../lib/serverAuth";
import { createServiceSupabaseClient } from "../../../../../../lib/supabaseClient";
const schema = z.object({
  outcome: z.enum([
    "quality_confirmed",
    "no_fault_found",
    "customer_fitment_error",
    "carrier_damage",
  ]),
  creditAmountCents: z.number().int().nonnegative().default(0),
  notes: z.string().trim().max(3000).optional(),
  idempotencyKey: z.string().trim().min(8).max(120),
});
export async function POST(
  request: Request,
  context: { params: Promise<{ rmaId: string }> },
) {
  if (!mutationRequestAllowed(request))
    return NextResponse.json(
      { ok: false, message: "Request security validation failed." },
      { status: 403 },
    );
  const auth = await getRequestContext(request);
  if (auth.mfaRequired || !can(auth.role, "admin_write"))
    return NextResponse.json(
      {
        ok: false,
        message: "Admin access with the required assurance level is required.",
      },
      { status: 403 },
    );
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 },
    );
  const { rmaId } = await context.params;
  const { data, error } = await createServiceSupabaseClient().rpc(
    "dm_inspect_rma",
    {
      p_rma_id: rmaId,
      p_outcome: parsed.data.outcome,
      p_credit_amount_cents: parsed.data.creditAmountCents,
      p_notes: parsed.data.notes ?? null,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_actor_id: auth.userId ?? null,
    },
  );
  if (error)
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 422 },
    );
  return NextResponse.json({ ok: true, rmaId: data });
}
