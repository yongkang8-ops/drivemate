import { describe, expect, it } from "vitest";
import { createDraftOrder } from "../lib/orders";

describe("orders", () => {
  it("creates an order and reserves available inventory", () => {
    const inventory = [
      { sku: "DM-GWM-OF-001", onHand: 5, reserved: 1 },
      { sku: "DM-GWM-AF-002", onHand: 4, reserved: 0 },
    ];

    const result = createDraftOrder(inventory, {
      tradeAccountId: "acct-demo",
      poNumber: "JOB-1842",
      vehicleVin: "LGWFFEA6XRA000245",
      lines: [{ sku: "DM-GWM-OF-001", quantity: 3 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.status).toBe("submitted");
    expect(result.order.lines).toEqual([
      expect.objectContaining({
        sku: "DM-GWM-OF-001",
        quantity: 3,
        unitPriceExGstCents: 2595,
        lineTotalExGstCents: 7785,
        gstCents: 779,
        lineTotalIncGstCents: 8564,
      }),
    ]);
    expect(result.order).toMatchObject({
      subtotalExGstCents: 7785,
      gstCents: 779,
      totalIncGstCents: 8564,
    });
    expect(result.inventory.find((row) => row.sku === "DM-GWM-OF-001")?.onHand).toBe(5);
    expect(result.inventory.find((row) => row.sku === "DM-GWM-OF-001")?.reserved).toBe(4);
  });

  it("rejects orders without enough available stock", () => {
    const inventory = [{ sku: "DM-GWM-OF-001", onHand: 2, reserved: 1 }];

    const result = createDraftOrder(inventory, {
      tradeAccountId: "acct-demo",
      lines: [{ sku: "DM-GWM-OF-001", quantity: 2 }],
    });

    expect(result).toEqual({
      ok: false,
      message: "SKU DM-GWM-OF-001 does not have enough available stock.",
    });
  });
});
