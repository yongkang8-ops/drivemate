import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/repository";
import { mutationRequestAllowed } from "../../../../lib/requestSecurity";
import { getRequestContext, requestCan } from "../../../../lib/serverAuth";
import { prepareWarehousePutaway } from "../../../../lib/warehousePutaway";

const selectionSchema = z.object({
  shipmentId: z.string().trim().min(1).max(120),
  cartonNumbers: z.array(z.string().trim().min(1).max(120)).min(1),
}).strict();

const putawaySchema = z.object({
  selection: selectionSchema,
  productBarcode: z.string().trim().min(1).max(240),
  destinationBarcode: z.string().trim().min(1).max(240),
  quantity: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
}).strict();

function selectionFromSearchParams(request: Request) {
  const params = new URL(request.url).searchParams;
  return selectionSchema.safeParse({
    shipmentId: params.get("shipmentId") ?? "",
    cartonNumbers: params.getAll("cartonNumber"),
  });
}

export async function GET(request: Request) {
  if (!(await requestCan(request, "warehouse_read"))) {
    return NextResponse.json({ ok: false, message: "Warehouse putaway requires Partner access." }, { status: 403 });
  }
  const parsed = selectionFromSearchParams(request);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const result = await getRepository().getWarehousePutawayScope(parsed.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const auth = await getRequestContext(request);
  if (auth.mfaRequired || !can(auth.role, "inventory_write")) {
    return NextResponse.json(
      { ok: false, message: "Warehouse putaway requires Partner access with the required assurance level." },
      { status: 403 },
    );
  }
  const parsed = putawaySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const prepared = prepareWarehousePutaway(parsed.data);
  if (!prepared.ok) return NextResponse.json(prepared, { status: 422 });

  const result = await getRepository().putAwayWarehouseReceipt({
    ...parsed.data.selection,
    ...prepared,
    idempotencyKey: parsed.data.idempotencyKey,
  }, { actorId: auth.userId });
  return NextResponse.json(result, { status: result.ok ? 201 : 422 });
}
