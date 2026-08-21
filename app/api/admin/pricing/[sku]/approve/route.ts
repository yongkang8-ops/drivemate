import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../../../lib/auth";
import { mutationRequestAllowed } from "../../../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../../../lib/serverAuth";
import { createServiceSupabaseClient } from "../../../../../../lib/supabaseClient";

const pricingSchema = z.object({ unitPriceExGstCents: z.number().int().positive() });

export async function POST(request: Request, context: { params: Promise<{ sku: string }> }) {
  if (!mutationRequestAllowed(request)) return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  const auth = await getRequestContext(request);
  if (auth.mfaRequired || !can(auth.role, "admin_write")) {
    return NextResponse.json({ ok: false, message: "Admin access with the required assurance level is required." }, { status: 403 });
  }
  const parsed = pricingSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  const { sku } = await context.params;
  const { data, error } = await createServiceSupabaseClient().rpc("dm_approve_trade_price", {
    p_sku: sku,
    p_unit_price_ex_gst_cents: parsed.data.unitPriceExGstCents,
    p_actor_id: auth.userId ?? null,
  });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 422 });
  return NextResponse.json({ ok: true, sku: data });
}
