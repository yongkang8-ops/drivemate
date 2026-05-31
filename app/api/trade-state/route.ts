import { NextResponse } from "next/server";
import { can } from "../../../lib/auth";
import { getRepository } from "../../../lib/repository";
import { getRequestContext } from "../../../lib/serverAuth";

export async function GET(request: Request) {
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "trade_read")) {
    return NextResponse.json({ ok: false, message: "Trade account state requires a trade role." }, { status: 403 });
  }

  if (authContext.role === "trade" && !authContext.tradeAccountId) {
    return NextResponse.json({ ok: false, message: "Trade account profile is required." }, { status: 403 });
  }

  const requestUrl = new URL(request.url);
  const tradeAccountId =
    authContext.role === "trade" ? authContext.tradeAccountId : requestUrl.searchParams.get("tradeAccountId");

  if (!tradeAccountId) {
    return NextResponse.json({ ok: false, message: "Trade account is required." }, { status: 400 });
  }

  return NextResponse.json(await getRepository().getTradeAccountState(tradeAccountId));
}
