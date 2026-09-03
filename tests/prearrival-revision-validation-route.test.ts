import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRepository, getRequestContext } = vi.hoisted(() => ({
  getRepository: vi.fn(),
  getRequestContext: vi.fn(),
}));

vi.mock("../lib/requestSecurity", () => ({ mutationRequestAllowed: () => true }));
vi.mock("../lib/serverAuth", () => ({ getRequestContext }));
vi.mock("../lib/repository", () => ({ getRepository }));

import { POST } from "../app/api/prearrival/shipments/[shipmentId]/revisions/route";

describe("pre-arrival Packing List revision validation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestContext.mockResolvedValue({
      role: "partner",
      userId: "partner-user",
      authenticated: true,
    });
  });

  it("returns structured field paths without entering the repository", async () => {
    const response = await POST(
      new Request(
        "https://drivemateparts.com.au/api/prearrival/shipments/shipment-test-1/revisions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            shipmentId: "shipment-test-1",
            pallets: [
              {
                sourcePalletNumber: "",
                cartons: [
                  {
                    sourceCartonNumber: "",
                    lines: [{ sku: "", expectedQuantity: 0 }],
                  },
                ],
              },
            ],
          }),
        },
      ),
      { params: Promise.resolve({ shipmentId: "shipment-test-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        fieldErrors: expect.arrayContaining([
          expect.objectContaining({ path: ["pallets", 0, "sourcePalletNumber"] }),
          expect.objectContaining({
            path: ["pallets", 0, "cartons", 0, "lines", 0, "expectedQuantity"],
          }),
        ]),
      },
    });
    expect(getRepository).not.toHaveBeenCalled();
  });

  it("returns v3 carton-group field errors without entering the repository", async () => {
    const response = await POST(new Request(
      "https://drivemateparts.com.au/api/prearrival/shipments/shipment-test-1/revisions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 3,
          shipmentId: "shipment-test-1",
          cartons: [{
            sourceCartonNumber: "7#8#9#",
            kind: "carton_group",
            physicalCartonCount: 3,
            memberCartonNumbers: ["7#", ""],
            sourcePalletNumber: null,
            lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 10 }],
          }],
        }),
      },
    ), { params: Promise.resolve({ shipmentId: "shipment-test-1" }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        fieldErrors: expect.arrayContaining([
          expect.objectContaining({ path: ["cartons", 0, "memberCartonNumbers", 1] }),
          expect.objectContaining({ path: ["cartons", 0, "memberCartonNumbers"] }),
        ]),
      },
    });
    expect(getRepository).not.toHaveBeenCalled();
  });

  it("accepts a v2 revision without pallet mapping", async () => {
    const createPackingListRevision = vi.fn().mockResolvedValue({
      ok: true,
      revision: { id: "revision-v2", version: 1 },
    });
    getRepository.mockReturnValue({ createPackingListRevision });

    const payload = {
      schemaVersion: 2,
      shipmentId: "shipment-test-1",
      physicalPalletCount: 4,
      cartons: [{
        sourceCartonNumber: "CTN-001",
        sourcePalletNumber: null,
        lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 12 }],
      }],
    };
    const response = await POST(new Request(
      "https://drivemateparts.com.au/api/prearrival/shipments/shipment-test-1/revisions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    ), { params: Promise.resolve({ shipmentId: "shipment-test-1" }) });

    expect(response.status).toBe(201);
    expect(createPackingListRevision).toHaveBeenCalledWith({
      ...payload,
      cartons: [{
        ...payload.cartons[0],
        sourcePalletNumber: null,
      }],
    }, {
      actorId: "partner-user",
    });
  });

  it("rejects a non-positive physical pallet count before repository access", async () => {
    const response = await POST(new Request(
      "https://drivemateparts.com.au/api/prearrival/shipments/shipment-test-1/revisions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 2,
          shipmentId: "shipment-test-1",
          physicalPalletCount: 0,
          cartons: [{
            sourceCartonNumber: "CTN-001",
            sourcePalletNumber: null,
            lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 1 }],
          }],
        }),
      },
    ), { params: Promise.resolve({ shipmentId: "shipment-test-1" }) });

    expect(response.status).toBe(400);
    expect(getRepository).not.toHaveBeenCalled();
  });
});
