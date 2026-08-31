import { afterEach, describe, expect, it, vi } from "vitest";

const { createRequestAuthSupabaseClient, getUser, maybeSingle } = vi.hoisted(() => ({
  createRequestAuthSupabaseClient: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("../lib/supabaseClient", () => ({
  createRequestAuthSupabaseClient,
  createServiceSupabaseClient: () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  }),
}));

import { DEMO_ROLE_ENV } from "../lib/auth";
import { getRequestContext } from "../lib/serverAuth";

const originalDemoAuth = process.env[DEMO_ROLE_ENV];

afterEach(() => {
  vi.clearAllMocks();
  if (originalDemoAuth === undefined) delete process.env[DEMO_ROLE_ENV];
  else process.env[DEMO_ROLE_ENV] = originalDemoAuth;
});

describe("request authentication refresh", () => {
  it("uses the refreshed Supabase session before resolving the staff role", async () => {
    process.env[DEMO_ROLE_ENV] = "false";
    const freshAccessToken = `header.${Buffer.from(JSON.stringify({ aal: "aal1" })).toString("base64url")}.signature`;
    createRequestAuthSupabaseClient.mockResolvedValue({
      client: {},
      session: {
        access_token: freshAccessToken,
        refresh_token: "fresh-refresh-token",
        expires_in: 3600,
      },
    });
    getUser.mockImplementation(async (token: string) =>
      token === freshAccessToken
        ? { data: { user: { id: "staff-user" } }, error: null }
        : { data: { user: null }, error: { message: "expired" } },
    );
    maybeSingle.mockResolvedValue({
      data: { role: "admin", trade_account_id: null },
      error: null,
    });

    const request = new Request("https://drivemateparts.com.au/api/auth/mfa", {
      headers: {
        cookie: "drivemate_session=expired-access-token; drivemate_refresh=valid-refresh-token",
      },
    });

    await expect(getRequestContext(request)).resolves.toMatchObject({
      role: "admin",
      userId: "staff-user",
      assuranceLevel: "aal1",
    });
    expect(getUser).toHaveBeenCalledWith(freshAccessToken);
  });
});
