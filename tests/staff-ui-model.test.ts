import { describe, expect, it } from "vitest";
import {
  canManageStaffAccount,
  filterStaffAccounts,
  formatStaffDate,
  staffSecurityLabel,
  staffSummary,
  type StaffCollectionAccount,
} from "../lib/staffUi";

const accounts: StaffCollectionAccount[] = [
  {
    userId: "admin-1",
    email: "lee@drivemateparts.com.au",
    displayName: "Li Yongkang",
    role: "admin",
    accountStatus: "active",
    mustChangePassword: false,
    requiresReauthentication: false,
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
  },
  {
    userId: "worker-1",
    email: "operator01@drivemateparts.com.au",
    displayName: "Warehouse Operator 01",
    role: "warehouse_staff",
    accountStatus: "pending_first_login",
    mustChangePassword: true,
    requiresReauthentication: true,
    temporaryPasswordExpiresAt: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:00:00.000Z",
  },
  {
    userId: "partner-1",
    email: "partner@drivemateparts.com.au",
    displayName: "Operations Partner",
    role: "partner",
    accountStatus: "disabled",
    mustChangePassword: false,
    requiresReauthentication: true,
    disabledAt: "2026-08-30T00:00:00.000Z",
    disabledReason: "Access review",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  },
];

describe("staff UI model", () => {
  it("derives the five approved summary metrics", () => {
    expect(staffSummary(accounts, new Date("2026-08-31T00:00:00.000Z"))).toEqual({
      total: 3,
      pendingFirstLogin: 1,
      active: 1,
      disabled: 1,
      expiringSoon: 1,
    });
  });

  it("filters by name, email, role and lifecycle status", () => {
    expect(filterStaffAccounts(accounts, {
      search: "operator01",
      role: "warehouse_staff",
      status: "pending_first_login",
    })).toEqual([accounts[1]]);
    expect(filterStaffAccounts(accounts, { search: "PARTNER@", role: "all", status: "all" }))
      .toEqual([accounts[2]]);
  });

  it("keeps admin accounts and partner viewers read only", () => {
    expect(canManageStaffAccount("admin", accounts[0])).toBe(false);
    expect(canManageStaffAccount("partner", accounts[1])).toBe(false);
    expect(canManageStaffAccount("admin", accounts[1])).toBe(true);
  });

  it("labels pending password expiry without treating expired credentials as expiring soon", () => {
    expect(staffSecurityLabel(accounts[1], new Date("2026-08-31T00:00:00.000Z"))).toBe("Expires in 1 day");
    expect(staffSecurityLabel(accounts[1], new Date("2026-09-02T00:00:00.000Z"))).toBe("Expired");
    expect(staffSummary(accounts, new Date("2026-09-02T00:00:00.000Z")).expiringSoon).toBe(0);
  });

  it("formats a dated login with a timezone without unsupported Intl option combinations", () => {
    expect(() => formatStaffDate("2026-08-31T00:00:00.000Z", "Australia/Brisbane")).not.toThrow();
    expect(formatStaffDate(undefined, "Australia/Brisbane")).toBe("Never");
  });
});
