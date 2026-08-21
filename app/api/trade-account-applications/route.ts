import { NextResponse } from "next/server";
import { getRepository } from "../../../lib/repository";
import { tradeAccountApplicationSchema } from "../../../lib/validators";
import { mutationRequestAllowed, rateLimitAllowed, requestClientKey } from "../../../lib/requestSecurity";
import { verifyTurnstile } from "../../../lib/turnstile";

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request, { publicRequest: true })) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  if (!rateLimitAllowed(requestClientKey(request, "trade-application"), 5, 60 * 60 * 1000)) {
    return NextResponse.json({ ok: false, message: "Too many applications. Try again later." }, { status: 429 });
  }
  const payload = await request.json();
  const parsed = tradeAccountApplicationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (!(await verifyTurnstile(payload.turnstileToken, request))) {
    return NextResponse.json({ ok: false, message: "Human verification failed." }, { status: 400 });
  }

  const result = await getRepository().submitTradeAccountApplication(parsed.data);
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  return NextResponse.json(result);
}
