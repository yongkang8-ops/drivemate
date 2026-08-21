import { randomBytes } from "node:crypto";

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export function sessionCookieName() {
  return process.env.DRIVEMATE_SESSION_COOKIE_NAME?.trim() || "drivemate_session";
}

export function refreshCookieName() {
  return process.env.DRIVEMATE_REFRESH_COOKIE_NAME?.trim() || "drivemate_refresh";
}

export function csrfCookieName() {
  return process.env.DRIVEMATE_CSRF_COOKIE_NAME?.trim() || "drivemate_csrf";
}

export function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator === -1) return [part, ""];
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

export function requestSessionTokens(request: Request) {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  return {
    accessToken: cookies[sessionCookieName()] || null,
    refreshToken: cookies[refreshCookieName()] || null,
    csrfToken: cookies[csrfCookieName()] || null,
  };
}

export function createCsrfToken() {
  return randomBytes(24).toString("base64url");
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function csrfCookieOptions(maxAge: number) {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function jwtAssuranceLevel(token: string | null): "aal1" | "aal2" | undefined {
  if (!token) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      aal?: string;
    };
    return payload.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return undefined;
  }
}
