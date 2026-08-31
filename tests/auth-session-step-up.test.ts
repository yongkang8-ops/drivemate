import { afterEach, describe, expect, it, vi } from "vitest";

const { getUser, maybeSingle } = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("../lib/supabaseClient", () => ({
  createServerAuthSupabaseClient: () => ({ auth: { refreshSession: vi.fn() } }),
  createServiceSupabaseClient: () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  }),
}));

import { GET } from "../app/api/auth/session/route";

const originalMfaSetting = process.env.DRIVEMATE_REQUIRE_STAFF_MFA;

function jwt(payload: Record<string, unknown>) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

afterEach(() => {
  vi.clearAllMocks();
  if (originalMfaSetting === undefined) delete process.env.DRIVEMATE_REQUIRE_STAFF_MFA;
  else process.env.DRIVEMATE_REQUIRE_STAFF_MFA = originalMfaSetting;
});

describe("staff session step-up policy", () => {
  it.each(["admin", "partner"] as const)("keeps the %s workspace available at aal1", async (role) => {
    process.env.DRIVEMATE_REQUIRE_STAFF_MFA = "true";
    getUser.mockResolvedValue({ data: { user: { id: `${role}-user` } }, error: null });
    maybeSingle.mockResolvedValue({
      data: {
        role,
        display_name: role === "admin" ? "Admin" : "Partner",
        trade_account_id: null,
        account_status: "active",
        must_change_password: false,
        requires_reauthentication: false,
      },
      error: null,
    });

    const response = await GET(new Request("https://drivemateparts.com.au/api/auth/session", {
      headers: { cookie: `drivemate_session=${jwt({ aal: "aal1" })}` },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authenticated: true,
      mfaRequired: false,
      assuranceLevel: "aal1",
      profile: { role },
    });
  });

  it.each([
    {
      label: "disabled",
      profile: { account_status: "disabled", must_change_password: false, requires_reauthentication: true },
      code: "account_disabled",
    },
    {
      label: "reauthentication-required",
      profile: { account_status: "active", must_change_password: false, requires_reauthentication: true },
      code: "reauthentication_required",
    },
  ])("invalidates a $label staff browser session", async ({ profile, code }) => {
    getUser.mockResolvedValue({ data: { user: { id: "staff-user" } }, error: null });
    maybeSingle.mockResolvedValue({
      data: {
        role: "warehouse_staff",
        display_name: "Warehouse One",
        trade_account_id: null,
        ...profile,
      },
      error: null,
    });

    const response = await GET(new Request("https://drivemateparts.com.au/api/auth/session", {
      headers: {
        cookie: `drivemate_session=${jwt({ aal: "aal1" })}; drivemate_refresh=refresh-token; drivemate_csrf=csrf-token`,
      },
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ authenticated: false, code });
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((cookie) => cookie.startsWith("drivemate_session=") && cookie.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("drivemate_refresh=") && cookie.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("drivemate_csrf=") && cookie.includes("Max-Age=0"))).toBe(true);
  });

  it("keeps an approved trade customer session outside staff MFA policy", async () => {
    process.env.DRIVEMATE_REQUIRE_STAFF_MFA = "true";
    getUser.mockResolvedValue({ data: { user: { id: "trade-user" } }, error: null });
    maybeSingle.mockResolvedValue({
      data: {
        role: "trade",
        display_name: "Workshop Customer",
        trade_account_id: "trade-account-1",
        account_status: "active",
        must_change_password: false,
        requires_reauthentication: false,
      },
      error: null,
    });

    const response = await GET(new Request("https://drivemateparts.com.au/api/auth/session", {
      headers: { cookie: `drivemate_session=${jwt({ aal: "aal1" })}` },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authenticated: true,
      mfaRequired: false,
      profile: { role: "trade", tradeAccountId: "trade-account-1" },
    });
  });
});
