import { NextResponse } from "next/server";
import { can } from "../../../../../lib/auth";
import { getRepository } from "../../../../../lib/repository";
import { getRequestContext } from "../../../../../lib/serverAuth";
import { tradeAccountStatusUpdateSchema } from "../../../../../lib/validators";

export async function PATCH(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "admin_write")) {
    return NextResponse.json({ ok: false, message: "Trade account status updates require an admin role." }, { status: 403 });
  }

  const parsed = tradeAccountStatusUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { applicationId } = await context.params;
  const result = await getRepository().updateTradeAccountStatus(applicationId, parsed.data.status, {
    actorId: authContext.userId,
  });
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  return NextResponse.json(result);
}
