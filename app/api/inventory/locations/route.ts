import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../lib/auth";
import { parseInventoryLocationCode, parseLocationCodeBatch } from "../../../../lib/inventoryLocations";
import { getRepository, type CreateInventoryLocationInput, type InventoryLocation } from "../../../../lib/repository";
import { mutationRequestAllowed } from "../../../../lib/requestSecurity";
import { getRequestContext, requestCan } from "../../../../lib/serverAuth";

const nullableTextSchema = z.string().trim().max(2000).nullable().optional();

const locationEntrySchema = z.object({
  locationCode: z.string().trim().min(1).max(120),
  physicalDescription: nullableTextSchema,
  notes: nullableTextSchema,
}).strict();

const createLocationsSchema = z.union([
  z.object({
    locationCodes: z.string().trim().min(1).max(70_000),
  }).strict(),
  z.object({
    locationCodes: z.array(z.string().trim().min(1).max(120)).min(1).max(500),
  }).strict(),
  z.object({
    locations: z.array(locationEntrySchema).min(1).max(500),
  }).strict(),
]);

const listLocationsSchema = z.object({
  search: z.string().trim().min(1).max(240).optional(),
  status: z.enum(["active", "disabled", "archived"]).optional(),
  barcode: z.string().trim().min(1).max(240).optional(),
}).strict();

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

function parsedBatchLocations(value: string) {
  const parsed = parseLocationCodeBatch(value);
  if (!parsed.ok) return parsed;
  if (parsed.locations.length > 500) {
    return { ok: false as const, message: "A maximum of 500 inventory locations can be created at once." };
  }
  return {
    ok: true as const,
    locations: parsed.locations.map((location) => ({ locationCode: location.locationCode })),
  };
}

function createInputFromRequest(input: z.infer<typeof createLocationsSchema>) {
  if ("locationCodes" in input) {
    return parsedBatchLocations(
      typeof input.locationCodes === "string" ? input.locationCodes : input.locationCodes.join("\n"),
    );
  }

  const locations: CreateInventoryLocationInput[] = [];
  for (const candidate of input.locations) {
    const parsed = parseInventoryLocationCode(candidate.locationCode);
    if (!parsed.ok) return parsed;
    locations.push({
      locationCode: parsed.locationCode,
      physicalDescription: candidate.physicalDescription,
      notes: candidate.notes,
    });
  }
  return { ok: true as const, locations };
}

function listQueryFromRequest(request: Request) {
  const params = new URL(request.url).searchParams;
  return listLocationsSchema.safeParse({
    search: params.get("search") ?? undefined,
    status: params.get("status") ?? undefined,
    barcode: params.get("barcode") ?? undefined,
  });
}

export async function GET(request: Request) {
  if (!(await requestCan(request, "warehouse_read"))) {
    return NextResponse.json({ ok: false, message: "Inventory locations require Partner access." }, { status: 403 });
  }
  const parsed = listQueryFromRequest(request);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const locations = await getRepository().listInventoryLocations(parsed.data);
  return NextResponse.json({ ok: true, locations: locations.map(savedLocationMaster) });
}

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const auth = await getRequestContext(request);
  if (auth.mfaRequired || !can(auth.role, "inventory_write")) {
    return NextResponse.json(
      { ok: false, message: "Inventory location changes require Partner access with the required assurance level." },
      { status: 403 },
    );
  }
  const parsed = createLocationsSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const input = createInputFromRequest(parsed.data);
  if (!input.ok) return NextResponse.json(input, { status: 422 });

  const created = await getRepository().createInventoryLocationBatch({ locations: input.locations }, { actorId: auth.userId });
  return NextResponse.json(
    created.ok ? { ok: true, locations: created.locations.map(savedLocationMaster) } : created,
    { status: created.ok ? 201 : 422 },
  );
}
