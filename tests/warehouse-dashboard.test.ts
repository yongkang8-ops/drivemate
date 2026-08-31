import { describe, expect, it } from "vitest";
import { buildPartnerDashboard } from "../lib/warehouseDashboard";

describe("partner warehouse dashboard projection", () => {
  const dashboard = buildPartnerDashboard({
    shipments: [
      {
        shipmentId: "shipment-test-1",
        shipmentReference: "BNE-TEST-001",
        packingListConfirmed: true,
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
        packingListConfirmed: true,
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
      {
        shipmentId: "shipment-test-3",
        shipmentReference: "BNE-TEST-003",
        packingListConfirmed: false,
        packingListVersion: 0,
        palletCount: 0,
        cartonCount: 0,
        expectedQuantity: 0,
        labelConfirmed: false,
        receiptQuantity: 0,
        stagingQuantity: 0,
        locatedQuantity: 0,
        lastEventAt: "2026-08-29T00:12:00.000Z",
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

  it("keeps an unconfirmed packing list before label preparation", () => {
    expect(dashboard.pipeline).toMatchObject({
      activeShipments: 2,
      printConfirmationRequired: 1,
    });

    expect(dashboard.shipments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        shipmentReference: "BNE-TEST-003",
        stage: "packing_list_required",
        stageLabel: "Packing List required",
        labelStatus: "not_ready",
        receiptStatus: "blocked",
        putawayStatus: "blocked",
        nextAction: "Open pre-arrival",
        nextActionHref: "/prearrival?shipmentId=shipment-test-3",
      }),
    ]));

    expect(dashboard.attention).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "packing_list_required",
        shipmentId: "shipment-test-3",
        href: "/prearrival?shipmentId=shipment-test-3",
      }),
    ]));
    expect(dashboard.attention).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "print_gate",
        shipmentId: "shipment-test-3",
      }),
    ]));
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
