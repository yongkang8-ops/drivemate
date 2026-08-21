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
    .select("role, display_name, trade_account_id")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    return NextResponse.json({ ok: false, message: "This account has not been assigned a DriveMate role." }, { status: 403 });
  }

  const csrf = createCsrfToken();
  const response = NextResponse.json({
    ok: true,
    profile: {
      role: profile.role,
      displayName: profile.display_name,
      tradeAccountId: profile.trade_account_id,
    },
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
