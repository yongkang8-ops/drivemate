import { type AppRole, DEMO_ROLE_HEADER, can, isDemoRoleHeaderEnabled, parseRole } from "./auth";
import { createServiceSupabaseClient } from "./supabaseClient";
import { jwtAssuranceLevel, requestSessionTokens } from "./sessionCookies";

export type AuthContext = {
  role: AppRole;
  userId?: string;
  tradeAccountId?: string;
  assuranceLevel?: "aal1" | "aal2";
  mfaRequired?: boolean;
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
      .select("role, trade_account_id")
      .eq("id", userResult.user.id)
      .maybeSingle();

    if (profileError) return { role: "public", userId: userResult.user.id };
    const role = parseRole(profile?.role);
    const assuranceLevel = jwtAssuranceLevel(token);
    const mfaRequired =
      process.env.DRIVEMATE_REQUIRE_STAFF_MFA === "true" &&
      (role === "admin" || role === "warehouse") &&
      assuranceLevel !== "aal2";

    return {
      role,
      userId: userResult.user.id,
      tradeAccountId: profile?.trade_account_id ?? undefined,
      assuranceLevel,
      mfaRequired,
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
      };
    }
  }

  const token = getBearerToken(request) ?? requestSessionTokens(request).accessToken;
  if (!token) return { role: "public" };

  return getSupabaseAuthContextFromToken(token);
}

export async function getRequestRole(request: Request): Promise<AppRole> {
  return (await getRequestContext(request)).role;
}

export async function requestCan(request: Request, capability: Parameters<typeof can>[1]): Promise<boolean> {
  const context = await getRequestContext(request);
  return !context.mfaRequired && can(context.role, capability);
}
