import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../lib/auth";
import { allocateDiscountLargestRemainder } from "../../../../lib/purchaseImport";
import { mutationRequestAllowed } from "../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../lib/serverAuth";
import { createServiceSupabaseClient } from "../../../../lib/supabaseClient";

const costs = z.object({
  domesticLogisticsMinor: z.number().int().nonnegative().default(0),
  oceanFreightMinor: z.number().int().nonnegative().default(0),
  insuranceMinor: z.number().int().nonnegative().default(0),
  dutyMinor: z.number().int().nonnegative().default(0),
  importGstMinor: z.number().int().nonnegative().default(0),
  brokerageMinor: z.number().int().nonnegative().default(0),
  portChargesMinor: z.number().int().nonnegative().default(0),
  australiaDeliveryMinor: z.number().int().nonnegative().default(0),
  otherCostsMinor: z.number().int().nonnegative().default(0),
});
const schema = z.object({
  shipmentId: z.string().uuid(),
  status: z.enum(["provisional", "final"]),
  allocationBasis: z.enum(["value", "quantity", "weight", "volume", "manual"]),
  costs,
  manualAllocations: z
    .array(
      z.object({
        purchaseOrderLineId: z.string().uuid(),
        allocatedCashMinor: z.number().int().nonnegative(),
        allocatedCogsMinor: z.number().int().nonnegative(),
        basisValue: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
  sourceEvidence: z.array(z.record(z.string(), z.unknown())).default([]),
  idempotencyKey: z.string().trim().min(8).max(120),
});
function dimensionsVolume(value: unknown) {
  const matches = String(value ?? "")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number);
  return matches && matches.length >= 3
    ? Math.max(1, Math.round(matches[0] * matches[1] * matches[2] * 1000))
    : 0;
}
function allocate(weights: number[], target: number) {
  return target === 0
    ? weights.map(() => 0)
    : allocateDiscountLargestRemainder(weights, target);
}
export async function POST(request: Request) {
  if (!mutationRequestAllowed(request))
    return NextResponse.json(
      { ok: false, message: "Request security validation failed." },
      { status: 403 },
    );
  const auth = await getRequestContext(request);
  if (auth.mfaRequired || !can(auth.role, "admin_write"))
    return NextResponse.json(
      {
        ok: false,
        message: "Admin access with the required assurance level is required.",
      },
      { status: 403 },
    );
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 },
    );
  const supabase = createServiceSupabaseClient();
  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .select(
      "id,purchase_order_id,purchase_orders(purchase_order_lines(id,quantity,cash_purchase_cost_minor,products(packaging)))",
    )
    .eq("id", parsed.data.shipmentId)
    .single();
  if (shipmentError || !shipment)
    return NextResponse.json(
      { ok: false, message: "Shipment purchase lines could not be loaded." },
      { status: 404 },
    );
  const order = Array.isArray(shipment.purchase_orders)
    ? shipment.purchase_orders[0]
    : shipment.purchase_orders;
  const lines = order?.purchase_order_lines ?? [];
  if (!lines.length)
    return NextResponse.json(
      { ok: false, message: "Shipment has no purchase lines." },
      { status: 422 },
    );
  const cashTotal = Object.values(parsed.data.costs).reduce(
    (sum, value) => sum + value,
    0,
  );
  const cogsTotal = cashTotal - parsed.data.costs.importGstMinor;
  let allocations = parsed.data.manualAllocations;
  if (parsed.data.allocationBasis !== "manual") {
    const weights = lines.map((line: any) => {
      const packaging = Array.isArray(line.products)
        ? line.products[0]?.packaging
        : line.products?.packaging;
      if (parsed.data.allocationBasis === "quantity") return line.quantity;
      if (parsed.data.allocationBasis === "weight")
        return Math.round(
          Number(packaging?.unitGrossWeightGrams ?? 0) * line.quantity,
        );
      if (parsed.data.allocationBasis === "volume")
        return dimensionsVolume(packaging?.unitDimensions) * line.quantity;
      return Number(line.cash_purchase_cost_minor);
    });
    if (weights.some((value: number) => !Number.isFinite(value) || value <= 0))
      return NextResponse.json(
        {
          ok: false,
          message: `${parsed.data.allocationBasis} allocation requires a positive basis for every purchase line.`,
        },
        { status: 422 },
      );
    const cash = allocate(weights, cashTotal);
    const cogsAllocated = allocate(weights, cogsTotal);
    allocations = lines.map((line: any, index: number) => ({
      purchaseOrderLineId: line.id,
      allocatedCashMinor: cash[index],
      allocatedCogsMinor: cogsAllocated[index],
      basisValue: weights[index],
    }));
  }
  if (!allocations?.length)
    return NextResponse.json(
      { ok: false, message: "Manual allocations are required." },
      { status: 400 },
    );
  const { data, error } = await supabase.rpc("dm_save_landed_cost", {
    p_shipment_id: parsed.data.shipmentId,
    p_status: parsed.data.status,
    p_allocation_basis: parsed.data.allocationBasis,
    p_costs: parsed.data.costs,
    p_allocations: allocations,
    p_source_evidence: parsed.data.sourceEvidence,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_actor_id: auth.userId ?? null,
  });
  if (error)
    return NextResponse.json(
      { ok: false, message: error.message },
      { status: 422 },
    );
  return NextResponse.json(
    {
      ok: true,
      landedCostId: data,
      cashTotalMinor: cashTotal,
      cogsTotalMinor: cogsTotal,
      allocationCount: allocations.length,
    },
    { status: 201 },
  );
}
