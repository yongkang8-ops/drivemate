import { NextResponse } from "next/server";
import { can } from "../../../lib/auth";
import { getRepository } from "../../../lib/repository";
import { getRequestContext } from "../../../lib/serverAuth";
import { inventoryMovementSchema } from "../../../lib/validators";

export async function POST(request: Request) {
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "inventory_write")) {
    return NextResponse.json({ ok: false, message: "Inventory movements require a warehouse role." }, { status: 403 });
  }

  const parsed = inventoryMovementSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await getRepository().applyInventoryMovement(parsed.data, { actorId: authContext.userId });
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  return NextResponse.json(result);
}
