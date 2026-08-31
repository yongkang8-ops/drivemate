import { NextResponse } from "next/server";
import { can } from "../../../../../lib/auth";
import { sensitiveOperationAccessError } from "../../../../../lib/apiAuthResponses";
import { getRepository } from "../../../../../lib/repository";
import { getRequestContext } from "../../../../../lib/serverAuth";
import { tradeAccountStatusUpdateSchema } from "../../../../../lib/validators";
import { mutationRequestAllowed } from "../../../../../lib/requestSecurity";

export async function PATCH(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const authContext = await getRequestContext(request);
  const accessError = sensitiveOperationAccessError(authContext, can(authContext.role, "admin_write"), "Trade account status updates require an admin role.");
  if (accessError) return accessError;

  const parsed = tradeAccountStatusUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { applicationId } = await context.params;
  const result = await getRepository().updateTradeAccountStatus(applicationId, parsed.data.status, {
    actorId: authContext.userId,
  });
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  return NextResponse.json(result);
}
