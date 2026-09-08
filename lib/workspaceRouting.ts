export type WorkspaceRole = "admin" | "partner" | "warehouse_staff" | "trade";

const knownRoutes = new Set([
  "/partner",
  "/prearrival",
  "/warehouse",
  "/inventory",
  "/admin",
  "/admin/staff",
  "/portal",
]);

const routesByRole: Record<WorkspaceRole, ReadonlySet<string>> = {
  admin: new Set(["/partner", "/prearrival", "/warehouse", "/inventory", "/admin", "/admin/staff"]),
  partner: new Set(["/partner", "/prearrival", "/warehouse", "/inventory", "/admin/staff"]),
  warehouse_staff: new Set(["/warehouse"]),
  trade: new Set(["/portal"]),
};

const defaultRoute: Record<WorkspaceRole, string> = {
  admin: "/partner",
  partner: "/partner",
  warehouse_staff: "/warehouse",
  trade: "/portal",
};

const safeContextKeys = new Set([
  "shipment",
  "shipmentId",
  "view",
  "section",
  "tab",
  "page",
  "filter",
  "status",
  "sort",
  "order",
  "cursor",
  "sku",
  "productId",
  "jobId",
  "carton",
  "pallet",
  "returnId",
  "orderId",
  "locationSearch", "locationStatus", "staffSearch", "staffRole", "staffStatus", "dashboardSearch", "dashboardZone",
]);
const safeContextValue = /^[A-Za-z0-9 _.,:@+-]{0,200}$/;
const safeAnchor = /^#[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const paginatedContext = /^(reorder|products|fitment|batches|pricing|rfq|lookups|accounts|roles|applications|orders|movements|documents|purchasePreview|staff|locations|tradePad|tradeMatches|tradeOrders|tradeDocuments|shipments|attention|activity)(Page|Size)$/;
const pageSize = new Set(["25", "50", "100"]);

function isWorkspaceRole(role: string | undefined | null): role is WorkspaceRole {
  return role === "admin" || role === "partner" || role === "warehouse_staff" || role === "trade";
}

function containsEncodedTraversal(value: string): boolean {
  let decoded = value;
  for (let index = 0; index < 3; index += 1) {
    if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(decoded) || decoded.includes("\\")) return true;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return false;
      decoded = next;
    } catch {
      return true;
    }
  }
  return /\.\.|\\/.test(decoded);
}

export function safeWorkspaceNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (/\p{Cc}/u.test(value) || containsEncodedTraversal(value)) return null;

  let url: URL;
  try {
    url = new URL(value, "https://drivemate.local");
  } catch {
    return null;
  }

  if (url.origin !== "https://drivemate.local" || !knownRoutes.has(url.pathname)) return null;
  for (const [key, contextValue] of url.searchParams.entries()) {
    if (key === "cartonNumber" || key === "palletNumber") {
      if (url.pathname !== "/warehouse" || !contextValue || contextValue.length > 200 || /\p{Cc}/u.test(contextValue)) return null;
      continue;
    }
    if (key === "scope") {
      if (url.pathname !== "/warehouse" || contextValue !== "all") return null;
      continue;
    }
    if (safeContextKeys.has(key)) {
      if (!safeContextValue.test(contextValue)) return null;
      continue;
    }
    const pagination = key.match(paginatedContext);
    if (!pagination) return null;
    if (pagination[2] === "Page") {
      if (!/^[1-9]\d*$/.test(contextValue) || !Number.isSafeInteger(Number(contextValue))) return null;
    } else if (!pageSize.has(contextValue)) {
      return null;
    }
  }
  if (url.hash && !safeAnchor.test(url.hash)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function resolveWorkspaceDestination(
  role: string | undefined | null,
  requestedNext?: string | null,
): string | null {
  if (!isWorkspaceRole(role)) return null;
  const safeNext = safeWorkspaceNext(requestedNext);
  if (safeNext) {
    const pathname = new URL(safeNext, "https://drivemate.local").pathname;
    if (routesByRole[role].has(pathname)) return safeNext;
  }
  return defaultRoute[role];
}

export function passwordSetupDestination(requestedNext?: string | null): string {
  const safeNext = safeWorkspaceNext(requestedNext);
  return safeNext ? `/password-setup?next=${encodeURIComponent(safeNext)}` : "/password-setup";
}

export function loginDestinationAfterPasswordSetup(requestedNext?: string | null): string {
  const safeNext = safeWorkspaceNext(requestedNext);
  return safeNext ? `/staff/login?next=${encodeURIComponent(safeNext)}` : "/staff/login";
}
