import { NextResponse } from "next/server";
import { getRepository } from "../../../lib/repository";
import { requestCan } from "../../../lib/serverAuth";

export async function GET(request: Request) {
  if (!(await requestCan(request, "warehouse_read"))) {
    return NextResponse.json({ ok: false, message: "Warehouse state requires a warehouse role." }, { status: 403 });
  }

  const state = await getRepository().getAdminState();
  return NextResponse.json({
    inventory: state.catalogue.map((row) => ({
      sku: row.sku,
      onHand: row.onHand,
      reserved: row.reserved,
      quarantine: row.quarantine,
    })),
    pickOrders: state.orders
      .filter((order) => ["submitted", "confirmed", "picked"].includes(order.status))
      .map((order) => ({
        id: order.id,
        status: order.status,
        poNumber: order.poNumber,
        lines: order.lines,
        createdBy: order.createdBy,
      })),
    stockMovements: state.stockMovements.slice(0, 10),
  });
}
