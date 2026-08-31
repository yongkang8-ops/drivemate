import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitAllowed, requestClientKey, requestOriginAllowed } from "../../../../lib/requestSecurity";
import {
  createCsrfToken,
  csrfCookieName,
  csrfCookieOptions,
  refreshCookieName,
  sessionCookieName,
  sessionCookieOptions,
} from "../../../../lib/sessionCookies";
import { createServerAuthSupabaseClient, createServiceSupabaseClient } from "../../../../lib/supabaseClient";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(256),
});

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request origin was not accepted." }, { status: 403 });
  }
  if (!rateLimitAllowed(requestClientKey(request, "login"), 10, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: false, message: "Too many sign-in attempts. Try again later." }, { status: 429 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Enter a valid email and password." }, { status: 400 });
  }

  const auth = createServerAuthSupabaseClient();
  const { data, error } = await auth.auth.signInWithPassword(parsed.data);
  if (error || !data.session || !data.user) {
    return NextResponse.json({ ok: false, message: "Email or password was not accepted." }, { status: 401 });
  }

  const service = createServiceSupabaseClient();
  const { data: profile, error: profileError } = await service
    .from("user_profiles")
    .select("role, display_name, trade_account_id, account_status, must_change_password, temporary_password_expires_at, requires_reauthentication")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    return NextResponse.json({ ok: false, message: "This account has not been assigned a DriveMate role." }, { status: 403 });
  }

  const accountStatus = profile.account_status ?? "active";
  const mustChangePassword = profile.must_change_password ?? false;
  const temporaryPasswordExpiresAt = profile.temporary_password_expires_at ?? null;
  if (accountStatus === "disabled") {
    return NextResponse.json({ ok: false, code: "account_disabled", message: "This staff account is disabled." }, { status: 403 });
  }
  if (
    accountStatus === "pending_first_login" &&
    temporaryPasswordExpiresAt &&
    new Date(temporaryPasswordExpiresAt).getTime() <= Date.now()
  ) {
    return NextResponse.json(
      { ok: false, code: "temporary_password_expired", message: "The temporary password has expired. Ask an administrator to generate a new one." },
      { status: 403 },
    );
  }

  const isStaff = ["warehouse_staff", "partner", "admin"].includes(profile.role);
  const passwordChangeRequired = isStaff && (accountStatus === "pending_first_login" || mustChangePassword);
  const profileUpdate: Record<string, unknown> = {
    last_login_at: new Date().toISOString(),
    updated_by: data.user.id,
  };
  if (isStaff && !passwordChangeRequired && profile.requires_reauthentication) {
    profileUpdate.requires_reauthentication = false;
  }
  const { error: lifecycleError } = await service.from("user_profiles").update(profileUpdate).eq("id", data.user.id);
  if (lifecycleError) {
    return NextResponse.json({ ok: false, message: "Staff sign-in state could not be recorded." }, { status: 422 });
  }

  const csrf = createCsrfToken();
  const response = NextResponse.json({
    ok: true,
    profile: {
      role: profile.role,
      displayName: profile.display_name,
      tradeAccountId: profile.trade_account_id,
    },
    passwordChangeRequired,
  });
  response.cookies.set(sessionCookieName(), data.session.access_token, sessionCookieOptions(data.session.expires_in));
  response.cookies.set(
    refreshCookieName(),
    data.session.refresh_token,
    sessionCookieOptions(60 * 60 * 24 * 30),
  );
  response.cookies.set(csrfCookieName(), csrf, csrfCookieOptions(60 * 60 * 24 * 30));
  return response;
}
