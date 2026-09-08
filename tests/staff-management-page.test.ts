import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("private Staff management route", () => {
  it("creates a noindex route guarded for Partner or Administrator access", () => {
    const routePath = join(process.cwd(), "app/admin/staff/page.tsx");
    expect(existsSync(routePath)).toBe(true);
    if (!existsSync(routePath)) return;
    const source = read("app/admin/staff/page.tsx");
    expect(source).toContain("Staff Management | DriveMate Parts");
    expect(source).toContain("robots: { index: false, follow: false }");
    expect(source).toContain('<RoleGate expectedRole="partner">');
    expect(source).toContain("<StaffManagementPage />");
  });

  // Role-aware link visibility is covered through the real rendered workspace
  // in experience-admin.spec.ts; individual source files need not contain links.

  it("covers the approved register, filters, metrics and collection states", () => {
    const files = [
      "components/staff/StaffManagementPage.tsx",
      "components/staff/StaffSummaryMetrics.tsx",
      "components/staff/StaffRegister.tsx",
    ];
    for (const file of files) expect(existsSync(join(process.cwd(), file))).toBe(true);
    if (files.some((file) => !existsSync(join(process.cwd(), file)))) return;
    const source = files.map(read).join("\n");
    for (const label of [
      "Total accounts",
      "Pending first login",
      "Active",
      "Disabled",
      "Expiring soon",
      "Staff register",
      "Search name or email",
      "All roles",
      "All statuses",
      "Staff records could not be loaded",
      "No staff accounts yet",
    ]) expect(source).toContain(label);
    expect(source).toContain("viewerRole");
    expect(source).toContain('cache: "no-store"');
  });

  it("provides every approved Staff management action through a dedicated form", () => {
    const actionForm = join(process.cwd(), "components/staff/StaffActionForm.tsx");
    expect(existsSync(actionForm)).toBe(true);
    if (!existsSync(actionForm)) return;
    const source = read("components/staff/StaffActionForm.tsx");
    for (const action of ["change_role", "reset_password", "reset_mfa", "disable", "reenable"]) {
      expect(source).toContain(action);
    }
    expect(source).toContain("Reason");
  });

  it("marks authenticated access so the Staff route can use the compact session treatment", () => {
    expect(read("components/AuthPanel.tsx")).toContain('profile ? " is-authenticated" : ""');
  });
});
