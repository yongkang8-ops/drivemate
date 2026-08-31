import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../../lib/auth";
import { sensitiveOperationAccessError } from "../../../../../lib/apiAuthResponses";
import { getRepository, type InventoryLocation } from "../../../../../lib/repository";
import { mutationRequestAllowed } from "../../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../../lib/serverAuth";

const patchLocationSchema = z.object({
  physicalDescription: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict().refine(
  (value) => "physicalDescription" in value || "notes" in value,
  { message: "Physical description or notes are required." },
);

function savedLocationMaster(location: InventoryLocation) {
  return {
    id: location.id,
    locationCode: location.locationCode,
    barcode: location.barcode,
    status: location.status,
    isPutawayDestination: location.isPutawayDestination,
    physicalDescription: location.physicalDescription ?? null,
    notes: location.notes ?? null,
    createdAt: location.createdAt,
    createdBy: location.createdBy,
    updatedAt: location.updatedAt,
    updatedBy: location.updatedBy,
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ locationId: string }> },
) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const auth = await getRequestContext(request);
  const accessError = sensitiveOperationAccessError(auth, can(auth.role, "location_manage"), "Inventory location management access is required.");
  if (accessError) return accessError;
  const parsed = patchLocationSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const { locationId } = await context.params;
  if (!locationId.trim()) {
    return NextResponse.json({ ok: false, message: "Inventory location id is required." }, { status: 400 });
  }
  const updated = await getRepository().updateInventoryLocationNotes(
    { id: locationId, ...parsed.data },
    { actorId: auth.userId },
  );
  return NextResponse.json(
    updated.ok ? { ok: true, location: savedLocationMaster(updated.location) } : updated,
    { status: updated.ok ? 200 : 422 },
  );
}
