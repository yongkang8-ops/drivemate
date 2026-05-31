import { NextResponse } from "next/server";
import { can } from "../../../../../lib/auth";
import { getRepository } from "../../../../../lib/repository";
import { getRequestContext } from "../../../../../lib/serverAuth";

export async function POST(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "admin_write")) {
    return NextResponse.json({ ok: false, message: "Trade account login provisioning requires an admin role." }, { status: 403 });
  }

  const { applicationId } = await context.params;
  const result = await getRepository().provisionTradeAccountLogin(applicationId, { actorId: authContext.userId });
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  return NextResponse.json(result);
}
