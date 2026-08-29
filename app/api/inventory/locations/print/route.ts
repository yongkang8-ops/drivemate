import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../../lib/auth";
import { getRepository, type InventoryLocation } from "../../../../../lib/repository";
import { mutationRequestAllowed } from "../../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../../lib/serverAuth";

const printLocationsSchema = z.object({
  locationIds: z.array(z.string().trim().min(1).max(240)).min(1).max(500),
}).strict();

function locationItemSnapshot(location: InventoryLocation) {
  return {
    scopeKind: "location",
    locationId: location.id,
    locationCode: location.locationCode,
    barcode: location.barcode,
  };
}

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const auth = await getRequestContext(request);
  if (auth.mfaRequired || !can(auth.role, "inventory_write")) {
    return NextResponse.json(
      { ok: false, message: "Inventory location label printing requires Partner access with the required assurance level." },
      { status: 403 },
    );
  }
  const parsed = printLocationsSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const requestedLocationIds = [...new Set(parsed.data.locationIds.map((locationId) => locationId.trim()))];
  const locationsById = new Map((await getRepository().listInventoryLocations()).map((location) => [location.id, location]));
  const locations = requestedLocationIds.map((locationId) => locationsById.get(locationId));
  const unknownLocationId = requestedLocationIds.find((locationId, index) => !locations[index]);
  if (unknownLocationId) {
    return NextResponse.json(
      { ok: false, message: `Inventory location ${unknownLocationId} was not found.` },
      { status: 404 },
    );
  }
  const selectedLocations = locations as InventoryLocation[];
  const invalidLocation = selectedLocations.find(
    (location) => location.status !== "active" || !location.isPutawayDestination,
  );
  if (invalidLocation) {
    return NextResponse.json(
      { ok: false, message: "Only active physical putaway destinations can be printed as bin labels." },
      { status: 422 },
    );
  }

  const repository = getRepository();
  const created = await repository.createWarehouseLabelPrintJobWithItems({
    templateId: "bin_location",
    requestedQuantity: selectedLocations.length,
    payloadSnapshot: {
      scopeKind: "location",
      locationIds: selectedLocations.map((location) => location.id),
    },
    itemPayloadSnapshots: selectedLocations.map(locationItemSnapshot),
  }, { actorId: auth.userId });
  if (!created.ok) return NextResponse.json(created, { status: 422 });

  return NextResponse.json({ ok: true, job: created.job, items: created.items }, { status: 201 });
}
