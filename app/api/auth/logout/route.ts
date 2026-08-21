import { NextResponse } from "next/server";
import { mutationRequestAllowed } from "../../../../lib/requestSecurity";
import {
  csrfCookieName,
  refreshCookieName,
  sessionCookieName,
} from "../../../../lib/sessionCookies";

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json(
      { ok: false, message: "Request security validation failed." },
      { status: 403 },
    );
  }
  const response = NextResponse.json({ ok: true });
  for (const name of [
    sessionCookieName(),
    refreshCookieName(),
    csrfCookieName(),
  ]) {
    response.cookies.set(name, "", {
      httpOnly: name !== csrfCookieName(),
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}
