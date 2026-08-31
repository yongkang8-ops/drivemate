import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestContext, rpc } = vi.hoisted(() => ({
  getRequestContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../lib/requestSecurity", () => ({ mutationRequestAllowed: () => true }));
vi.mock("../lib/serverAuth", () => ({ getRequestContext }));
vi.mock("../lib/supabaseClient", () => ({
  createServiceSupabaseClient: () => ({ rpc }),
}));

import { POST } from "../app/api/admin/pricing/[sku]/approve/route";

describe("sensitive operation step-up response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestContext.mockResolvedValue({
      role: "admin",
      userId: "admin-user",
      assuranceLevel: "aal1",
      mfaRequired: true,
    });
  });

  it("returns a machine-readable MFA challenge without performing the mutation", async () => {
    const response = await POST(
      new Request("https://drivemateparts.com.au/api/admin/pricing/SKU-1/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unitPriceExGstCents: 12400 }),
      }),
      { params: Promise.resolve({ sku: "SKU-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "mfa_required",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
