import type { OrderLineInput } from "./orders";

export const GST_RATE_BASIS_POINTS = 1000;
export const BASIS_POINTS = 10000;

export const defaultTradePriceExGstCents: Record<string, number> = {
  "DM-GWM-OF-001": 2595,
  "DM-GWM-AF-002": 3449,
  "DM-GWM-CF-003": 4499,
  "DM-GWM-FF-004": 4313,
  "DM-BYD-CF-007": 3850,
  "DM-MG-CF-008": 3200,
};

export type PricedOrderLine = OrderLineInput & {
  unitPriceExGstCents: number;
  lineTotalExGstCents: number;
  gstCents: number;
  lineTotalIncGstCents: number;
};

export type OrderTotals = {
  subtotalExGstCents: number;
  gstCents: number;
  totalIncGstCents: number;
};

export type PriceResolver = (sku: string) => number | undefined;

export function defaultPriceResolver(sku: string): number | undefined {
  return defaultTradePriceExGstCents[sku];
}

export function calculateGstCents(exGstCents: number) {
  return Math.round((exGstCents * GST_RATE_BASIS_POINTS) / BASIS_POINTS);
}

export function calculateOrderPricing(lines: OrderLineInput[], priceResolver: PriceResolver = defaultPriceResolver) {
  const pricedLines: PricedOrderLine[] = [];

  for (const line of lines) {
    const unitPriceExGstCents = priceResolver(line.sku);
    if (!Number.isInteger(unitPriceExGstCents) || !unitPriceExGstCents || unitPriceExGstCents <= 0) {
      return { ok: false as const, message: `Trade price is not configured for ${line.sku}.` };
    }

    const lineTotalExGstCents = unitPriceExGstCents * line.quantity;
    const gstCents = calculateGstCents(lineTotalExGstCents);
    pricedLines.push({
      ...line,
      unitPriceExGstCents,
      lineTotalExGstCents,
      gstCents,
      lineTotalIncGstCents: lineTotalExGstCents + gstCents,
    });
  }

  const totals: OrderTotals = {
    subtotalExGstCents: pricedLines.reduce((sum, line) => sum + line.lineTotalExGstCents, 0),
    gstCents: pricedLines.reduce((sum, line) => sum + line.gstCents, 0),
    totalIncGstCents: pricedLines.reduce((sum, line) => sum + line.lineTotalIncGstCents, 0),
  };

  return { ok: true as const, lines: pricedLines, totals };
}

export function formatAudCents(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "Not priced";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value / 100);
}
