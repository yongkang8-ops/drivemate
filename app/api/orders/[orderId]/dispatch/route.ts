import { NextResponse } from "next/server";
import { can } from "../../../../../lib/auth";
import { getRepository } from "../../../../../lib/repository";
import { getRequestContext } from "../../../../../lib/serverAuth";
import { dispatchOrderSchema } from "../../../../../lib/validators";
import { mutationRequestAllowed } from "../../../../../lib/requestSecurity";
import {
  getTradingGate,
  tradingDisabledPayload,
} from "../../../../../lib/tradingGate";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  if (!getTradingGate().enabled) {
    return NextResponse.json(tradingDisabledPayload(), { status: 503 });
  }
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "inventory_write")) {
    return NextResponse.json({ ok: false, message: "Order dispatch requires a warehouse role." }, { status: 403 });
  }

  const rawBody = await request.text();
  let body: unknown = {};
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: false, message: "Dispatch request body must be valid JSON." }, { status: 400 });
    }
  }

  const parsedBody = dispatchOrderSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ ok: false, error: parsedBody.error.flatten() }, { status: 400 });
  }

  const { orderId } = await context.params;
  const idempotencyKey = parsedBody.data.idempotencyKey ?? request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || parsedBody.data.deliveryChargeExGstCents === undefined || !parsedBody.data.carrier || !parsedBody.data.trackingNumber) {
    return NextResponse.json({ ok: false, message: "Idempotency-Key, delivery charge, carrier and tracking number are required." }, { status: 400 });
  }
  const result = await getRepository().dispatchOrder(orderId, { ...parsedBody.data, idempotencyKey }, { actorId: authContext.userId });
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  return NextResponse.json(result);
}
