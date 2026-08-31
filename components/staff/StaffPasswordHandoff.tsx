"use client";

import { CopySimple } from "@phosphor-icons/react";
import { useState } from "react";
import { formatStaffDate, type StaffCollectionAccount } from "../../lib/staffUi";

export function StaffPasswordHandoff({ account, password, expiresAt, onFinish }: { account: StaffCollectionAccount; password: string; expiresAt: string; onFinish: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  async function copyPassword() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
  }
  return (
    <div className="staff-drawer-body staff-password-handoff">
      <div className="staff-security-note">This password is shown once. Deliver it through a separate secure channel and do not place it in email, chat history or notes.</div>
      <div className="staff-handoff-account"><strong>{account.displayName}</strong><span>{account.email} · Pending first login</span></div>
      <div className="staff-password-box"><span>One-time password · Expires {formatStaffDate(expiresAt)}</span><code>{password}</code><button onClick={() => void copyPassword()} type="button"><CopySimple size={16} />{copied ? "Copied" : "Copy password"}</button></div>
      <label className="staff-handoff-confirm"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />I confirm that I delivered the password securely to the intended staff member.</label>
      <div className="staff-form-actions"><button className="button button-primary" disabled={!confirmed} onClick={onFinish} type="button">Finish and close</button></div>
    </div>
  );
}
