import { NextResponse } from "next/server";
import { can } from "../../../lib/auth";
import { getRepository } from "../../../lib/repository";
import { getRequestContext } from "../../../lib/serverAuth";
import { vehicleLookupSchema } from "../../../lib/validators";

export async function POST(request: Request) {
  const context = await getRequestContext(request);
  if (!can(context.role, "vehicle_lookup")) {
    return NextResponse.json({ ok: false, message: "Vehicle lookup requires a trade account role." }, { status: 403 });
  }

  const parsed = vehicleLookupSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await getRepository().lookupVehicle(parsed.data, {
    actorId: context.userId,
    tradeAccountId: context.tradeAccountId,
  });
  return NextResponse.json(result);
}
