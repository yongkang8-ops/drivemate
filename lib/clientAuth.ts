import { type AppRole, DEMO_ROLE_HEADER } from "./auth";

export type AuthenticatedRole = Exclude<AppRole, "public">;

function cookieValue(name: string) {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const value = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : null;
}

export async function buildApiHeaders(role: AuthenticatedRole, baseHeaders: HeadersInit = {}): Promise<HeadersInit> {
  const headers = new Headers(baseHeaders);
  const csrfCookieName =
    process.env.NEXT_PUBLIC_DRIVEMATE_CSRF_COOKIE_NAME || "drivemate_csrf";
  const csrfToken = cookieValue(csrfCookieName);
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SHOW_INTERNAL_NAV === "true") {
    headers.set(DEMO_ROLE_HEADER, role);
  }

  return headers;
}
