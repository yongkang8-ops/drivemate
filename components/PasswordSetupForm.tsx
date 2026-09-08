"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  CheckCircle,
  Info,
  Key,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { recoveryAccessTokenFromHash } from "../lib/authRecovery";
import {
  loginDestinationAfterPasswordSetup,
  safeWorkspaceNext,
} from "../lib/workspaceRouting";

type PasswordNoticeTone = "info" | "warning" | "error";
type PasswordNotice = {
  tone: PasswordNoticeTone;
  text: string;
};

const noticeIcons = {
  info: Info,
  warning: WarningCircle,
  error: XCircle,
} satisfies Record<PasswordNoticeTone, typeof Info>;

export function PasswordSetupForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState<PasswordNotice>({
    tone: "info",
    text: "Use 12 or more characters with upper and lower case, a number and a symbol.",
  });
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [continueHref, setContinueHref] = useState("/staff/login");
  const NoticeIcon = noticeIcons[notice.tone];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (password !== confirm) {
      setNotice({ tone: "warning", text: "Passwords do not match." });
      return;
    }

    setSubmitting(true);
    try {
      const accessToken = recoveryAccessTokenFromHash(window.location.hash);
      const requestedNext = safeWorkspaceNext(new URLSearchParams(window.location.search).get("next"));
      const response = await fetch("/api/auth/password-setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ password }),
      });
      let body: { ok?: boolean; message?: string } = {};
      try {
        body = await response.json();
      } catch {
        // A proxy error may not be JSON; the form remains available for a deliberate retry.
      }

      if (response.ok && body.ok) {
        window.history.replaceState(null, "", window.location.pathname);
        setPassword("");
        setConfirm("");
        setContinueHref(loginDestinationAfterPasswordSetup(requestedNext));
        setCompleted(true);
        return;
      }

      setNotice({
        tone: "error",
        text: body.message || (response.headers.get("content-type")?.includes("application/json")
          ? "Password could not be updated."
          : "Password setup is temporarily unavailable. Try again."),
      });
    } catch {
      setNotice({
        tone: "error",
        text: "Password setup is temporarily unavailable. Try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (completed) {
    return (
      <section className="password-complete panel" aria-labelledby="password-updated-title">
        <div className="password-complete-mark" aria-hidden="true">
          <CheckCircle size={32} weight="duotone" />
        </div>
        <div>
          <p className="eyebrow">Account security</p>
          <h1 id="password-updated-title">Password updated</h1>
          <p>Your DriveMate password has been set.</p>
        </div>
        <Link className="button button-primary" href={continueHref}>
          Continue to sign in
        </Link>
      </section>
    );
  }

  return (
    <form className="password-form panel" onSubmit={submit}>
      <Key size={28} weight="duotone" />
      <label>
        New password
        <input
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label>
        Confirm password
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </label>
      <button className="button button-primary" disabled={submitting} type="submit">
        {submitting ? "Setting password…" : "Set password"}
      </button>
      <div
        className={`auth-notice auth-notice--${notice.tone}`}
        aria-atomic="true"
        aria-live="polite"
      >
        <NoticeIcon aria-hidden="true" size={18} weight="fill" />
        <span>{notice.text}</span>
      </div>
    </form>
  );
}
