import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { recoveryCallback, recoveryFragmentRelayHtml } from "../../../lib/authRecovery";
import { createCookieAuthSupabaseClient, createServerAuthSupabaseClient } from "../../../lib/supabaseClient";
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
  const callback = recoveryCallback(url);
  if (callback.kind === "pkce") {
    const response = NextResponse.redirect(new URL(callback.next, url.origin));
    const { data, error } = await createCookieAuthSupabaseClient(request, response)
      .auth.exchangeCodeForSession(callback.code);
    if (error || !data.session) {
      return NextResponse.redirect(new URL("/password-setup?error=expired-link", url.origin));
    }
    const maxAge = Math.max(60, data.session.expires_in ?? 3600);
    response.cookies.set(sessionCookieName(), data.session.access_token, sessionCookieOptions(maxAge));
    response.cookies.set(refreshCookieName(), data.session.refresh_token, sessionCookieOptions(60 * 60 * 24 * 30));
    response.cookies.set(csrfCookieName(), createCsrfToken(), csrfCookieOptions(60 * 60 * 24 * 30));
    return response;
  }
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = callback.next;
  if (!tokenHash || !type || !next.startsWith("/")) {
    return new NextResponse(recoveryFragmentRelayHtml(), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
      },
    });
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
