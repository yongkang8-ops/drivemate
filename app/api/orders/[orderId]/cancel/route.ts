import { NextResponse } from "next/server";
import { can } from "../../../../../lib/auth";
import { getRepository } from "../../../../../lib/repository";
import { getRequestContext } from "../../../../../lib/serverAuth";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "create_order") && !can(authContext.role, "admin_write")) {
    return NextResponse.json({ ok: false, message: "Order cancellation requires a trade or admin role." }, { status: 403 });
  }

  if (authContext.role === "trade" && !authContext.tradeAccountId) {
    return NextResponse.json({ ok: false, message: "Trade account profile is required." }, { status: 403 });
  }

  const { orderId } = await context.params;
  const result = await getRepository().cancelOrder(
    orderId,
    authContext.role === "trade" ? { tradeAccountId: authContext.tradeAccountId } : {},
    { actorId: authContext.userId },
  );
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  return NextResponse.json(result);
}
