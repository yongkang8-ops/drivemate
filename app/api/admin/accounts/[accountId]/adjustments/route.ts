import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../../../lib/auth";
import { mutationRequestAllowed } from "../../../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../../../lib/serverAuth";
import { createServiceSupabaseClient } from "../../../../../../lib/supabaseClient";

const schema = z.object({
  entryType: z.enum([
    "payment",
    "credit_adjustment",
    "debit_adjustment",
    "rebate",
  ]),
  amountCents: z.number().int().positive(),
  reference: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(2000).optional(),
  idempotencyKey: z.string().trim().min(8).max(120),
});
export async function POST(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
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
  const { accountId } = await context.params;
  const { data, error } = await createServiceSupabaseClient().rpc(
    "dm_post_account_adjustment",
    {
      p_trade_account_id: accountId,
      p_entry_type: parsed.data.entryType,
      p_amount_cents: parsed.data.amountCents,
      p_reference: parsed.data.reference,
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
  return NextResponse.json({ ok: true, ledgerEntryId: data }, { status: 201 });
}
