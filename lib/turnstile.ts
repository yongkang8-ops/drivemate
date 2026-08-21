export async function verifyTurnstile(token: string | undefined, request: Request) {
  const required = process.env.DRIVEMATE_TURNSTILE_REQUIRED === "true";
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!required && (!secret || !token)) return true;
  if (!secret || !token) return false;

  const body = new URLSearchParams({ secret, response: token });
  const remoteIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (remoteIp) body.set("remoteip", remoteIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
    cache: "no-store",
  });
  if (!response.ok) return false;
  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}
