import { NextResponse } from "next/server";
import { requestOriginAllowed } from "../../../../lib/requestSecurity";
import { csrfCookieName, refreshCookieName, sessionCookieName } from "../../../../lib/sessionCookies";

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request origin was not accepted." }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  for (const name of [sessionCookieName(), refreshCookieName(), csrfCookieName()]) {
    response.cookies.set(name, "", { httpOnly: name !== csrfCookieName(), path: "/", maxAge: 0 });
  }
  return response;
}
