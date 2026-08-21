import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../lib/auth";
import { mutationRequestAllowed } from "../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../lib/serverAuth";
import { createServiceSupabaseClient } from "../../../../lib/supabaseClient";

const receiptSchema = z.object({
  shipmentId: z.string().uuid(),
  receiptNumber: z.string().trim().min(1).max(80),
  locationId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(120),
  lines: z.array(z.object({
    sku: z.string().trim().min(1),
    receivedQuantity: z.number().int().positive(),
    damagedQuantity: z.number().int().nonnegative().default(0),
    evidence: z.array(z.record(z.string(), z.unknown())).default([]),
  })).min(1),
});

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request)) return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  const auth = await getRequestContext(request);
  if (auth.mfaRequired || !can(auth.role, "inventory_write")) {
    return NextResponse.json({ ok: false, message: "Warehouse access with the required assurance level is required." }, { status: 403 });
  }
  const parsed = receiptSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  const { data, error } = await createServiceSupabaseClient().rpc("dm_receive_goods", {
    p_shipment_id: parsed.data.shipmentId,
    p_receipt_number: parsed.data.receiptNumber,
    p_lines: parsed.data.lines,
    p_location_id: parsed.data.locationId,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_actor_id: auth.userId ?? null,
  });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 422 });
  return NextResponse.json({ ok: true, goodsReceiptId: data }, { status: 201 });
}
