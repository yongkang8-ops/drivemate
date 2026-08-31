import type { StaffAccountStatus, StaffRole } from "../../lib/repository";
import { formatStaffDate, staffSecurityLabel } from "../../lib/staffUi";
import type { StaffRow, StaffViewer } from "./staffTypes";

function roleLabel(role: StaffRole) {
  if (role === "warehouse_staff") return "Warehouse staff";
  if (role === "admin") return "Administrator";
  return "Partner";
}

function statusLabel(status: StaffAccountStatus) {
  if (status === "pending_first_login") return "First login";
  if (status === "disabled") return "Disabled";
  return "Active";
}

function partnerAccessLabel(account: StaffRow) {
  if (account.role === "warehouse_staff") return account.accountStatus === "disabled" ? "No access" : "Warehouse operations";
  if (account.role === "partner") return account.accountStatus === "disabled" ? "No access" : "Partner access";
  return "System administrator";
}

export function StaffRegister({
  accounts,
  viewerRole,
  onSelect,
}: {
  accounts: StaffRow[];
  viewerRole: StaffViewer;
  onSelect: (userId: string, trigger: HTMLButtonElement) => void;
}) {
  return (
    <div className="staff-table-shell">
      <table className="staff-table">
        <thead><tr><th>Staff member</th><th>Role</th><th>Status</th><th>{viewerRole === "admin" ? "Security" : "Access"}</th><th>Last login</th><th>Created</th></tr></thead>
        <tbody>
          {accounts.map((account) => (
            <tr key={account.userId}>
              <td data-label="Staff member">
                <button className="staff-row-trigger" onClick={(event) => onSelect(account.userId, event.currentTarget)} type="button">
                  <strong>{account.displayName || "Unnamed staff account"}</strong>
                  <span>{account.email}</span>
                </button>
              </td>
              <td data-label="Role">{roleLabel(account.role)}</td>
              <td data-label="Status"><span className={`staff-status is-${account.accountStatus}`}>{statusLabel(account.accountStatus)}</span></td>
              <td data-label={viewerRole === "admin" ? "Security" : "Access"}>{viewerRole === "admin" ? staffSecurityLabel(account) : partnerAccessLabel(account)}</td>
              <td data-label="Last login">{formatStaffDate(account.lastLoginAt)}</td>
              <td data-label="Created">{formatStaffDate(account.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
