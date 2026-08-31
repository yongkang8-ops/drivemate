import { NextResponse } from "next/server";
import { can } from "../../../../../lib/auth";
import { sensitiveOperationAccessError } from "../../../../../lib/apiAuthResponses";
import { getRepository } from "../../../../../lib/repository";
import { getRequestContext } from "../../../../../lib/serverAuth";
import { mutationRequestAllowed } from "../../../../../lib/requestSecurity";

export async function POST(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const authContext = await getRequestContext(request);
  const accessError = sensitiveOperationAccessError(authContext, can(authContext.role, "admin_write"), "Trade account login provisioning requires an admin role.");
  if (accessError) return accessError;

  const { applicationId } = await context.params;
  const result = await getRepository().provisionTradeAccountLogin(applicationId, { actorId: authContext.userId });
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  return NextResponse.json(result);
}
