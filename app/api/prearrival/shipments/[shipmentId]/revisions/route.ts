import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../../../lib/auth";
import { mutationRequestAllowed } from "../../../../../../lib/requestSecurity";
import { getRepository } from "../../../../../../lib/repository";
import { getRequestContext } from "../../../../../../lib/serverAuth";

const packingListSchema = z.object({
  shipmentId: z.string().trim().min(1).max(120),
  pallets: z.array(z.object({
    sourcePalletNumber: z.string().trim().min(1).max(80),
    cartons: z.array(z.object({
      sourceCartonNumber: z.string().trim().min(1).max(80),
      lines: z.array(z.object({
        sku: z.string().trim().min(1).max(120),
        expectedQuantity: z.number().int().positive(),
        batchLot: z.string().trim().max(120).optional(),
      })).min(1),
    })).min(1),
  })).min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ shipmentId: string }> },
) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json(
      { ok: false, message: "Request security validation failed." },
      { status: 403 },
    );
  }
  const auth = await getRequestContext(request);
  if (auth.mfaRequired || !can(auth.role, "inventory_write")) {
    return NextResponse.json(
      { ok: false, message: "Pre-arrival revisions require Partner access with the required assurance level." },
      { status: 403 },
    );
  }

  const parsed = packingListSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }
  const { shipmentId } = await context.params;
  if (parsed.data.shipmentId !== shipmentId) {
    return NextResponse.json(
      { ok: false, message: "Route shipment does not match the packing-list payload." },
      { status: 400 },
    );
  }

  const result = await getRepository().createPackingListRevision(parsed.data, {
    actorId: auth.userId,
  });
  return NextResponse.json(result, { status: result.ok ? 201 : 422 });
}
