import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerAuthSupabaseClient } from "../../../lib/supabaseClient";
import {
  createCsrfToken,
  csrfCookieName,
  csrfCookieOptions,
  refreshCookieName,
  sessionCookieName,
  sessionCookieOptions,
} from "../../../lib/sessionCookies";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") || "/password-setup";
  if (!tokenHash || !type || !next.startsWith("/")) {
    return NextResponse.redirect(new URL("/password-setup?error=invalid-link", url.origin));
  }
  const { data, error } = await createServerAuthSupabaseClient().auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.session) {
    return NextResponse.redirect(new URL("/password-setup?error=expired-link", url.origin));
  }
  const response = NextResponse.redirect(new URL(next, url.origin));
  const maxAge = Math.max(60, data.session.expires_in ?? 3600);
  response.cookies.set(sessionCookieName(), data.session.access_token, sessionCookieOptions(maxAge));
  response.cookies.set(refreshCookieName(), data.session.refresh_token, sessionCookieOptions(60 * 60 * 24 * 30));
  response.cookies.set(csrfCookieName(), createCsrfToken(), csrfCookieOptions(60 * 60 * 24 * 30));
  return response;
}
