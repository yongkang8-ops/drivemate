import type { StaffAccount, StaffAccountStatus, StaffRole } from "./repository";

export type StaffViewerRole = "admin" | "partner";
export type StaffRoleFilter = "all" | StaffRole;
export type StaffStatusFilter = "all" | StaffAccountStatus;
export type StaffFilters = {
  search: string;
  role: StaffRoleFilter;
  status: StaffStatusFilter;
};
export type StaffCollectionAccount = StaffAccount & { mfaEnrolled?: boolean };

const DAY_MS = 24 * 60 * 60 * 1000;

export function staffSummary(accounts: StaffCollectionAccount[], now = new Date()) {
  const nowTime = now.getTime();
  const soon = nowTime + 48 * 60 * 60 * 1000;
  return accounts.reduce((summary, account) => {
    summary.total += 1;
    if (account.accountStatus === "pending_first_login") summary.pendingFirstLogin += 1;
    if (account.accountStatus === "active") summary.active += 1;
    if (account.accountStatus === "disabled") summary.disabled += 1;
    const expiry = account.temporaryPasswordExpiresAt
      ? new Date(account.temporaryPasswordExpiresAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (account.accountStatus === "pending_first_login" && expiry >= nowTime && expiry <= soon) {
      summary.expiringSoon += 1;
    }
    return summary;
  }, { total: 0, pendingFirstLogin: 0, active: 0, disabled: 0, expiringSoon: 0 });
}

export function filterStaffAccounts(accounts: StaffCollectionAccount[], filters: StaffFilters) {
  const search = filters.search.trim().toLowerCase();
  return accounts.filter((account) => {
    if (filters.role !== "all" && account.role !== filters.role) return false;
    if (filters.status !== "all" && account.accountStatus !== filters.status) return false;
    if (!search) return true;
    return `${account.displayName ?? ""} ${account.email}`.toLowerCase().includes(search);
  });
}

export function canManageStaffAccount(viewerRole: StaffViewerRole, account: StaffCollectionAccount) {
  return viewerRole === "admin" && account.role !== "admin";
}

export function staffSecurityLabel(account: StaffCollectionAccount, now = new Date()) {
  if (account.accountStatus === "disabled") return "Access blocked";
  if (account.accountStatus !== "pending_first_login") {
    return account.mfaEnrolled ? "MFA enrolled" : "Password set";
  }
  if (!account.temporaryPasswordExpiresAt) return "Reset required";
  const difference = new Date(account.temporaryPasswordExpiresAt).getTime() - now.getTime();
  if (difference < 0) return "Expired";
  const days = Math.max(1, Math.ceil(difference / DAY_MS));
  return `Expires in ${days} ${days === 1 ? "day" : "days"}`;
}

export function formatStaffDate(value?: string, timeZone?: string) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
}
