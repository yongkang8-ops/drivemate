import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestContext } = vi.hoisted(() => ({ getRequestContext: vi.fn() }));

vi.mock("../lib/requestSecurity", () => ({ mutationRequestAllowed: () => true }));
vi.mock("../lib/serverAuth", () => ({ getRequestContext }));
vi.mock("../lib/tradingGate", () => ({
  getTradingGate: () => ({ enabled: true }),
  tradingDisabledPayload: () => ({ ok: false }),
}));

import { POST as adjustInventory } from "../app/api/inventory-movement/route";
import { POST as createLocation } from "../app/api/inventory/locations/route";
import { PATCH as editLocation } from "../app/api/inventory/locations/[locationId]/route";
import { POST as setLocationStatus } from "../app/api/inventory/locations/[locationId]/status/route";
import { POST as createPackingListRevision } from "../app/api/prearrival/shipments/[shipmentId]/revisions/route";
import { POST as confirmPackingListRevision } from "../app/api/prearrival/revisions/[revisionId]/confirm/route";
import { POST as dispatchOrder } from "../app/api/orders/[orderId]/dispatch/route";
import { POST as receiveRma } from "../app/api/warehouse/rma/[rmaId]/receive/route";

beforeEach(() => {
  getRequestContext.mockResolvedValue({
    role: "warehouse_staff",
    userId: "warehouse-user",
    assuranceLevel: "aal1",
    mfaRequired: false,
  });
});

describe("warehouse staff server boundaries", () => {
  it.each([
    ["manual inventory adjustment", (request: Request) => adjustInventory(request), "https://drivemateparts.com.au/api/inventory-movement"],
    ["location creation", (request: Request) => createLocation(request), "https://drivemateparts.com.au/api/inventory/locations"],
    ["location notes", (request: Request) => editLocation(request, { params: Promise.resolve({ locationId: "location-1" }) }), "https://drivemateparts.com.au/api/inventory/locations/location-1"],
    ["location status", (request: Request) => setLocationStatus(request, { params: Promise.resolve({ locationId: "location-1" }) }), "https://drivemateparts.com.au/api/inventory/locations/location-1/status"],
    ["Packing List revision", (request: Request) => createPackingListRevision(request, { params: Promise.resolve({ shipmentId: "shipment-1" }) }), "https://drivemateparts.com.au/api/prearrival/shipments/shipment-1/revisions"],
    ["Packing List confirmation", (request: Request) => confirmPackingListRevision(request, { params: Promise.resolve({ revisionId: "revision-1" }) }), "https://drivemateparts.com.au/api/prearrival/revisions/revision-1/confirm"],
    ["order dispatch", (request: Request) => dispatchOrder(request, { params: Promise.resolve({ orderId: "order-1" }) }), "https://drivemateparts.com.au/api/orders/order-1/dispatch"],
    ["RMA receipt", (request: Request) => receiveRma(request, { params: Promise.resolve({ rmaId: "11111111-1111-4111-8111-111111111111" }) }), "https://drivemateparts.com.au/api/warehouse/rma/11111111-1111-4111-8111-111111111111/receive"],
  ])("rejects %s before payload validation", async (_label, handler, url) => {
    const response = await handler(new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });
});
