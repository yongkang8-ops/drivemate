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
    .select("role, display_name, trade_account_id")
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

  const assuranceLevel = jwtAssuranceLevel(accessToken);
  const role = sessionProfile.profile.role;
  const mfaRequired =
    process.env.DRIVEMATE_REQUIRE_STAFF_MFA === "true" &&
    (role === "admin" || role === "partner") &&
    assuranceLevel !== "aal2";
  const response = NextResponse.json({
    authenticated: true,
    mfaRequired,
    assuranceLevel,
    profile: {
      role,
      displayName: sessionProfile.profile.display_name,
      tradeAccountId: sessionProfile.profile.trade_account_id,
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
