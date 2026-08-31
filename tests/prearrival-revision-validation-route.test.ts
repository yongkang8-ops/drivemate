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
});
