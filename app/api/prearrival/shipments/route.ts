import { NextResponse } from "next/server";
import { getRepository } from "../../../../lib/repository";
import { requestCan } from "../../../../lib/serverAuth";

export async function GET(request: Request) {
  if (!(await requestCan(request, "warehouse_receive"))) {
    return NextResponse.json(
      { ok: false, message: "Pre-arrival shipment access requires warehouse receiving access." },
      { status: 403 },
    );
  }

  const shipmentId = new URL(request.url).searchParams.get("shipmentId")?.trim();
  if (!shipmentId) {
    return NextResponse.json(await getRepository().listPrearrivalShipments());
  }

  const result = await getRepository().getPrearrivalShipment(shipmentId);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
