import { describe, expect, it } from "vitest";
import { buildWarehouseHistory, summarizeWarehouseHistoryScope } from "../lib/warehouseHistory";

describe("warehouse history projection", () => {
  const event = {
    id: "audit-1",
    createdAt: "2026-08-29T00:45:00.000Z",
    action: "putaway_confirmed" as const,
    actor: "demo-partner-user",
    reference: "BNE-A01-03",
    shipmentId: "shipment-test-1",
    cartonNumbers: ["C001"],
    outcome: "Moved 2 units",
  };

  it("formats one stored UTC event as Brisbane date and time", () => {
    const history = buildWarehouseHistory({ events: [event], timeZone: "Australia/Brisbane" });

    expect(history.rows[0]).toMatchObject({
      date: "29 Aug 2026",
      time: "10:45",
      timeZone: "Australia/Brisbane",
      actionLabel: "Putaway confirmed",
      reference: "BNE-A01-03",
    });
  });

  it("changes display time without rewriting the immutable UTC timestamp", () => {
    const history = buildWarehouseHistory({ events: [event], timeZone: "Asia/Shanghai" });

    expect(history.rows[0]).toMatchObject({
      createdAt: "2026-08-29T00:45:00.000Z",
      date: "29 Aug 2026",
      time: "08:45",
      timeZone: "Asia/Shanghai",
    });
  });

  it("separates canonical source scopes from physical carton totals", () => {
    const summary = summarizeWarehouseHistoryScope({
      cartons: [
        {
          sourceCartonNumber: "C001",
          kind: "carton",
          physicalCartonCount: 1,
        },
        {
          sourceCartonNumber: "7#8#9#",
          kind: "carton_group",
          physicalCartonCount: 3,
        },
      ],
      selectedSourceScopes: ["7#8#9#"],
    });

    expect(summary).toEqual({
      sourceScopeCount: 1,
      physicalCartonCount: 3,
      cartonGroupCount: 1,
    });
  });
});
