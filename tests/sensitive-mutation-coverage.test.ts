import { describe, expect, it, vi } from "vitest";

const { getRequestContext } = vi.hoisted(() => ({ getRequestContext: vi.fn() }));

vi.mock("../lib/requestSecurity", () => ({ mutationRequestAllowed: () => true }));
vi.mock("../lib/serverAuth", () => ({ getRequestContext }));

import { POST as createFitment } from "../app/api/fitment-rules/route";
import { POST as moveInventory } from "../app/api/inventory-movement/route";
import { POST as createProduct } from "../app/api/products/route";

describe("sensitive mutation MFA coverage", () => {
  it.each([
    ["product master", createProduct, "https://drivemateparts.com.au/api/products", "admin"],
    ["fitment rule", createFitment, "https://drivemateparts.com.au/api/fitment-rules", "admin"],
    ["manual inventory movement", moveInventory, "https://drivemateparts.com.au/api/inventory-movement", "partner"],
  ])("requires step-up before validating a %s mutation", async (_label, handler, url, role) => {
    getRequestContext.mockResolvedValue({
      role,
      userId: `${role}-user`,
      assuranceLevel: "aal1",
      mfaRequired: true,
    });

    const response = await handler(new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "mfa_required",
    });
  });
});
