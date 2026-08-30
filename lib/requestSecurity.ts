import { timingSafeEqual } from "node:crypto";
import { csrfCookieName, parseCookieHeader } from "./sessionCookies";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function requestOriginAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";

  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
    : requestOrigin;
  return origin === requestOrigin || origin === configuredOrigin;
}

export function csrfValid(request: Request) {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const cookieToken = cookies[csrfCookieName()];
  const headerToken = request.headers.get("x-csrf-token");
  return !!cookieToken && !!headerToken && safeEqual(cookieToken, headerToken);
}

export function mutationRequestAllowed(request: Request, options: { publicRequest?: boolean } = {}) {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) return true;
  if (process.env.NODE_ENV !== "production" && request.headers.get("x-drivemate-role")) return true;
  if (!requestOriginAllowed(request)) return false;
  return options.publicRequest ? true : csrfValid(request);
}

export function passwordSetupRequestAllowed(request: Request) {
  return requestOriginAllowed(request);
}

const rateLimits = new Map<string, number[]>();

export function rateLimitAllowed(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (rateLimits.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  rateLimits.set(key, recent);
  return true;
}

export function requestClientKey(request: Request, namespace: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  return `${namespace}:${ip}`;
}
