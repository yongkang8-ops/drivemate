import { NextResponse } from "next/server";
import { can } from "../../../lib/auth";
import { getRepository } from "../../../lib/repository";
import { getRequestContext } from "../../../lib/serverAuth";
import { inventoryMovementSchema } from "../../../lib/validators";
import { mutationRequestAllowed } from "../../../lib/requestSecurity";

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json(
      { ok: false, message: "Request security validation failed." },
      { status: 403 },
    );
  }
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "inventory_write")) {
    return NextResponse.json(
      { ok: false, message: "Inventory movements require a Partner role." },
      { status: 403 },
    );
  }

  const parsed = inventoryMovementSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (process.env.DRIVEMATE_REPOSITORY === "supabase") {
    const dedicatedWorkflow = {
      inbound:
        "Purchase stock must be received against a shipment through /api/warehouse/receipts.",
      dispatch:
        "Sales stock must be dispatched against an order through /api/orders/:id/dispatch.",
      return: "Customer returns must be received through the RMA workflow.",
    } as const;
    const message =
      dedicatedWorkflow[parsed.data.type as keyof typeof dedicatedWorkflow];
    if (message)
      return NextResponse.json({ ok: false, message }, { status: 422 });
    if (!parsed.data.idempotencyKey) {
      return NextResponse.json(
        { ok: false, message: "Idempotency key is required." },
        { status: 400 },
      );
    }
  }

  const result = await getRepository().applyInventoryMovement(parsed.data, {
    actorId: authContext.userId,
  });
  if (!result.ok) return NextResponse.json(result, { status: 422 });

  return NextResponse.json(result);
}
