import type { DrivemateRepository, PrearrivalShipment } from "./repository";
import { buildWarehouseReceiptScope, filterWarehouseExpectedReceipt } from "./warehouseLabels";

export type WarehouseInboundScopeSelection = {
  shipmentId: string;
  palletNumbers?: string[];
  cartonNumbers?: string[];
};

export type ResolvedWarehouseInboundScope =
  | {
      ok: true;
      shipment: PrearrivalShipment;
      scope: ReturnType<typeof buildWarehouseReceiptScope>;
    }
  | { ok: false; message: string };

export async function resolveWarehouseInboundScope(
  repository: DrivemateRepository,
  selection: WarehouseInboundScopeSelection,
): Promise<ResolvedWarehouseInboundScope> {
  const shipment = await repository.getPrearrivalShipment(selection.shipmentId);
  if (!shipment.ok) return shipment;

  try {
    const receipt = filterWarehouseExpectedReceipt(shipment.shipment, selection);
    return {
      ok: true,
      shipment: shipment.shipment,
      scope: buildWarehouseReceiptScope(receipt, shipment.shipment.productBarcodes),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Warehouse inbound scope could not be prepared.",
    };
  }
}
