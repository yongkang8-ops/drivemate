import { NextResponse } from "next/server";
import { can } from "../../../lib/auth";
import { getRepository } from "../../../lib/repository";
import { getRequestContext } from "../../../lib/serverAuth";
import { productMasterCreateSchema } from "../../../lib/validators";

export async function POST(request: Request) {
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "admin_write")) {
    return NextResponse.json({ ok: false, message: "Product master creation requires an admin role." }, { status: 403 });
  }

  const parsed = productMasterCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await getRepository().createProductMaster(parsed.data, { actorId: authContext.userId });
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  return NextResponse.json(result, { status: 201 });
}
