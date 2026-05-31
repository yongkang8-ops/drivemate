import { describe, expect, it } from "vitest";
import { availableStock, dispatchStock, quarantineStock, receiveStock } from "../lib/inventory";

describe("inventory movements", () => {
  it("receives stock into an existing SKU", () => {
    const state = [{ sku: "DM-GWM-OF-001", onHand: 2, reserved: 0 }];

    const result = receiveStock(state, { sku: "DM-GWM-OF-001", quantity: 3 });

    expect(result.ok).toBe(true);
    expect(state[0].onHand).toBe(5);
    expect(availableStock(state[0])).toBe(5);
  });

  it("prevents dispatch when available stock is insufficient", () => {
    const state = [{ sku: "DM-GWM-OF-001", onHand: 2, reserved: 1 }];

    const result = dispatchStock(state, { sku: "DM-GWM-OF-001", quantity: 2 });

    expect(result.ok).toBe(false);
    expect(state[0].onHand).toBe(2);
  });

  it("dispatches available stock and keeps reserved stock untouched", () => {
    const state = [{ sku: "DM-GWM-OF-001", onHand: 5, reserved: 1 }];

    const result = dispatchStock(state, { sku: "DM-GWM-OF-001", quantity: 3 });

    expect(result.ok).toBe(true);
    expect(state[0].onHand).toBe(2);
    expect(state[0].reserved).toBe(1);
    expect(availableStock(state[0])).toBe(1);
  });

  it("rejects non-positive quantities", () => {
    const state = [{ sku: "DM-GWM-OF-001", onHand: 2, reserved: 0 }];

    expect(receiveStock(state, { sku: "DM-GWM-OF-001", quantity: 0 })).toEqual({
      ok: false,
      message: "Quantity must be positive.",
    });
    expect(dispatchStock(state, { sku: "DM-GWM-OF-001", quantity: -1 })).toEqual({
      ok: false,
      message: "Quantity must be positive.",
    });
  });

  it("moves available stock into quarantine without reducing physical on-hand stock", () => {
    const state = [{ sku: "DM-GWM-OF-001", onHand: 5, reserved: 1, quarantine: 0 }];

    const result = quarantineStock(state, { sku: "DM-GWM-OF-001", quantity: 2 });

    expect(result.ok).toBe(true);
    expect(state[0].onHand).toBe(5);
    expect(state[0].reserved).toBe(1);
    expect(state[0].quarantine).toBe(2);
    expect(availableStock(state[0])).toBe(2);
  });
});
