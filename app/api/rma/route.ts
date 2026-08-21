import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../lib/auth";
import { mutationRequestAllowed } from "../../../lib/requestSecurity";
import { getRequestContext } from "../../../lib/serverAuth";
import { createServiceSupabaseClient } from "../../../lib/supabaseClient";

const schema = z.object({
  tradeAccountId: z.string().uuid().optional(),
  salesOrderId: z.string().uuid(),
  reasonType: z.enum([
    "quality",
    "incorrect_fitment",
    "damaged_delivery",
    "other",
  ]),
  lines: z
    .array(
      z.object({
        sku: z.string().trim().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  notes: z.string().trim().max(3000).optional(),
  evidence: z.array(z.record(z.string(), z.unknown())).default([]),
  idempotencyKey: z.string().trim().min(8).max(120),
});
export async function POST(request: Request) {
  if (!mutationRequestAllowed(request))
    return NextResponse.json(
      { ok: false, message: "Request security validation failed." },
      { status: 403 },
    );
  const auth = await getRequestContext(request);
  if (!can(auth.role, "create_order") && !can(auth.role, "admin_write"))
    return NextResponse.json(
      { ok: false, message: "Trade or admin access is required." },
      { status: 403 },
    );
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 },
    );
  const tradeAccountId =
    auth.role === "trade" ? auth.tradeAccountId : parsed.data.tradeAccountId;
  if (!tradeAccountId)
    return NextResponse.json(
      { ok: false, message: "Trade account is required." },
      { status: 400 },
    );
  const { data, error } = await createServiceSupabaseClient().rpc(
    "dm_create_rma",
    {
      p_trade_account_id: tradeAccountId,
      p_sales_order_id: parsed.data.salesOrderId,
      p_reason_type: parsed.data.reasonType,
      p_lines: parsed.data.lines,
      p_notes: parsed.data.notes ?? null,
      p_evidence: parsed.data.evidence,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_actor_id: auth.userId ?? null,
    },
  );
  if (error)
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 422 },
    );
  return NextResponse.json({ ok: true, rmaId: data }, { status: 201 });
}
