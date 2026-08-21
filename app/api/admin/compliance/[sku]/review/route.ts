import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../../../lib/auth";
import { mutationRequestAllowed } from "../../../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../../../lib/serverAuth";
import { createServiceSupabaseClient } from "../../../../../../lib/supabaseClient";

const reviewSchema = z.object({
  reviewType: z.enum(["china_docs", "australia_acceptance", "fitment"]),
  outcome: z.enum(["pending", "approved", "rejected", "more_information"]),
  evidence: z.array(z.record(z.string(), z.unknown())).default([]),
  notes: z.string().trim().max(4000).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ sku: string }> }) {
  if (!mutationRequestAllowed(request)) return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  const auth = await getRequestContext(request);
  if (auth.mfaRequired || !can(auth.role, "admin_write")) {
    return NextResponse.json({ ok: false, message: "Admin access with the required assurance level is required." }, { status: 403 });
  }
  const parsed = reviewSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  const { sku } = await context.params;
  const { data, error } = await createServiceSupabaseClient().rpc("dm_review_product_gate", {
    p_sku: sku,
    p_review_type: parsed.data.reviewType,
    p_outcome: parsed.data.outcome,
    p_evidence: parsed.data.evidence,
    p_notes: parsed.data.notes ?? null,
    p_actor_id: auth.userId ?? null,
  });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 422 });
  return NextResponse.json({ ok: true, status: data });
}
