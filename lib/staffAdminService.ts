import { randomBytes, randomInt } from "node:crypto";
import type { StaffAccount, StaffCreatableRole, StaffRole } from "./repository";
import { createServiceSupabaseClient } from "./supabaseClient";

const STAFF_ROLES: StaffRole[] = ["warehouse_staff", "partner", "admin"];
const TEMPORARY_PASSWORD_DAYS = 7;
const DISABLE_BAN_DURATION = "876000h";

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

type StaffProfileRow = {
  id: string;
  display_name?: string | null;
  role: StaffRole;
  account_status: StaffAccount["accountStatus"];
  must_change_password: boolean;
  requires_reauthentication: boolean;
  temporary_password_expires_at?: string | null;
  password_changed_at?: string | null;
  disabled_at?: string | null;
  disabled_by?: string | null;
  disabled_reason?: string | null;
  status_before_disabled?: "pending_first_login" | "active" | null;
  last_login_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_by?: string | null;
  updated_at: string;
};

export type StaffAuditRecord = {
  id: string;
  action: string;
  actorId?: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  createdAt: string;
};

export type StaffUpdateAction =
  | { action: "disable"; reason: string }
  | { action: "reenable" }
  | { action: "change_role"; role: StaffCreatableRole; reason: string }
  | { action: "reset_password"; reason: string }
  | { action: "reset_mfa"; reason: string };

export type StaffUpdateInput = StaffUpdateAction & { userId: string; actorId: string };

function shuffledCharacters(value: string) {
  const chars = [...value];
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [chars[index], chars[target]] = [chars[target], chars[index]];
  }
  return chars.join("");
}

export function generateTemporaryPassword() {
  const required = ["abcdefghijkmnopqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%^&*_-+="]
    .map((set) => set[randomInt(set.length)])
    .join("");
  const random = randomBytes(24).toString("base64url").slice(0, 24);
  return shuffledCharacters(required + random);
}

export function temporaryPasswordExpiresAt(issuedAt: string | Date = new Date()) {
  const issued = issuedAt instanceof Date ? issuedAt : new Date(issuedAt);
  return new Date(issued.getTime() + TEMPORARY_PASSWORD_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function accountFrom(profile: StaffProfileRow, email = "", mfaEnrolled?: boolean): StaffAccount {
  return {
    userId: profile.id,
    email,
    displayName: profile.display_name ?? undefined,
    role: profile.role,
    accountStatus: profile.account_status,
    mustChangePassword: profile.must_change_password,
    requiresReauthentication: profile.requires_reauthentication,
    mfaEnrolled,
    temporaryPasswordExpiresAt: profile.temporary_password_expires_at ?? undefined,
    passwordChangedAt: profile.password_changed_at ?? undefined,
    disabledAt: profile.disabled_at ?? undefined,
    disabledBy: profile.disabled_by ?? undefined,
    disabledReason: profile.disabled_reason ?? undefined,
    statusBeforeDisabled: profile.status_before_disabled ?? undefined,
    lastLoginAt: profile.last_login_at ?? undefined,
    createdBy: profile.created_by ?? undefined,
    createdAt: profile.created_at,
    updatedBy: profile.updated_by ?? undefined,
    updatedAt: profile.updated_at,
  };
}

async function authEmails(client: ServiceClient) {
  const emails = new Map<string, string>();
  let page = 1;
  while (page <= 10) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Staff authentication records could not be loaded.");
    data.users.forEach((user) => emails.set(user.id, user.email ?? ""));
    if (data.users.length < 1000) break;
    page += 1;
  }
  return emails;
}

async function auditFor(client: ServiceClient, userIds: string[]) {
  if (userIds.length === 0) return [];
  const { data, error } = await client
    .from("audit_events")
    .select("id, entity_id, action, actor_id, before_value, after_value, created_at")
    .eq("entity_type", "staff_account")
    .in("entity_id", userIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Staff audit records could not be loaded.");
  return (data ?? []).map((record) => ({
    id: record.id,
    userId: record.entity_id,
    action: record.action,
    actorId: record.actor_id ?? undefined,
    beforeValue: record.before_value ?? undefined,
    afterValue: record.after_value ?? undefined,
    createdAt: record.created_at,
  }));
}

async function mfaEnrollmentFor(client: ServiceClient, userId: string) {
  const { data, error } = await client.auth.admin.mfa.listFactors({ userId });
  if (error) throw new Error("Staff MFA status could not be loaded.");
  return data.factors.some((factor) => factor.status === "verified");
}

export async function listStaffAccounts(
  options: { includeAudit: boolean },
  client = createServiceSupabaseClient(),
) {
  try {
    const { data, error } = await client
      .from("user_profiles")
      .select("id, display_name, role, account_status, must_change_password, requires_reauthentication, temporary_password_expires_at, password_changed_at, disabled_at, disabled_by, disabled_reason, status_before_disabled, last_login_at, created_by, created_at, updated_by, updated_at")
      .in("role", STAFF_ROLES)
      .order("created_at", { ascending: false });
    if (error) return { ok: false as const, message: "Staff accounts could not be loaded." };
    const profiles = (data ?? []) as StaffProfileRow[];
    const [emails, audit, enrollment] = await Promise.all([
      authEmails(client),
      options.includeAudit ? auditFor(client, profiles.map((profile) => profile.id)) : Promise.resolve(undefined),
      options.includeAudit
        ? Promise.all(profiles.map(async (profile) => [profile.id, await mfaEnrollmentFor(client, profile.id)] as const))
        : Promise.resolve([]),
    ]);
    const mfaByUserId = new Map<string, boolean>();
    enrollment.forEach(([userId, mfaEnrolled]) => mfaByUserId.set(userId, mfaEnrolled));
    return {
      ok: true as const,
      accounts: profiles.map((profile) => accountFrom(profile, emails.get(profile.id), mfaByUserId.get(profile.id))),
      ...(audit ? { audit } : {}),
    };
  } catch {
    return { ok: false as const, message: "Staff accounts could not be loaded." };
  }
}

export async function getStaffAccount(
  userId: string,
  options: { includeAudit: boolean },
  client = createServiceSupabaseClient(),
) {
  const { data, error } = await client
    .from("user_profiles")
    .select("id, display_name, role, account_status, must_change_password, requires_reauthentication, temporary_password_expires_at, password_changed_at, disabled_at, disabled_by, disabled_reason, status_before_disabled, last_login_at, created_by, created_at, updated_by, updated_at")
    .eq("id", userId)
    .in("role", STAFF_ROLES)
    .maybeSingle();
  if (error) return { ok: false as const, message: "Staff account could not be loaded." };
  if (!data) return { ok: false as const, message: "Staff account was not found.", notFound: true as const };
  const [authResult, audit, mfaEnrolled] = await Promise.all([
    client.auth.admin.getUserById(userId),
    options.includeAudit ? auditFor(client, [userId]) : Promise.resolve(undefined),
    options.includeAudit ? mfaEnrollmentFor(client, userId) : Promise.resolve(undefined),
  ]);
  return {
    ok: true as const,
    account: accountFrom(data as StaffProfileRow, authResult.data.user?.email ?? "", mfaEnrolled),
    ...(audit ? { audit } : {}),
  };
}

export async function createStaffAccount(
  input: { displayName: string; email: string; role: StaffCreatableRole; actorId: string },
  client = createServiceSupabaseClient(),
) {
  const email = input.email.trim().toLowerCase();
  const issuedAt = new Date().toISOString();
  const temporaryPassword = generateTemporaryPassword();
  const { data: authData, error: authError } = await client.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { display_name: input.displayName.trim() },
  });
  if (authError || !authData.user) {
    return { ok: false as const, message: "Staff authentication account could not be created." };
  }

  const { data: profile, error: profileError } = await client
    .from("user_profiles")
    .insert({
      id: authData.user.id,
      display_name: input.displayName.trim(),
      role: input.role,
      account_status: "pending_first_login",
      must_change_password: true,
      requires_reauthentication: true,
      temporary_password_issued_at: issuedAt,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select("id, display_name, role, account_status, must_change_password, requires_reauthentication, temporary_password_expires_at, password_changed_at, disabled_at, disabled_by, disabled_reason, status_before_disabled, last_login_at, created_by, created_at, updated_by, updated_at")
    .single();
  if (profileError || !profile) {
    await client.auth.admin.deleteUser(authData.user.id);
    return { ok: false as const, message: "Staff profile could not be created; the authentication account was rolled back." };
  }

  return {
    ok: true as const,
    account: accountFrom(profile as StaffProfileRow, email),
    temporaryPassword,
    temporaryPasswordExpiresAt: temporaryPasswordExpiresAt(issuedAt),
  };
}

async function mutableStaffProfile(client: ServiceClient, userId: string) {
  const { data, error } = await client
    .from("user_profiles")
    .select("id, role, account_status")
    .eq("id", userId)
    .in("role", STAFF_ROLES)
    .maybeSingle();
  if (error || !data) return { ok: false as const, message: "Staff account was not found." };
  if (data.role === "admin") return { ok: false as const, message: "Administrator accounts cannot be managed through this API." };
  return { ok: true as const, profile: data as { id: string; role: StaffRole; account_status: StaffAccount["accountStatus"] } };
}

async function recordSecurityAudit(
  client: ServiceClient,
  input: StaffUpdateInput,
  record: { action: string; afterValue: Record<string, unknown> },
) {
  const { error } = await client.from("audit_events").insert({
    entity_type: "staff_account",
    entity_id: input.userId,
    action: record.action,
    actor_id: input.actorId,
    after_value: { ...record.afterValue, reason: "reason" in input ? input.reason : undefined },
  });
  if (error) throw new Error("Staff security audit could not be recorded.");
}

export async function updateStaffAccount(input: StaffUpdateInput, client = createServiceSupabaseClient()) {
  const target = await mutableStaffProfile(client, input.userId);
  if (!target.ok) return target;

  if (input.action === "reset_mfa") {
    const { data, error } = await client.auth.admin.mfa.listFactors({ userId: input.userId });
    if (error) return { ok: false as const, message: "MFA factors could not be loaded." };
    for (const factor of data.factors) {
      const deleted = await client.auth.admin.mfa.deleteFactor({ userId: input.userId, id: factor.id });
      if (deleted.error) return { ok: false as const, message: "MFA factors could not be fully reset." };
    }
    await recordSecurityAudit(client, input, {
      action: "staff_mfa_reset",
      afterValue: { deletedFactorCount: data.factors.length },
    });
    return getStaffAccount(input.userId, { includeAudit: true }, client);
  }

  if (input.action === "disable") {
    if (target.profile.account_status === "disabled") return { ok: false as const, message: "Staff account is already disabled." };
    const { error } = await client.from("user_profiles").update({
      account_status: "disabled",
      disabled_reason: input.reason.trim(),
      disabled_by: input.actorId,
      updated_by: input.actorId,
    }).eq("id", input.userId);
    if (error) return { ok: false as const, message: "Staff account could not be disabled." };
    const banned = await client.auth.admin.updateUserById(input.userId, { ban_duration: DISABLE_BAN_DURATION });
    if (banned.error) return { ok: false as const, message: "Staff access was blocked in DriveMate, but the authentication ban needs administrator review." };
  }

  if (input.action === "reenable") {
    if (target.profile.account_status !== "disabled") return { ok: false as const, message: "Staff account is not disabled." };
    const unbanned = await client.auth.admin.updateUserById(input.userId, { ban_duration: "none" });
    if (unbanned.error) return { ok: false as const, message: "Staff authentication account could not be re-enabled." };
    const { error } = await client.from("user_profiles").update({
      account_status: "active",
      updated_by: input.actorId,
    }).eq("id", input.userId);
    if (error) {
      await client.auth.admin.updateUserById(input.userId, { ban_duration: DISABLE_BAN_DURATION });
      return { ok: false as const, message: "Staff profile could not be re-enabled; the authentication ban was restored." };
    }
  }

  if (input.action === "change_role") {
    const { error } = await client.from("user_profiles").update({
      role: input.role,
      requires_reauthentication: true,
      updated_by: input.actorId,
    }).eq("id", input.userId);
    if (error) return { ok: false as const, message: "Staff role could not be changed." };
    await recordSecurityAudit(client, input, {
      action: "staff_role_change_reason",
      afterValue: { previousRole: target.profile.role, role: input.role },
    });
  }

  if (input.action === "reset_password") {
    if (target.profile.account_status === "disabled") {
      return { ok: false as const, message: "Re-enable the staff account before resetting its password." };
    }
    const issuedAt = new Date().toISOString();
    const temporaryPassword = generateTemporaryPassword();
    const updated = await client.auth.admin.updateUserById(input.userId, { password: temporaryPassword });
    if (updated.error) return { ok: false as const, message: "Temporary password could not be generated." };
    const { error } = await client.from("user_profiles").update({
      account_status: "pending_first_login",
      must_change_password: true,
      temporary_password_issued_at: issuedAt,
      requires_reauthentication: true,
      updated_by: input.actorId,
    }).eq("id", input.userId);
    if (error) {
      await client.auth.admin.updateUserById(input.userId, { ban_duration: DISABLE_BAN_DURATION });
      return { ok: false as const, message: "Password was changed but lifecycle state could not be saved; the account was disabled for review." };
    }
    await recordSecurityAudit(client, input, {
      action: "staff_password_reset_reason",
      afterValue: { temporaryPasswordExpiresAt: temporaryPasswordExpiresAt(issuedAt) },
    });
    const result = await getStaffAccount(input.userId, { includeAudit: true }, client);
    return { ...result, temporaryPassword, temporaryPasswordExpiresAt: temporaryPasswordExpiresAt(issuedAt) };
  }

  return getStaffAccount(input.userId, { includeAudit: true }, client);
}
