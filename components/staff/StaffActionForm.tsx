"use client";

import { type FormEvent, useEffect, useState } from "react";
import type { StaffCreatableRole } from "../../lib/repository";
import type { StaffCollectionAccount } from "../../lib/staffUi";

export type StaffActionKind = "change_role" | "reset_password" | "reset_mfa" | "disable" | "reenable";
export type StaffActionPayload =
  | { action: "change_role"; role: StaffCreatableRole; reason: string }
  | { action: "reset_password"; reason: string }
  | { action: "reset_mfa"; reason: string }
  | { action: "disable"; reason: string }
  | { action: "reenable" };

const actionContent: Record<StaffActionKind, { title: string; submit: string; note: string }> = {
  change_role: { title: "Change staff role", submit: "Apply role change", note: "The user must sign in again before the new role takes effect." },
  reset_password: { title: "Reset staff password", submit: "Generate new password", note: "The current password will stop working and a new one-time password will be shown once." },
  reset_mfa: { title: "Reset staff MFA", submit: "Reset MFA", note: "All registered authenticator factors will be removed." },
  disable: { title: "Disable staff account", submit: "Disable account", note: "DriveMate access will be blocked immediately." },
  reenable: { title: "Re-enable staff account", submit: "Re-enable account", note: "The account will return to its previous lifecycle state and must sign in again." },
};

export function staffActionTitle(action: StaffActionKind) {
  return actionContent[action].title;
}

export function StaffActionForm({
  account,
  action,
  busy,
  onCancel,
  onSubmit,
  onDirtyChange,
}: {
  account: StaffCollectionAccount;
  action: StaffActionKind;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: StaffActionPayload) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [role, setRole] = useState<StaffCreatableRole>(account.role === "partner" ? "warehouse_staff" : "partner");
  const [reason, setReason] = useState("");
  useEffect(() => { onDirtyChange?.(Boolean(reason || role !== (account.role === "partner" ? "warehouse_staff" : "partner"))); }, [reason, role, account.role, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const content = actionContent[action];

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (action === "reenable") return onSubmit({ action });
    if (action === "change_role") return onSubmit({ action, role, reason: trimmedReason });
    return onSubmit({ action, reason: trimmedReason });
  }

  return (
    <form className="staff-form" onSubmit={submit}>
      {action === "change_role" ? <label>New role<select disabled={busy} aria-label="New role" onChange={(event) => setRole(event.target.value as StaffCreatableRole)} value={role}><option value="warehouse_staff">Warehouse staff</option><option value="partner">Partner</option></select></label> : null}
      {action !== "reenable" ? <label>Reason<textarea disabled={busy} aria-label="Reason" maxLength={1000} onChange={(event) => setReason(event.target.value)} required value={reason} /></label> : null}
      <div className="staff-form-note">{content.note} This sensitive operation requires administrator MFA and is retained in audit history.</div>
      <div className="staff-form-actions"><button className="button button-secondary" disabled={busy} onClick={onCancel} type="button">Cancel</button><button className={`button ${action === "disable" ? "button-danger" : "button-primary"}`} disabled={busy} type="submit">{busy ? "Submitting" : content.submit}</button></div>
    </form>
  );
}
