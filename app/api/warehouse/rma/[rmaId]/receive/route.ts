import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../../../lib/auth";
import { mutationRequestAllowed } from "../../../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../../../lib/serverAuth";
import { createServiceSupabaseClient } from "../../../../../../lib/supabaseClient";
const schema = z.object({
  locationId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        sku: z.string().trim().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
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
  if (auth.mfaRequired || !can(auth.role, "inventory_write"))
    return NextResponse.json(
      {
        ok: false,
        message:
          "Warehouse access with the required assurance level is required.",
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
    "dm_receive_rma",
    {
      p_rma_id: rmaId,
      p_lines: parsed.data.lines,
      p_location_id: parsed.data.locationId,
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
