import { NextResponse } from "next/server";
import { can } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/repository";
import { getRequestContext } from "../../../../lib/serverAuth";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "trade_read")) {
    return NextResponse.json({ ok: false, message: "Account document access requires a trade role." }, { status: 403 });
  }

  if (authContext.role === "trade" && !authContext.tradeAccountId) {
    return NextResponse.json({ ok: false, message: "Trade account profile is required." }, { status: 403 });
  }

  const { documentId } = await context.params;
  const result = await getRepository().getAccountDocumentAccess(
    documentId,
    authContext.role === "trade" ? authContext.tradeAccountId : undefined,
  );

  if (!result.ok) return NextResponse.json(result, { status: 404 });
  return NextResponse.json(result);
}
