import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = join(process.cwd(), "supabase", "migrations");
const migrationName = "20260904_v19_staff_account_lifecycle.sql";
const migrationPath = join(migrationDirectory, migrationName);

function normalizedSql(path: string) {
  return readFileSync(path, "utf8").replace(/\s+/g, " ");
}

describe("v19 staff account lifecycle migration", () => {
  it("extends the ordered migration chain after v18", () => {
    const files = readdirSync(migrationDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    expect(files.at(-1)).toBe(migrationName);
  });

  it("defines the staff role and complete account lifecycle contract", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const sql = normalizedSql(migrationPath);

    expect(sql).toContain("'public', 'trade', 'warehouse_staff', 'partner', 'admin'");
    expect(sql).toContain("add column if not exists account_status text not null default 'active'");
    expect(sql).toContain("'pending_first_login', 'active', 'disabled'");
    expect(sql).toContain("add column if not exists must_change_password boolean not null default false");
    expect(sql).toContain("add column if not exists temporary_password_issued_at timestamptz");
    expect(sql).toContain("add column if not exists temporary_password_expires_at timestamptz");
    expect(sql).toContain("interval '7 days'");
    expect(sql).toContain("add column if not exists disabled_at timestamptz");
    expect(sql).toContain("add column if not exists disabled_by uuid references auth.users(id) on delete set null");
    expect(sql).toContain("add column if not exists disabled_reason text");
    expect(sql).toContain("add column if not exists status_before_disabled text");
    expect(sql).toContain("add column if not exists last_login_at timestamptz");
    expect(sql).toContain("add column if not exists password_changed_at timestamptz");
    expect(sql).toContain("add column if not exists requires_reauthentication boolean not null default false");
  });

  it("enforces lifecycle coherence without storing a plaintext password", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const sql = normalizedSql(migrationPath);

    expect(sql).toContain("user_profiles_staff_lifecycle_check");
    expect(sql).toContain("temporary_password_expires_at = temporary_password_issued_at + interval '7 days'");
    expect(sql).toContain("status_before_disabled in ('pending_first_login', 'active')");
    expect(sql).toContain("new.requires_reauthentication := true");
    expect(sql).toContain("'requires_reauthentication', new.requires_reauthentication");
    expect(sql).toContain("'disabled_reason', new.disabled_reason");
    expect(sql).toContain("'staff_password_changed'");
    expect(sql).toContain("create or replace function public.dm_set_user_profile_lifecycle_fields()");
    expect(sql).toContain("create or replace function public.dm_audit_user_profile_lifecycle()");
    expect(sql).not.toMatch(/add column[^;]*temporary_password\s+text/i);
    expect(sql).not.toMatch(/add column[^;]*(password_hash|password_secret|mfa_secret)/i);
  });

  it("adds bounded indexes and keeps direct profile writes server controlled", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const sql = normalizedSql(migrationPath);

    expect(sql).toContain("create index if not exists user_profiles_staff_status_idx");
    expect(sql).toContain("where role in ('warehouse_staff', 'partner', 'admin')");
    expect(sql).toContain("create index if not exists user_profiles_pending_password_expiry_idx");
    expect(sql).toContain("revoke insert, update, delete on public.user_profiles from anon, authenticated");
    expect(sql).toContain("using (id = (select auth.uid()) or public.current_user_role() = 'admin')");

    const policies = normalizedSql(join(process.cwd(), "supabase", "policies.sql"));
    expect(policies).toContain("using (id = (select auth.uid()) or public.current_user_role() = 'admin')");
  });

  it("keeps the cumulative schema aligned with v19", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const migration = normalizedSql(migrationPath);
    const schema = normalizedSql(join(process.cwd(), "supabase", "schema.sql"));

    for (const contract of [
      "warehouse_staff",
      "user_profiles_staff_lifecycle_check",
      "dm_set_user_profile_lifecycle_fields",
      "dm_audit_user_profile_lifecycle",
      "user_profiles_pending_password_expiry_idx",
    ]) {
      expect(migration).toContain(contract);
      expect(schema).toContain(contract);
    }
  });
});
