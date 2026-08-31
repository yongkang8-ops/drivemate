import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRequestAuthSupabaseClient, getRequestContext, listFactors } = vi.hoisted(() => ({
  createRequestAuthSupabaseClient: vi.fn(),
  getRequestContext: vi.fn(),
  listFactors: vi.fn(),
}));

vi.mock("../lib/requestSecurity", () => ({
  mutationRequestAllowed: () => true,
  rateLimitAllowed: () => true,
  requestClientKey: () => "mfa-session-test",
}));
vi.mock("../lib/serverAuth", () => ({ getRequestContext }));
vi.mock("../lib/supabaseClient", () => ({
  createRequestAuthSupabaseClient,
}));

import { GET, POST } from "../app/api/auth/mfa/route";

describe("MFA session errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRequestAuthSupabaseClient.mockResolvedValue(null);
  });

  it.each([
    ["status", (request: Request) => GET(request)],
    ["enrollment", (request: Request) => POST(request)],
  ])("reports an expired session for MFA %s requests", async (_label, handler) => {
    getRequestContext.mockResolvedValue({ role: "public" });
    const response = await handler(new Request("https://drivemateparts.com.au/api/auth/mfa", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ friendlyName: "DriveMate staff authenticator" }),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "session_expired",
    });
  });

  it("uses one refreshed request session to load MFA factors", async () => {
    const freshAccessToken = `header.${Buffer.from(JSON.stringify({ aal: "aal1" })).toString("base64url")}.signature`;
    createRequestAuthSupabaseClient.mockResolvedValue({
      client: { auth: { mfa: { listFactors } } },
      session: {
        access_token: freshAccessToken,
        refresh_token: "fresh-refresh-token",
        expires_in: 3600,
      },
    });
    listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    getRequestContext.mockImplementation(async (request: Request) =>
      request.headers.get("authorization") === `Bearer ${freshAccessToken}`
        ? { role: "admin", userId: "admin-user", assuranceLevel: "aal1", mfaRequired: true }
        : { role: "public" },
    );

    const response = await GET(new Request("https://drivemateparts.com.au/api/auth/mfa", {
      headers: { cookie: "drivemate_session=expired; drivemate_refresh=valid" },
    }));

    expect(response.status).toBe(200);
    expect(createRequestAuthSupabaseClient).toHaveBeenCalledTimes(1);
    expect(listFactors).toHaveBeenCalledTimes(1);
  });
});
