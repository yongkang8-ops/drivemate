"use client";

import Script from "next/script";
import Link from "next/link";
import { CheckCircle, PaperPlaneTilt } from "@phosphor-icons/react";
import { FormEvent, useEffect, useState } from "react";

declare global { interface Window { drivemateTurnstile?: (token: string) => void } }
type FormState = { accountName: string; abn: string; contactName: string; contactEmail: string; contactPhone: string; postcode: string; notes: string };
const emptyForm: FormState = { accountName: "", abn: "", contactName: "", contactEmail: "", contactPhone: "", postcode: "", notes: "" };

export function TradeAccountApplicationForm() {
  const [form, setForm] = useState(emptyForm);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [tradeTermsConsent, setTradeTermsConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("Applications are reviewed before account activation.");
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  useEffect(() => { window.drivemateTurnstile = setTurnstileToken; return () => { delete window.drivemateTurnstile; }; }, []);
  function update(field: keyof FormState, value: string) { setForm((current) => ({ ...current, [field]: value })); }

  async function submitApplication(event: FormEvent) {
    event.preventDefault(); setStatus("submitting"); setMessage("Submitting your application...");
    const response = await fetch("/api/trade-account-applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, privacyConsent, tradeTermsConsent, consentVersion: "2026-08-21", turnstileToken }) });
    const body = await response.json();
    if (!response.ok || !body.ok) { setStatus("error"); setMessage(body.message || "Account application could not be submitted. Check the details and try again."); return; }
    setStatus("success"); setMessage(`Application ${body.application.id} has been received.`); setForm(emptyForm); setPrivacyConsent(false); setTradeTermsConsent(false); setTurnstileToken("");
  }

  return <form className="account-form" onSubmit={submitApplication}>
    {siteKey && <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer /><div className="cf-turnstile" data-sitekey={siteKey} data-callback="drivemateTurnstile" /></>}
    <div className="form-section"><div><span>01</span><h2>Business details</h2></div><div className="form-grid"><label>Workshop or business name<input required value={form.accountName} onChange={(e) => update("accountName", e.target.value)} /></label><label>ABN<input value={form.abn} inputMode="numeric" onChange={(e) => update("abn", e.target.value)} /></label></div></div>
    <div className="form-section"><div><span>02</span><h2>Primary contact</h2></div><div className="form-grid"><label>Contact name<input required value={form.contactName} onChange={(e) => update("contactName", e.target.value)} /></label><label>Contact email<input required type="email" value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} /></label><label>Contact phone<input required value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} /></label><label>Postcode<input value={form.postcode} inputMode="numeric" onChange={(e) => update("postcode", e.target.value)} /></label></div></div>
    <div className="form-section"><div><span>03</span><h2>Workshop needs</h2></div><label>Vehicles, parts or account notes<textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Brands serviced, common vehicles, delivery area or purchasing contact" /></label></div>
    <div className="consent-stack"><label className="check-row"><input type="checkbox" checked={privacyConsent} onChange={(e) => setPrivacyConsent(e.target.checked)} /><span>I have read the <Link href="/privacy">Privacy Policy</Link> and consent to DriveMate using these details to assess the application.</span></label><label className="check-row"><input type="checkbox" checked={tradeTermsConsent} onChange={(e) => setTradeTermsConsent(e.target.checked)} /><span>I agree that approved use of the account will be subject to the <Link href="/trade-terms">Trade Terms</Link>.</span></label></div>
    <div className="form-submit"><button className="button button-primary" disabled={status === "submitting" || !privacyConsent || !tradeTermsConsent} type="submit">Submit application<PaperPlaneTilt size={18} weight="bold" /></button><p className={`form-message ${status}`} role="status">{status === "success" && <CheckCircle size={18} weight="fill" />}{message}</p></div>
  </form>;
}
