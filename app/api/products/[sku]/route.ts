import { NextResponse } from "next/server";
import { can } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/repository";
import { getRequestContext } from "../../../../lib/serverAuth";
import { productMasterUpdateSchema } from "../../../../lib/validators";
import { mutationRequestAllowed } from "../../../../lib/requestSecurity";

export async function PATCH(request: Request, context: { params: Promise<{ sku: string }> }) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "admin_write")) {
    return NextResponse.json({ ok: false, message: "Product master updates require an admin role." }, { status: 403 });
  }

  const { sku } = await context.params;
  const parsed = productMasterUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await getRepository().updateProductMaster(
    {
      sku: decodeURIComponent(sku),
      ...parsed.data,
    },
    { actorId: authContext.userId },
  );

  if (!result.ok) return NextResponse.json(result, { status: 422 });
  return NextResponse.json(result);
}
