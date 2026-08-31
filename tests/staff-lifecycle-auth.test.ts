import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  authGetUser,
  authSignInWithPassword,
  authUpdateUserById,
  profileMaybeSingle,
  profileUpdateEq,
} = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  authSignInWithPassword: vi.fn(),
  authUpdateUserById: vi.fn(),
  profileMaybeSingle: vi.fn(),
  profileUpdateEq: vi.fn(),
}));

vi.mock("../lib/requestSecurity", () => ({
  passwordSetupRequestAllowed: () => true,
  rateLimitAllowed: () => true,
  requestClientKey: () => "test-client",
  requestOriginAllowed: () => true,
}));

vi.mock("../lib/supabaseClient", () => ({
  createRequestAuthSupabaseClient: vi.fn(),
  createServerAuthSupabaseClient: () => ({
    auth: { signInWithPassword: authSignInWithPassword },
  }),
  createServiceSupabaseClient: () => ({
    auth: {
      getUser: authGetUser,
      admin: { updateUserById: authUpdateUserById },
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: profileMaybeSingle }) }),
      update: () => ({ eq: profileUpdateEq }),
    }),
  }),
}));

const originalDemoAuth = process.env.DRIVEMATE_ENABLE_DEMO_AUTH;

function jwt(payload: Record<string, unknown>) {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

beforeEach(() => {
  process.env.DRIVEMATE_ENABLE_DEMO_AUTH = "false";
  vi.clearAllMocks();
});

afterEach(() => {
  if (originalDemoAuth === undefined) delete process.env.DRIVEMATE_ENABLE_DEMO_AUTH;
  else process.env.DRIVEMATE_ENABLE_DEMO_AUTH = originalDemoAuth;
});

describe("staff account lifecycle authentication", () => {
  it.each([
    { account_status: "disabled", requires_reauthentication: true },
    { account_status: "active", requires_reauthentication: true },
  ])("blocks an authenticated token when lifecycle state is $account_status/$requires_reauthentication", async (lifecycle) => {
    authGetUser.mockResolvedValue({ data: { user: { id: "staff-user" } }, error: null });
    profileMaybeSingle.mockResolvedValue({
      data: {
        role: "warehouse_staff",
        trade_account_id: null,
        must_change_password: false,
        temporary_password_expires_at: null,
        ...lifecycle,
      },
      error: null,
    });
    const { getRequestContext } = await import("../lib/serverAuth");

    const context = await getRequestContext(new Request("https://drivemateparts.com.au/api/warehouse/receipts", {
      headers: { authorization: `Bearer ${jwt({ aal: "aal1" })}` },
    }));

    expect(context).toMatchObject({ role: "public", userId: "staff-user", authenticated: true });
  });

  it("rejects an expired initial password before issuing DriveMate cookies", async () => {
    authSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: "staff-user" },
        session: { access_token: "access", refresh_token: "refresh", expires_in: 3600 },
      },
      error: null,
    });
    profileMaybeSingle.mockResolvedValue({
      data: {
        role: "warehouse_staff",
        display_name: "Warehouse One",
        trade_account_id: null,
        account_status: "pending_first_login",
        must_change_password: true,
        temporary_password_expires_at: "2020-01-01T00:00:00.000Z",
        requires_reauthentication: true,
      },
      error: null,
    });
    const { POST } = await import("../app/api/auth/login/route");
    const response = await POST(new Request("https://drivemateparts.com.au/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://drivemateparts.com.au" },
      body: JSON.stringify({ email: "worker@example.com", password: "Temporary-Password-123!" }),
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "temporary_password_expired" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("activates a pending staff profile only after the first password is changed", async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: "staff-user" } }, error: null });
    profileMaybeSingle.mockResolvedValue({
      data: {
        role: "warehouse_staff",
        trade_account_id: null,
        account_status: "pending_first_login",
        must_change_password: true,
        temporary_password_expires_at: "2099-01-01T00:00:00.000Z",
        requires_reauthentication: true,
      },
      error: null,
    });
    authUpdateUserById.mockResolvedValue({ error: null });
    profileUpdateEq.mockResolvedValue({ error: null });
    const { POST } = await import("../app/api/auth/password-setup/route");
    const response = await POST(new Request("https://drivemateparts.com.au/api/auth/password-setup", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${jwt({ aal: "aal1" })}`,
      },
      body: JSON.stringify({ password: "Permanent-Password-123!" }),
    }));

    expect(response.status).toBe(200);
    expect(profileUpdateEq).toHaveBeenCalledWith("id", "staff-user");
  });
});
