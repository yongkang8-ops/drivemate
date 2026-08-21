import { NextResponse } from "next/server";
import { can } from "../../../lib/auth";
import { getRepository } from "../../../lib/repository";
import { getRequestContext } from "../../../lib/serverAuth";
import { fitmentRuleCreateSchema } from "../../../lib/validators";
import { mutationRequestAllowed } from "../../../lib/requestSecurity";

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "admin_write")) {
    return NextResponse.json({ ok: false, message: "Fitment rule creation requires an admin role." }, { status: 403 });
  }

  const parsed = fitmentRuleCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await getRepository().createFitmentRule(parsed.data, { actorId: authContext.userId });
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  return NextResponse.json(result, { status: 201 });
}
