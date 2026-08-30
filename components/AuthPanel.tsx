"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "@phosphor-icons/react";
import { buildApiHeaders, type AuthenticatedRole } from "../lib/clientAuth";

type Profile = {
  role?: string;
  displayName?: string | null;
};
type MfaFactor = { id: string; friendlyName?: string; status: string };
type MfaEnrollment = { factorId: string; qrCode: string; secret: string };

type AuthPanelProps = {
  expectedRole: AuthenticatedRole;
  onAccessChange?: (hasAccess: boolean) => void;
};

function roleCanAccess(
  role: string | undefined,
  expectedRole: AuthenticatedRole,
): boolean {
  if (expectedRole === "admin") return role === "admin";
  if (expectedRole === "partner")
    return role === "partner" || role === "admin";
  return role === "trade";
}

function localDemoWorkspaceEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_SHOW_INTERNAL_NAV === "true"
  );
}

export function AuthPanel({ expectedRole, onAccessChange }: AuthPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [configured, setConfigured] = useState(true);
  const [message, setMessage] = useState("Checking session.");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaFactors, setMfaFactors] = useState<MfaFactor[]>([]);
  const [mfaEnrollment, setMfaEnrollment] = useState<MfaEnrollment | null>(
    null,
  );
  const [mfaCode, setMfaCode] = useState("");

  async function loadMfa() {
    const response = await fetch("/api/auth/mfa", { cache: "no-store" });
    const body = (await response.json()) as {
      ok?: boolean;
      factors?: MfaFactor[];
      message?: string;
    };
    if (!response.ok || !body.ok) {
      setMessage(body.message || "MFA status could not be loaded.");
      return;
    }
    setMfaFactors(body.factors ?? []);
  }

  async function refreshSession() {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const body = (await response.json()) as {
        authenticated?: boolean;
        profile?: Profile;
        mfaRequired?: boolean;
        message?: string;
      };

      if (!response.ok || !body.authenticated || !body.profile) {
        if (localDemoWorkspaceEnabled()) {
          setConfigured(false);
          setProfile(null);
          setMessage("Demo workspace active for local testing.");
          onAccessChange?.(true);
          return;
        }

        setProfile(null);
        setMessage("Sign in with an approved account to use live access.");
        onAccessChange?.(false);
        return;
      }

      const nextProfile = body.profile;
      const hasAccess = roleCanAccess(nextProfile.role, expectedRole);
      setProfile(nextProfile);
      setMfaRequired(Boolean(body.mfaRequired));
      onAccessChange?.(hasAccess && !body.mfaRequired);
      if (body.mfaRequired) await loadMfa();
      setMessage(
        body.mfaRequired
          ? "Multi-factor verification is required for this staff account."
          : hasAccess
            ? "Session active."
            : "Signed-in role cannot access this workspace.",
      );
    } catch {
      setConfigured(false);
      setProfile(null);
      const demoWorkspaceEnabled = process.env.NODE_ENV !== "production";
      onAccessChange?.(demoWorkspaceEnabled);
      setMessage(
        demoWorkspaceEnabled
          ? "Demo mode active until Supabase Auth is configured."
          : "Supabase Auth must be configured before this workspace can be used.",
      );
    }
  }

  async function signIn() {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };
      if (!response.ok || !body.ok) {
        setMessage(
          body.message ||
            "Sign-in failed. Check the account details and try again.",
        );
        return;
      }

      await refreshSession();
    } catch {
      setConfigured(false);
      setMessage("Supabase Auth is not configured in this environment.");
    }
  }

  async function requestPasswordReset() {
    if (!email.trim()) {
      setMessage("Enter your email address first.");
      return;
    }
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      setMessage(
        response.ok && body.ok
          ? "If this is an approved account, a recovery email has been sent. Open it in this browser."
          : body.message || "Password recovery could not be requested. Try again later.",
      );
    } catch {
      setMessage("Password recovery could not be requested. Try again later.");
    }
  }

  async function signOut() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: await buildApiHeaders(expectedRole),
      });
    } finally {
      setProfile(null);
      setMfaRequired(false);
      setMfaEnrollment(null);
      setMfaFactors([]);
      onAccessChange?.(false);
      setMessage("Signed out.");
    }
  }

  async function startMfaEnrollment() {
    const response = await fetch("/api/auth/mfa", {
      method: "POST",
      headers: await buildApiHeaders(expectedRole, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ friendlyName: "DriveMate staff authenticator" }),
    });
    const body = (await response.json()) as
      ({ ok: true } & MfaEnrollment) | { ok: false; message?: string };
    if (!response.ok || !body.ok) {
      setMessage(
        "message" in body
          ? body.message || "MFA setup could not be started."
          : "MFA setup could not be started.",
      );
      return;
    }
    setMfaEnrollment(body);
    setMessage("Scan the QR code, then enter the six-digit code.");
  }

  async function verifyMfa() {
    const factorId =
      mfaEnrollment?.factorId ??
      mfaFactors.find((factor) => factor.status === "verified")?.id;
    if (!factorId) {
      setMessage("Start authenticator setup first.");
      return;
    }
    const response = await fetch("/api/auth/mfa/verify", {
      method: "POST",
      headers: await buildApiHeaders(expectedRole, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ factorId, code: mfaCode }),
    });
    const body = (await response.json()) as { ok?: boolean; message?: string };
    if (!response.ok || !body.ok) {
      setMessage(body.message || "Authenticator code was not accepted.");
      return;
    }
    setMfaCode("");
    setMfaEnrollment(null);
    setMfaRequired(false);
    await refreshSession();
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  return (
    <section className="panel auth-panel" aria-label="Account session">
      <div>
        <p className="eyebrow">Account access</p>
        <h2>{expectedRole === "trade" ? "Trade login" : "Staff login"}</h2>
        <p>
          {profile
            ? `${profile.displayName ?? "Signed-in user"} | ${profile.role ?? "role pending"}`
            : "Approved users can sign in with email and password."}
        </p>
      </div>

      <div className="auth-actions">
        {profile ? (
          <button className="secondary-button" onClick={signOut} type="button">
            Sign out
          </button>
        ) : configured ? (
          <>
            <input
              aria-label="Email"
              autoComplete="email"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <input
              aria-label="Password"
              autoComplete="current-password"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button className="primary-button" onClick={signIn} type="button">
              Sign in
            </button>
            <button className="secondary-button" onClick={() => void requestPasswordReset()} type="button">
              Forgot password
            </button>
          </>
        ) : (
          <span className="badge">Demo access</span>
        )}
      </div>

      <span className="badge" aria-live="polite">
        {message}
      </span>
      {profile && mfaRequired ? (
        <div className="mfa-panel">
          <div>
            <ShieldCheck size={24} weight="duotone" />
            <strong>Staff verification</strong>
            <p>
              {mfaFactors.some((factor) => factor.status === "verified")
                ? "Enter the code from your authenticator app."
                : "Set up an authenticator before accessing staff operations."}
            </p>
          </div>
          {!mfaFactors.some((factor) => factor.status === "verified") &&
          !mfaEnrollment ? (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void startMfaEnrollment()}
            >
              Set up authenticator
            </button>
          ) : null}
          {mfaEnrollment ? (
            <div className="mfa-enrollment">
              <img
                src={
                  mfaEnrollment.qrCode.startsWith("data:")
                    ? mfaEnrollment.qrCode
                    : `data:image/svg+xml;utf8,${encodeURIComponent(mfaEnrollment.qrCode)}`
                }
                alt="Authenticator setup QR code"
              />
              <p>
                Manual key: <code>{mfaEnrollment.secret}</code>
              </p>
            </div>
          ) : null}
          {mfaEnrollment ||
          mfaFactors.some((factor) => factor.status === "verified") ? (
            <div className="mfa-code">
              <label>
                Six-digit code
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(event) =>
                    setMfaCode(event.target.value.replace(/\D/g, ""))
                  }
                />
              </label>
              <button
                className="button button-primary"
                type="button"
                onClick={() => void verifyMfa()}
              >
                Verify
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
