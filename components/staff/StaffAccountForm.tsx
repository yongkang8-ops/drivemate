"use client";

import { type FormEvent, useState } from "react";
import type { StaffCreatableRole } from "../../lib/repository";

export type CreateStaffValues = { displayName: string; email: string; role: StaffCreatableRole };

export function StaffAccountForm({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (values: CreateStaffValues) => Promise<void> }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffCreatableRole>("warehouse_staff");

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({ displayName: displayName.trim(), email: email.trim(), role });
  }

  return (
    <form className="staff-form" onSubmit={submit}>
      <label>Full name<input autoComplete="name" maxLength={160} onChange={(event) => setDisplayName(event.target.value)} required value={displayName} /></label>
      <label>Personal work email<input autoComplete="email" maxLength={320} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
      <label>Role<select onChange={(event) => setRole(event.target.value as StaffCreatableRole)} value={role}><option value="warehouse_staff">Warehouse staff</option><option value="partner">Partner</option></select></label>
      <div className="staff-form-note">The system generates a strong one-time password valid for seven days. It is displayed once and is never emailed or stored in readable form.</div>
      <div className="staff-form-actions"><button className="button button-secondary" disabled={busy} onClick={onCancel} type="button">Cancel</button><button className="button button-primary" disabled={busy} type="submit">{busy ? "Creating account" : "Create account"}</button></div>
    </form>
  );
}
