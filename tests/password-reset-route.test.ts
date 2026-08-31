import { beforeEach, describe, expect, it, vi } from "vitest";

const { resetPasswordForEmail } = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
}));

vi.mock("../lib/requestSecurity", () => ({
  rateLimitAllowed: () => true,
  requestClientKey: () => "password-reset-test",
  requestOriginAllowed: () => true,
}));

vi.mock("../lib/supabaseClient", () => ({
  createCookieAuthSupabaseClient: () => ({
    auth: { resetPasswordForEmail },
  }),
}));

import { POST as requestPasswordReset } from "../app/api/auth/password-reset/route";

describe("password reset route", () => {
  beforeEach(() => {
    resetPasswordForEmail.mockReset();
    process.env.NEXT_PUBLIC_SITE_URL = "https://drivemateparts.com.au";
  });

  it("does not report success when Supabase rejects the recovery email", async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: { status: 500, code: "smtp_failure" },
    });

    const response = await requestPasswordReset(new Request(
      "https://drivemateparts.com.au/api/auth/password-reset",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://drivemateparts.com.au",
        },
        body: JSON.stringify({ email: "lee@drivemateparts.com.au" }),
      },
    ));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      message: "Password recovery is temporarily unavailable. Please try again later.",
    });
  });

  it("requests a recovery email with the DriveMate password setup callback", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });

    const response = await requestPasswordReset(new Request(
      "https://drivemateparts.com.au/api/auth/password-reset",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://drivemateparts.com.au",
        },
        body: JSON.stringify({ email: "operator@drivemateparts.com.au" }),
      },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      "operator@drivemateparts.com.au",
      {
        redirectTo: "https://drivemateparts.com.au/auth/confirm?next=/password-setup",
      },
    );
  });
});
