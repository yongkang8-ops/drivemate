import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/repository";
import { mutationRequestAllowed } from "../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../lib/serverAuth";
import { buildWarehouseReceiptScope, filterWarehouseExpectedReceipt } from "../../../../lib/warehouseLabels";
import { RECEIPT_DISCREPANCY_TYPES, prepareWarehouseReceipt } from "../../../../lib/warehouseReceiving";

const discrepancySchema = z.object({
  type: z.enum(RECEIPT_DISCREPANCY_TYPES),
  reason: z.string().trim().min(3).max(500),
}).strict();

const receiptShipmentIdSchema = process.env.DRIVEMATE_REPOSITORY === "memory"
  ? z.string().trim().min(1).max(120)
  : z.string().uuid();

const receiptSchema = z.object({
  selection: z.object({
    shipmentId: receiptShipmentIdSchema,
    cartonNumbers: z.array(z.string().trim().min(1).max(120)).min(1),
  }).strict(),
  mode: z.enum(["scan_each", "counted_quantity"]),
  scannedProductBarcodes: z.array(z.string().trim().min(1).max(240)).default([]),
  countedLines: z.array(z.object({
    productBarcode: z.string().trim().min(1).max(240),
    actualQuantity: z.number().int().nonnegative(),
    discrepancy: discrepancySchema.optional(),
  }).strict()).default([]),
  idempotencyKey: z.string().uuid(),
}).strict();

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request)) return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  const auth = await getRequestContext(request);
  if (auth.mfaRequired || !can(auth.role, "inventory_write")) {
    return NextResponse.json({ ok: false, message: "Warehouse access with the required assurance level is required." }, { status: 403 });
  }
  const parsed = receiptSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const repository = getRepository();
  const shipment = await repository.getPrearrivalShipment(parsed.data.selection.shipmentId);
  if (!shipment.ok) return NextResponse.json(shipment, { status: 404 });

  let scope;
  try {
    scope = buildWarehouseReceiptScope(
      filterWarehouseExpectedReceipt(shipment.shipment, parsed.data.selection),
      shipment.shipment.productBarcodes,
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Receipt scope could not be prepared." },
      { status: 422 },
    );
  }

  const prepared = parsed.data.mode === "scan_each"
    ? prepareWarehouseReceipt({
        expectedScope: scope,
        mode: "scan_each",
        scannedProductBarcodes: parsed.data.scannedProductBarcodes,
      })
    : prepareWarehouseReceipt({
        expectedScope: scope,
        mode: "counted_quantity",
        scannedProductBarcodes: parsed.data.scannedProductBarcodes,
        countedLines: parsed.data.countedLines,
      });
  if (!prepared.ok) return NextResponse.json(prepared, { status: 422 });

  const printGate = await repository.checkWarehouseReceiptPrintGate(scope);
  if (!printGate.ok) return NextResponse.json(printGate, { status: 422 });

  const created = await repository.createWarehouseReceiptSession({
    scope,
    mode: parsed.data.mode,
    lines: prepared.lines,
    idempotencyKey: parsed.data.idempotencyKey,
  }, { actorId: auth.userId });
  if (!created.ok) return NextResponse.json(created, { status: 422 });

  const confirmed = await repository.confirmWarehouseReceipt(created.session.id, {
    actorId: auth.userId,
  });
  if (!confirmed.ok) return NextResponse.json(confirmed, { status: 422 });

  return NextResponse.json({
    ok: true,
    stagingLocation: confirmed.session.stagingLocation,
    session: confirmed.session,
  }, { status: 201 });
}
