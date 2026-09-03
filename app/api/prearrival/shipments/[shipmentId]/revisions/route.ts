import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../../../lib/auth";
import { mutationRequestAllowed } from "../../../../../../lib/requestSecurity";
import { getRepository } from "../../../../../../lib/repository";
import { getRequestContext } from "../../../../../../lib/serverAuth";
import { packingListFieldPath, validatePackingListDraft } from "../../../../../../lib/prearrivalDraftValidation";
import { validatePackingListRevision } from "../../../../../../lib/prearrivalShipment";

const packingListLineSchema = z.object({
  sku: z.string().trim().min(1).max(120),
  expectedQuantity: z.number().int().positive(),
  batchLot: z.string().trim().max(120).optional(),
});

const legacyPackingListSchema = z.object({
  schemaVersion: z.literal(1).optional(),
  shipmentId: z.string().trim().min(1).max(120),
  pallets: z.array(z.object({
    sourcePalletNumber: z.string().trim().min(1).max(80),
    cartons: z.array(z.object({
      sourceCartonNumber: z.string().trim().min(1).max(80),
      lines: z.array(packingListLineSchema).min(1),
    })).min(1),
  })).min(1),
});

const cartonFirstPackingListSchema = z.object({
  schemaVersion: z.literal(2),
  shipmentId: z.string().trim().min(1).max(120),
  physicalPalletCount: z.number().int().positive().nullable().optional(),
  cartons: z.array(z.object({
    sourceCartonNumber: z.string().trim().min(1).max(80),
    sourcePalletNumber: z.string().trim().max(80).nullable().optional(),
    lines: z.array(packingListLineSchema).min(1),
  })).min(1),
});

const cartonScopeBaseSchema = z.object({
  sourceCartonNumber: z.string().trim().min(1).max(80),
  sourcePalletNumber: z.string().trim().max(80).nullable().optional(),
  lines: z.array(packingListLineSchema).min(1),
});

const cartonGroupScopeSchema = cartonScopeBaseSchema.extend({
  kind: z.literal("carton_group"),
  physicalCartonCount: z.number().int().min(2),
  memberCartonNumbers: z.array(z.string().trim().min(1).max(80)).min(2),
}).superRefine((scope, context) => {
  if (scope.memberCartonNumbers.length !== scope.physicalCartonCount) {
    context.addIssue({
      code: "custom",
      path: ["memberCartonNumbers"],
      message: "Member carton count must match the physical carton count.",
    });
  }
});

const cartonScopeSchema = z.discriminatedUnion("kind", [
  cartonScopeBaseSchema.extend({
    kind: z.literal("carton"),
    physicalCartonCount: z.literal(1),
    memberCartonNumbers: z.array(z.string().trim().min(1).max(80)).length(1),
  }),
  cartonGroupScopeSchema,
]);

const cartonGroupPackingListSchema = z.object({
  schemaVersion: z.literal(3),
  shipmentId: z.string().trim().min(1).max(120),
  physicalPalletCount: z.number().int().positive().nullable().optional(),
  cartons: z.array(cartonScopeSchema).min(1),
});

const packingListSchema = z.union([
  cartonGroupPackingListSchema,
  cartonFirstPackingListSchema,
  legacyPackingListSchema,
]);

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
  if (!can(auth.role, "prearrival_manage")) {
    return NextResponse.json(
      { ok: false, message: "Pre-arrival revision management access is required." },
      { status: 403 },
    );
  }

  const parsed = packingListSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      error: {
        fieldErrors: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      },
    }, { status: 400 });
  }
  const { shipmentId } = await context.params;
  if (parsed.data.shipmentId !== shipmentId) {
    return NextResponse.json(
      { ok: false, message: "Route shipment does not match the packing-list payload." },
      { status: 400 },
    );
  }

  const draftValidation = validatePackingListDraft(parsed.data);
  if (!draftValidation.ok) {
    return NextResponse.json({
      ok: false,
      error: {
        fieldErrors: Object.entries(draftValidation.fieldErrors).map(([key, message]) => ({
          path: packingListFieldPath(key),
          message,
        })),
      },
    }, { status: 400 });
  }

  const validation = validatePackingListRevision(parsed.data);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, message: validation.message },
      { status: 400 },
    );
  }

  const result = await getRepository().createPackingListRevision(validation.revision, {
    actorId: auth.userId,
  });
  return NextResponse.json(result, { status: result.ok ? 201 : 422 });
}
