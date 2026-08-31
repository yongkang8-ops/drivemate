import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const servicePath = join(process.cwd(), "lib/staffAdminService.ts");

describe("staff admin credential helpers", () => {
  it("provides a dedicated server-only staff administration service", () => {
    expect(existsSync(servicePath)).toBe(true);
  });

  it("generates a strong non-persisted temporary password and an exact seven-day expiry", async () => {
    if (!existsSync(servicePath)) return;
    const { generateTemporaryPassword, temporaryPasswordExpiresAt } = await import("../lib/staffAdminService");
    const password = generateTemporaryPassword();

    expect(password.length).toBeGreaterThanOrEqual(24);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[^A-Za-z0-9]/);
    expect(temporaryPasswordExpiresAt("2026-08-30T00:00:00.000Z")).toBe("2026-09-06T00:00:00.000Z");
  });

  it("records administrator reasons for role and password security actions", () => {
    const source = readFileSync(servicePath, "utf8");
    expect(source).toContain('action: "staff_role_change_reason"');
    expect(source).toContain('action: "staff_password_reset_reason"');
    expect(source).not.toMatch(/temporaryPassword[^\n]*(after_value|before_value)/);
  });

  it("loads MFA enrollment only for administrator security views", () => {
    const source = readFileSync(servicePath, "utf8");
    expect(source).toContain("client.auth.admin.mfa.listFactors");
    expect(source).toContain("mfaEnrolled");
    expect(source).toContain("options.includeAudit");
  });
});
