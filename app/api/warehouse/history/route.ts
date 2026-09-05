import { NextResponse } from "next/server";
import { z } from "zod";
import type { WarehouseHistoryQuery } from "../../../../lib/repository";
import { getRepository } from "../../../../lib/repository";
import { requestCan } from "../../../../lib/serverAuth";
import { buildWarehouseHistory } from "../../../../lib/warehouseHistory";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const historyQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
  shipmentId: z.string().trim().min(1).max(120).optional(),
  palletNumber: z.string().trim().min(1).max(80).optional(),
  cartonNumber: z.string().trim().min(1).max(80).optional(),
  sourceScopes: z.array(z.string().trim().min(1).max(120)).default([]),
  sku: z.string().trim().min(1).max(120).optional(),
  actor: z.string().trim().min(1).max(120).optional(),
  action: z.enum([
    "print_confirmed",
    "print_cancelled",
    "reprint",
    "receipt_confirmed",
    "discrepancy_recorded",
    "putaway_confirmed",
  ]).optional(),
  timeZone: z.enum(["Australia/Brisbane", "Asia/Shanghai"]).default("Australia/Brisbane"),
}).strict();

export async function GET(request: Request) {
  if (!(await requestCan(request, "warehouse_history_read"))) {
    return NextResponse.json({ ok: false, message: "Warehouse history access is required." }, { status: 403 });
  }
  const params = new URL(request.url).searchParams;
  const parsed = historyQuerySchema.safeParse({
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    shipmentId: params.get("shipmentId") ?? undefined,
    palletNumber: params.get("palletNumber") ?? undefined,
    cartonNumber: params.get("cartonNumber") ?? undefined,
    sourceScopes: params.getAll("sourceScope"),
    sku: params.get("sku") ?? undefined,
    actor: params.get("actor") ?? undefined,
    action: params.get("action") ?? undefined,
    timeZone: params.get("timeZone") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to) {
    return NextResponse.json({ ok: false, message: "Date from must be before or equal to date to." }, { status: 400 });
  }

  const { timeZone, sourceScopes, ...query } = parsed.data;
  if (sourceScopes.length && (!query.shipmentId || (query.cartonNumber && !sourceScopes.includes(query.cartonNumber)))) {
    return NextResponse.json({ ok: false, message: "Choose a source scope within the selected shipment context." }, { status: 400 });
  }
  const history = await getRepository().listWarehouseHistory(query as WarehouseHistoryQuery);
  if (!history.ok) return NextResponse.json(history, { status: 200 });
  const events = sourceScopes.length
    ? history.events.filter(event => event.cartonNumbers?.some(scope => sourceScopes.includes(scope)))
    : history.events;
  return NextResponse.json({
    ...history,
    events,
    ...buildWarehouseHistory({ events, timeZone }),
  }, { status: 200 });
}
