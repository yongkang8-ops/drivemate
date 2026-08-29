import { NextResponse } from "next/server";
import { z } from "zod";
import {
  mutationRequestAllowed,
  rateLimitAllowed,
  requestClientKey,
} from "../../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../../lib/serverAuth";
import {
  csrfCookieName,
  csrfCookieOptions,
  refreshCookieName,
  sessionCookieName,
  sessionCookieOptions,
} from "../../../../../lib/sessionCookies";
import { createRequestAuthSupabaseClient } from "../../../../../lib/supabaseClient";

const schema = z.object({
  factorId: z.string().uuid(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request))
    return NextResponse.json(
      { ok: false, message: "Request security validation failed." },
      { status: 403 },
    );
  if (
    !rateLimitAllowed(
      requestClientKey(request, "mfa-verify"),
      15,
      60 * 60 * 1000,
    )
  )
    return NextResponse.json(
      { ok: false, message: "Too many verification attempts." },
      { status: 429 },
    );
  const context = await getRequestContext(request);
  if (!context.userId || !["admin", "partner"].includes(context.role))
    return NextResponse.json(
      { ok: false, message: "Staff session required." },
      { status: 403 },
    );
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, message: "Enter the six-digit authenticator code." },
      { status: 400 },
    );
  const auth = await createRequestAuthSupabaseClient(request);
  if (!auth)
    return NextResponse.json(
      { ok: false, message: "Session expired." },
      { status: 401 },
    );
  const { data, error } = await auth.client.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });
  if (error || !data.access_token || !data.refresh_token)
    return NextResponse.json(
      { ok: false, message: "Authenticator code was not accepted." },
      { status: 422 },
    );
  const response = NextResponse.json({ ok: true, assuranceLevel: "aal2" });
  response.cookies.set(
    sessionCookieName(),
    data.access_token,
    sessionCookieOptions(data.expires_in),
  );
  response.cookies.set(
    refreshCookieName(),
    data.refresh_token,
    sessionCookieOptions(60 * 60 * 24 * 30),
  );
  const csrf = request.headers.get("x-csrf-token");
  if (csrf)
    response.cookies.set(
      csrfCookieName(),
      csrf,
      csrfCookieOptions(60 * 60 * 24 * 30),
    );
  return response;
}
