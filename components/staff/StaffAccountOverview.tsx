"use client";

import { useState } from "react";
import { formatStaffDate, staffSecurityLabel, type StaffCollectionAccount, type StaffViewerRole } from "../../lib/staffUi";
import { StaffAuditTimeline, type StaffAuditItem } from "./StaffAuditTimeline";
import type { StaffActionKind } from "./StaffActionForm";

export function StaffAccountOverview({
  account,
  audit,
  viewerRole,
  canManage,
  onAction,
}: {
  account: StaffCollectionAccount;
  audit: StaffAuditItem[];
  viewerRole: StaffViewerRole;
  canManage: boolean;
  onAction: (action: StaffActionKind) => void;
}) {
  const [tab, setTab] = useState<"overview" | "audit">("overview");
  const isProtectedAdmin = account.role === "admin";
  return (
    <>
      {viewerRole === "admin" ? <div className="staff-drawer-tabs" role="tablist"><button aria-selected={tab === "overview"} onClick={() => setTab("overview")} role="tab" type="button">Overview</button><button aria-selected={tab === "audit"} onClick={() => setTab("audit")} role="tab" type="button">Audit history</button></div> : null}
      <div className="staff-drawer-body">
        {tab === "audit" && viewerRole === "admin" ? <StaffAuditTimeline audit={audit} /> : (
          <>
            <div className="staff-account-facts"><div><span>Role</span><strong>{account.role === "warehouse_staff" ? "Warehouse staff" : account.role === "admin" ? "System administrator" : "Partner"}</strong></div><div><span>Status</span><strong>{account.accountStatus.replaceAll("_", " ")}</strong></div><div><span>Last login</span><strong>{formatStaffDate(account.lastLoginAt)}</strong></div><div><span>Created</span><strong>{formatStaffDate(account.createdAt)}</strong></div><div><span>Password</span><strong>{staffSecurityLabel(account)}</strong></div><div><span>MFA</span><strong>{account.mfaEnrolled ? "Enrolled" : account.role === "warehouse_staff" ? "Not required" : "Not enrolled"}</strong></div></div>
            {isProtectedAdmin ? <div className="staff-protected-note"><strong>System administrator protection</strong><p>This account is visible for security oversight but cannot be disabled, reassigned or reset from the Staff module.</p></div> : null}
            {canManage && !isProtectedAdmin ? <><div className="staff-security-note">Sensitive account changes require administrator MFA. Completed actions and reasons are retained in audit history.</div><div className="staff-account-actions">{account.accountStatus === "disabled" ? <button onClick={() => onAction("reenable")} type="button">Re-enable account</button> : <><button onClick={() => onAction("change_role")} type="button">Change role</button><button onClick={() => onAction("reset_password")} type="button">Reset password</button><button onClick={() => onAction("reset_mfa")} type="button">Reset MFA</button><button className="is-danger" onClick={() => onAction("disable")} type="button">Disable account</button></>}</div></> : null}
          </>
        )}
      </div>
    </>
  );
}
