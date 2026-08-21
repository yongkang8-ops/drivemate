import { NextResponse } from "next/server";
import { can } from "../../../../../lib/auth";
import { getRepository } from "../../../../../lib/repository";
import { getRequestContext } from "../../../../../lib/serverAuth";
import { mutationRequestAllowed } from "../../../../../lib/requestSecurity";

export async function POST(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "admin_read")) {
    return NextResponse.json({ ok: false, message: "Trade account approval requires an admin role." }, { status: 403 });
  }

  const { applicationId } = await context.params;
  const result = await getRepository().approveTradeAccountApplication(applicationId, { actorId: authContext.userId });
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  return NextResponse.json(result);
}
