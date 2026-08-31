import { type AppRole, DEMO_ROLE_HEADER, can, isDemoRoleHeaderEnabled, parseRole } from "./auth";
import { createRequestAuthSupabaseClient, createServiceSupabaseClient } from "./supabaseClient";
import { jwtAssuranceLevel, requestSessionTokens } from "./sessionCookies";

export type AuthContext = {
  role: AppRole;
  userId?: string;
  tradeAccountId?: string;
  assuranceLevel?: "aal1" | "aal2";
  mfaRequired?: boolean;
  authenticated?: boolean;
  accountStatus?: "pending_first_login" | "active" | "disabled";
  mustChangePassword?: boolean;
  temporaryPasswordExpiresAt?: string;
  requiresReauthentication?: boolean;
};

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

async function getSupabaseAuthContextFromToken(token: string): Promise<AuthContext> {
  try {
    const supabase = createServiceSupabaseClient();
    const { data: userResult, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userResult.user) return { role: "public" };

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role, trade_account_id, account_status, must_change_password, temporary_password_expires_at, requires_reauthentication")
      .eq("id", userResult.user.id)
      .maybeSingle();

    if (profileError) return { role: "public", userId: userResult.user.id, authenticated: true };
    const role = parseRole(profile?.role);
    const accountStatus = profile?.account_status ?? "active";
    const mustChangePassword = profile?.must_change_password ?? false;
    const requiresReauthentication = profile?.requires_reauthentication ?? false;
    const lifecycleBlocked =
      accountStatus === "disabled" ||
      accountStatus === "pending_first_login" ||
      mustChangePassword ||
      requiresReauthentication;
    const assuranceLevel = jwtAssuranceLevel(token);
    const mfaRequired =
      process.env.DRIVEMATE_REQUIRE_STAFF_MFA === "true" &&
      (role === "admin" || role === "partner") &&
      assuranceLevel !== "aal2";

    return {
      role: lifecycleBlocked ? "public" : role,
      userId: userResult.user.id,
      tradeAccountId: profile?.trade_account_id ?? undefined,
      assuranceLevel,
      mfaRequired,
      authenticated: true,
      accountStatus,
      mustChangePassword,
      temporaryPasswordExpiresAt: profile?.temporary_password_expires_at ?? undefined,
      requiresReauthentication,
    };
  } catch {
    return { role: "public" };
  }
}

export async function getRequestContext(request: Request): Promise<AuthContext> {
  if (isDemoRoleHeaderEnabled()) {
    const demoRole = request.headers.get(DEMO_ROLE_HEADER);
    if (demoRole) {
      const role = parseRole(demoRole);
      return {
        role,
        userId: role === "public" ? undefined : `demo-${role}-user`,
        tradeAccountId: role === "trade" ? "acct-demo" : undefined,
        authenticated: role !== "public",
      };
    }
  }

  const bearerToken = getBearerToken(request);
  if (bearerToken) return getSupabaseAuthContextFromToken(bearerToken);

  const tokens = requestSessionTokens(request);
  if (!tokens.accessToken) return { role: "public" };

  const current = await getSupabaseAuthContextFromToken(tokens.accessToken);
  if (current.authenticated || current.role !== "public" || !tokens.refreshToken) return current;

  const refreshed = await createRequestAuthSupabaseClient(request);
  if (!refreshed?.session.access_token) return current;
  return getSupabaseAuthContextFromToken(refreshed.session.access_token);
}

export async function getRequestRole(request: Request): Promise<AppRole> {
  return (await getRequestContext(request)).role;
}

export async function requestCan(request: Request, capability: Parameters<typeof can>[1]): Promise<boolean> {
  const context = await getRequestContext(request);
  return can(context.role, capability);
}
