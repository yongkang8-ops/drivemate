import { NextResponse } from "next/server";
import { getRepository } from "../../../lib/repository";
import { can } from "../../../lib/auth";
import { getRequestContext } from "../../../lib/serverAuth";
import { createOrderSchema } from "../../../lib/validators";

export async function POST(request: Request) {
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "create_order")) {
    return NextResponse.json({ ok: false, message: "Order submission requires a trade role." }, { status: 403 });
  }

  const parsed = createOrderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (authContext.role === "trade" && !authContext.tradeAccountId) {
    return NextResponse.json({ ok: false, message: "Trade account profile is required." }, { status: 403 });
  }

  if (authContext.role !== "trade" && !parsed.data.tradeAccountId) {
    return NextResponse.json({ ok: false, message: "Trade account is required for staff-created orders." }, { status: 400 });
  }

  const orderInput =
    authContext.role === "trade"
      ? { ...parsed.data, tradeAccountId: authContext.tradeAccountId as string }
      : { ...parsed.data, tradeAccountId: parsed.data.tradeAccountId as string };

  const result = await getRepository().submitOrder(orderInput, { actorId: authContext.userId });
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  return NextResponse.json(result);
}
