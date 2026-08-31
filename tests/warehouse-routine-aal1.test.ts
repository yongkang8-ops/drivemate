import { describe, expect, it, vi } from "vitest";

const { getRequestContext } = vi.hoisted(() => ({ getRequestContext: vi.fn() }));

vi.mock("../lib/requestSecurity", () => ({ mutationRequestAllowed: () => true }));
vi.mock("../lib/serverAuth", () => ({ getRequestContext }));

import { POST as createLabelJob } from "../app/api/warehouse/labels/route";
import { POST as putAway } from "../app/api/warehouse/putaway/route";
import { POST as receive } from "../app/api/warehouse/receipts/route";

describe("routine warehouse operations at aal1", () => {
  it("reaches receipt validation without demanding MFA", async () => {
    getRequestContext.mockResolvedValue({
      role: "warehouse_staff",
      userId: "warehouse-user",
      assuranceLevel: "aal1",
      mfaRequired: true,
    });

    const response = await receive(new Request("https://drivemateparts.com.au/api/warehouse/receipts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(400);
  });

  it.each([
    ["label printing", createLabelJob, "https://drivemateparts.com.au/api/warehouse/labels"],
    ["putaway", putAway, "https://drivemateparts.com.au/api/warehouse/putaway"],
  ])("allows %s to reach request validation without MFA", async (_label, handler, url) => {
    getRequestContext.mockResolvedValue({
      role: "warehouse_staff",
      userId: "warehouse-user",
      assuranceLevel: "aal1",
      mfaRequired: true,
    });

    const response = await handler(new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(400);
  });
});
