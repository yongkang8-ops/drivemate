export function recoveryAccessTokenFromHash(hash: string) {
  const parameters = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const accessToken = parameters.get("access_token");
  return parameters.get("type") === "recovery" && accessToken ? accessToken : null;
}

export function recoveryCallback(url: URL) {
  const next = url.searchParams.get("next") || "/password-setup";
  const code = url.searchParams.get("code");
  if (code && next.startsWith("/")) return { kind: "pkce" as const, code, next };
  return { kind: "other" as const, next };
}

export function recoveryFragmentRelayHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>DriveMate Parts</title></head><body><script>const target = window.location.hash ? "/password-setup" + window.location.hash : "/password-setup?error=invalid-link";window.location.replace(target);</script><p>Continuing to password setup…</p></body></html>`;
}
