"use client";
import { FormEvent, useState } from "react";
import { Key, CheckCircle } from "@phosphor-icons/react";
import { buildApiHeaders } from "../lib/clientAuth";

export function PasswordSetupForm() {
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [message, setMessage] = useState("Use 12 or more characters with upper and lower case, a number and a symbol.");
  async function submit(event: FormEvent) { event.preventDefault(); if (password !== confirm) { setMessage("Passwords do not match."); return; } const response = await fetch("/api/auth/password-setup", { method: "POST", headers: await buildApiHeaders("trade", { "Content-Type": "application/json" }), body: JSON.stringify({ password }) }); const body = await response.json(); setMessage(response.ok && body.ok ? "Password updated. You can now open the Trade Portal." : body.message || "Password could not be updated."); }
  return <form className="password-form panel" onSubmit={submit}><Key size={28} weight="duotone" /><label>New password<input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label><label>Confirm password<input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label><button className="button button-primary" type="submit">Set password</button><p role="status"><CheckCircle size={17} />{message}</p></form>;
}
