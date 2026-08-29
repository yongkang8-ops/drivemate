import { parseWarehouseBarcode } from "./warehouseLabels";

export type WarehousePutawayDraft = {
  productBarcode: string;
  destinationBarcode: string;
  quantity: number;
};

export type PreparedWarehousePutaway =
  | {
      ok: true;
      productBarcode: string;
      destinationLocation: string;
      quantity: number;
    }
  | { ok: false; message: string };

export function prepareWarehousePutaway(
  input: WarehousePutawayDraft,
): PreparedWarehousePutaway {
  const product = parseWarehouseBarcode(input.productBarcode);
  if (!product.ok || product.kind !== "product") {
    return { ok: false, message: "Scan a product barcode before putaway." };
  }

  const destination = parseWarehouseBarcode(input.destinationBarcode);
  if (!destination.ok || destination.kind !== "location") {
    return { ok: false, message: "Scan a DMLOC destination label before putaway." };
  }

  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return { ok: false, message: "Putaway quantity must be a positive whole number." };
  }

  return {
    ok: true,
    productBarcode: product.barcode,
    destinationLocation: destination.value,
    quantity: input.quantity,
  };
}
