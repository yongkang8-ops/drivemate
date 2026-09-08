import { safeWorkspaceNext } from "./workspaceRouting";

// Scroll preferences have their own public-route allowlist. This must not
// broaden the role-aware login redirect allowlist.
export function safeViewportContext(value: string): string | null {
  const workspace = safeWorkspaceNext(value);
  if (workspace) return workspace;
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return null;
  const url = new URL(value, "https://drivemate.local");
  if (url.origin !== "https://drivemate.local" || url.pathname !== "/catalogue" || url.hash) return null;
  for (const [key, text] of url.searchParams) {
    if (key === "q" && text.length <= 200 && !/[\u0000-\u001f]/.test(text)) continue;
    if (key === "cataloguePage" && /^[1-9]\d*$/.test(text) && Number.isSafeInteger(Number(text))) continue;
    if (key === "catalogueSize" && ["25", "50", "100"].includes(text)) continue;
    return null;
  }
  return `${url.pathname}${url.search}`;
}
