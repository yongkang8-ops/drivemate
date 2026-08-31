import { NextResponse } from "next/server";
import {
  createCsrfToken,
  csrfCookieName,
  csrfCookieOptions,
  jwtAssuranceLevel,
  refreshCookieName,
  requestSessionTokens,
  sessionCookieName,
  sessionCookieOptions,
} from "../../../../lib/sessionCookies";
import { createServerAuthSupabaseClient, createServiceSupabaseClient } from "../../../../lib/supabaseClient";

async function profileForToken(accessToken: string) {
  const service = createServiceSupabaseClient();
  const { data: userData, error: userError } = await service.auth.getUser(accessToken);
  if (userError || !userData.user) return null;
  const { data: profile, error: profileError } = await service
    .from("user_profiles")
    .select("role, display_name, trade_account_id, account_status, must_change_password, temporary_password_expires_at, requires_reauthentication")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError || !profile) return null;
  return { user: userData.user, profile };
}

export async function GET(request: Request) {
  const tokens = requestSessionTokens(request);
  let accessToken = tokens.accessToken;
  let refreshToken = tokens.refreshToken;
  let expiresIn = Number.parseInt(process.env.DRIVEMATE_SESSION_MAX_AGE_SECONDS || "3600", 10);
  let refreshed = false;

  let sessionProfile = accessToken ? await profileForToken(accessToken) : null;
  if (!sessionProfile && refreshToken) {
    const auth = createServerAuthSupabaseClient();
    const { data, error } = await auth.auth.refreshSession({ refresh_token: refreshToken });
    if (!error && data.session) {
      accessToken = data.session.access_token;
      refreshToken = data.session.refresh_token;
      expiresIn = data.session.expires_in;
      refreshed = true;
      sessionProfile = await profileForToken(accessToken);
    }
  }

  if (!sessionProfile || !accessToken) {
    return NextResponse.json({ authenticated: false, message: "No active session." }, { status: 401 });
  }

  const profile = sessionProfile.profile;
  const accountStatus = profile.account_status ?? "active";
  const mustChangePassword = profile.must_change_password ?? false;
  const passwordChangeRequired = accountStatus === "pending_first_login" || mustChangePassword;
  if (accountStatus === "disabled" || (profile.requires_reauthentication && !passwordChangeRequired)) {
    const response = NextResponse.json(
      {
        authenticated: false,
        code: accountStatus === "disabled" ? "account_disabled" : "reauthentication_required",
        message: accountStatus === "disabled" ? "This staff account is disabled." : "Sign in again to continue.",
      },
      { status: 401 },
    );
    response.cookies.set(sessionCookieName(), "", sessionCookieOptions(0));
    response.cookies.set(refreshCookieName(), "", sessionCookieOptions(0));
    response.cookies.set(csrfCookieName(), "", csrfCookieOptions(0));
    return response;
  }

  const assuranceLevel = jwtAssuranceLevel(accessToken);
  const role = profile.role;
  const response = NextResponse.json({
    authenticated: true,
    mfaRequired: false,
    assuranceLevel,
    passwordChangeRequired,
    profile: {
      role,
      displayName: profile.display_name,
      tradeAccountId: profile.trade_account_id,
    },
  });

  if (refreshed && refreshToken) {
    response.cookies.set(sessionCookieName(), accessToken, sessionCookieOptions(expiresIn));
    response.cookies.set(refreshCookieName(), refreshToken, sessionCookieOptions(60 * 60 * 24 * 30));
  }
  if (!tokens.csrfToken) {
    response.cookies.set(csrfCookieName(), createCsrfToken(), csrfCookieOptions(60 * 60 * 24 * 30));
  }
  return response;
}
