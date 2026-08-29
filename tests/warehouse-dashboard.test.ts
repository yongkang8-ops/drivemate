import { describe, expect, it } from "vitest";
import { buildPartnerDashboard } from "../lib/warehouseDashboard";

describe("partner warehouse dashboard projection", () => {
  const dashboard = buildPartnerDashboard({
    shipments: [
      {
        shipmentId: "shipment-test-1",
        shipmentReference: "BNE-TEST-001",
        packingListVersion: 1,
        palletCount: 1,
        cartonCount: 1,
        expectedQuantity: 18,
        labelConfirmed: true,
        receiptQuantity: 11,
        stagingQuantity: 11,
        locatedQuantity: 0,
        lastEventAt: "2026-08-29T00:45:00.000Z",
      },
      {
        shipmentId: "shipment-test-2",
        shipmentReference: "BNE-TEST-002",
        packingListVersion: 2,
        palletCount: 2,
        cartonCount: 3,
        expectedQuantity: 24,
        labelConfirmed: false,
        receiptQuantity: 0,
        stagingQuantity: 0,
        locatedQuantity: 0,
        lastEventAt: "2026-08-29T00:24:00.000Z",
      },
    ],
    events: [
      {
        id: "difference-1",
        createdAt: "2026-08-29T00:36:00.000Z",
        action: "discrepancy_recorded",
        actor: "demo-partner-user",
        reference: "receipt-1",
        shipmentId: "shipment-test-1",
        cartonNumbers: ["C001"],
        sku: "DM-GWM-OF-001",
        quantity: 1,
        outcome: "short_pack: Supplier short packed one unit.",
      },
      {
        id: "putaway-1",
        createdAt: "2026-08-29T00:45:00.000Z",
        action: "putaway_confirmed",
        actor: "demo-partner-user",
        reference: "BNE-A01-03",
        shipmentId: "shipment-test-1",
        cartonNumbers: ["C001"],
        sku: "DM-GWM-OF-001",
        quantity: 2,
        outcome: "Moved 2 units from BNE-RECEIVING-STAGING",
      },
    ],
    displayTimeZone: "Australia/Brisbane",
    generatedAt: "2026-08-29T00:45:00.000Z",
  });

  it("reconciles pipeline totals from saved shipment facts", () => {
    expect(dashboard.pipeline).toMatchObject({
      activeShipments: 2,
      printConfirmationRequired: 1,
      stagingUnits: 11,
      locatedUnits: 0,
      openExceptions: 1,
    });
  });

  it("turns saved state into an actionable shipment worklist and priority queue", () => {
    expect(dashboard.shipments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        shipmentReference: "BNE-TEST-001",
        labelStatus: "printed",
        receiptStatus: "confirmed",
        putawayStatus: "pending",
        nextAction: "Open putaway",
      }),
      expect.objectContaining({
        shipmentReference: "BNE-TEST-002",
        labelStatus: "pending",
        receiptStatus: "waiting",
        nextAction: "Prepare labels",
      }),
    ]));
    expect(dashboard.exceptions[0]).toMatchObject({
      type: "receipt_difference",
      reference: "DM-GWM-OF-001",
    });
  });

  it("formats saved activity in the selected display timezone without changing UTC storage", () => {
    expect(dashboard.activities[0]).toMatchObject({
      actionLabel: "Putaway confirmed",
      date: "29 Aug 2026",
      time: "10:45",
      createdAt: "2026-08-29T00:45:00.000Z",
      timeZone: "Australia/Brisbane",
    });
  });
});
