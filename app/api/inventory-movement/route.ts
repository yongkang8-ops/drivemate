import { NextResponse } from "next/server";
import { can } from "../../../lib/auth";
import { getRepository } from "../../../lib/repository";
import { getRequestContext } from "../../../lib/serverAuth";
import { inventoryMovementSchema } from "../../../lib/validators";
import { mutationRequestAllowed } from "../../../lib/requestSecurity";

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "inventory_write")) {
    return NextResponse.json({ ok: false, message: "Inventory movements require a warehouse role." }, { status: 403 });
  }

  const parsed = inventoryMovementSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.type === "inbound" && process.env.DRIVEMATE_REPOSITORY === "supabase") {
    return NextResponse.json({ ok: false, message: "Purchase stock must be received against a shipment through /api/warehouse/receipts." }, { status: 422 });
  }

  const result = await getRepository().applyInventoryMovement(parsed.data, { actorId: authContext.userId });
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  return NextResponse.json(result);
}
