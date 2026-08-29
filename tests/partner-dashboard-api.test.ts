import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/partner/dashboard/route";
import { MemoryRepository } from "../lib/memoryRepository";

let repository: MemoryRepository;

beforeEach(async () => {
  vi.stubEnv("DRIVEMATE_REPOSITORY", "memory");
  vi.stubEnv("DRIVEMATE_ENABLE_DEMO_AUTH", "true");
  repository = new MemoryRepository();
  await repository.resetForTests();
  globalThis.__drivemateRepository = repository;
});

afterEach(() => {
  globalThis.__drivemateRepository = undefined;
  vi.unstubAllEnvs();
});

describe("partner dashboard API", () => {
  it("requires Partner warehouse-read access", async () => {
    const response = await GET(new Request("https://drivemateparts.com.au/api/partner/dashboard"));

    expect(response.status).toBe(403);
  });

  it("returns a saved warehouse-only dashboard in the requested display timezone", async () => {
    const response = await GET(new Request(
      "https://drivemateparts.com.au/api/partner/dashboard?timeZone=Asia%2FShanghai&search=BNE-TEST-001",
      { headers: { "x-drivemate-role": "partner" } },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      dashboard: {
        displayTimeZone: "Asia/Shanghai",
        pipeline: {
          activeShipments: 1,
          printConfirmationRequired: 1,
          stagingUnits: 0,
          locatedUnits: 0,
          openExceptions: 0,
        },
        shipments: [
          expect.objectContaining({
            shipmentReference: "BNE-TEST-001",
            nextAction: "Prepare labels",
          }),
        ],
      },
    });
  });
});
