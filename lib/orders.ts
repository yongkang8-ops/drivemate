import { availableStock, type InventoryRow } from "./inventory";
import { calculateOrderPricing, type OrderTotals, type PriceResolver, type PricedOrderLine } from "./pricing";

export type SalesOrderStatus = "draft" | "submitted" | "confirmed" | "picked" | "dispatched" | "cancelled";

export type OrderLineInput = {
  sku: string;
  quantity: number;
};

export type CreateOrderInput = {
  tradeAccountId: string;
  poNumber?: string;
  vehicleVin?: string;
  vehicleRego?: string;
  lines: OrderLineInput[];
};

export type DispatchScanInput = {
  sku: string;
  quantity: number;
};

export type DispatchOrderInput = {
  scans?: DispatchScanInput[];
};

export type CancelOrderInput = {
  tradeAccountId?: string;
};

export type SalesOrder = {
  id: string;
  tradeAccountId: string;
  poNumber?: string;
  vehicleVin?: string;
  vehicleRego?: string;
  status: SalesOrderStatus;
  createdBy?: string;
  createdAt?: string;
  subtotalExGstCents?: number;
  gstCents?: number;
  totalIncGstCents?: number;
  lines: PricedOrderLine[];
};

export type CreateOrderResult =
  | { ok: true; order: SalesOrder; inventory: InventoryRow[] }
  | { ok: false; message: string };

export function validateDispatchScans(orderLines: OrderLineInput[], scans: DispatchScanInput[] | undefined) {
  if (!scans?.length) {
    return { ok: false as const, message: "Dispatch scan confirmation is required." };
  }

  const expected = new Map<string, number>();
  for (const line of orderLines) {
    expected.set(line.sku, (expected.get(line.sku) ?? 0) + line.quantity);
  }

  const actual = new Map<string, number>();
  for (const scan of scans) {
    if (!scan.sku.trim()) return { ok: false as const, message: "Scanned SKU is required." };
    if (!Number.isInteger(scan.quantity) || scan.quantity <= 0) {
      return { ok: false as const, message: "Scanned quantities must be positive." };
    }
    actual.set(scan.sku, (actual.get(scan.sku) ?? 0) + scan.quantity);
  }

  for (const [sku, quantity] of actual.entries()) {
    if (!expected.has(sku)) return { ok: false as const, message: `Scanned SKU ${sku} is not on this order.` };
    if (expected.get(sku) !== quantity) {
      return { ok: false as const, message: `Scanned quantity for ${sku} does not match the order.` };
    }
  }

  for (const [sku, quantity] of expected.entries()) {
    if (actual.get(sku) !== quantity) {
      return { ok: false as const, message: `Order line ${sku} has not been fully scanned.` };
    }
  }

  return { ok: true as const };
}

export function createDraftOrder(
  inventory: InventoryRow[],
  input: CreateOrderInput,
  priceResolver?: PriceResolver,
): CreateOrderResult {
  if (!input.tradeAccountId.trim()) {
    return { ok: false, message: "Trade account is required." };
  }

  if (!input.lines.length) {
    return { ok: false, message: "At least one order line is required." };
  }

  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      return { ok: false, message: "Order quantities must be positive." };
    }

    const row = inventory.find((item) => item.sku === line.sku);
    if (!row) return { ok: false, message: `SKU ${line.sku} was not found.` };
    if (availableStock(row) < line.quantity) {
      return { ok: false, message: `SKU ${line.sku} does not have enough available stock.` };
    }
  }

  const pricing = calculateOrderPricing(input.lines, priceResolver);
  if (!pricing.ok) return pricing;

  const nextInventory = inventory.map((row) => ({ ...row }));
  for (const line of input.lines) {
    const row = nextInventory.find((item) => item.sku === line.sku);
    if (row) row.reserved += line.quantity;
  }

  return {
    ok: true,
    inventory: nextInventory,
    order: {
      id: `SO-${Date.now()}`,
      tradeAccountId: input.tradeAccountId,
      poNumber: input.poNumber,
      vehicleVin: input.vehicleVin,
      vehicleRego: input.vehicleRego,
      status: "submitted",
      createdAt: new Date().toISOString(),
      subtotalExGstCents: pricing.totals.subtotalExGstCents,
      gstCents: pricing.totals.gstCents,
      totalIncGstCents: pricing.totals.totalIncGstCents,
      lines: pricing.lines,
    },
  };
}

export function orderTotals(order: Pick<SalesOrder, "lines">): OrderTotals {
  return {
    subtotalExGstCents: order.lines.reduce((sum, line) => sum + (line.lineTotalExGstCents ?? 0), 0),
    gstCents: order.lines.reduce((sum, line) => sum + (line.gstCents ?? 0), 0),
    totalIncGstCents: order.lines.reduce((sum, line) => sum + (line.lineTotalIncGstCents ?? 0), 0),
  };
}
