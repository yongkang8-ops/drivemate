"use client";

import {
  CheckCircle,
  Info,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { buildApiHeaders, type AuthenticatedRole } from "../lib/clientAuth";

type Profile = {
  role?: string;
  displayName?: string | null;
};
type AuthPanelProps = {
  expectedRole: AuthenticatedRole;
  onAccessChange?: (hasAccess: boolean) => void;
};
type AuthNoticeTone = "info" | "success" | "warning" | "error";
type AuthNotice = {
  tone: AuthNoticeTone;
  text: string;
};

const noticeIcons = {
  info: Info,
  success: CheckCircle,
  warning: WarningCircle,
  error: XCircle,
} satisfies Record<AuthNoticeTone, typeof Info>;

function roleCanAccess(
  role: string | undefined,
  expectedRole: AuthenticatedRole,
): boolean {
  if (expectedRole === "admin") return role === "admin";
  if (expectedRole === "partner")
    return role === "partner" || role === "admin";
  if (expectedRole === "warehouse_staff")
    return role === "warehouse_staff" || role === "partner" || role === "admin";
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
  const [notice, setNotice] = useState<AuthNotice>({
    tone: "info",
    text: "Checking your session.",
  });
  const NoticeIcon = noticeIcons[notice.tone];
  async function refreshSession() {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const body = (await response.json()) as {
        authenticated?: boolean;
        profile?: Profile;
        message?: string;
        code?: "account_disabled" | "reauthentication_required";
        passwordChangeRequired?: boolean;
      };

      if (!response.ok || !body.authenticated || !body.profile) {
        if (localDemoWorkspaceEnabled()) {
          setConfigured(false);
          setProfile(null);
          setNotice({
            tone: "info",
            text: "Demo workspace active for local testing.",
          });
          onAccessChange?.(true);
          return;
        }

        setProfile(null);
        if (body.code === "account_disabled") {
          setNotice({ tone: "error", text: "This staff account is disabled." });
        } else if (body.code === "reauthentication_required") {
          setNotice({ tone: "warning", text: "Sign in again to continue." });
        } else {
          setNotice({
            tone: "info",
            text: "Sign in with an approved account to access this workspace.",
          });
        }
        onAccessChange?.(false);
        return;
      }

      if (body.passwordChangeRequired) {
        setProfile(body.profile);
        onAccessChange?.(false);
        setNotice({
          tone: "warning",
          text: "Complete your password setup before opening the workspace.",
        });
        window.location.assign("/password-setup");
        return;
      }

      const nextProfile = body.profile;
      const hasAccess = roleCanAccess(nextProfile.role, expectedRole);
      setProfile(nextProfile);
      onAccessChange?.(hasAccess);
      setNotice({
        tone: hasAccess ? "success" : "error",
        text: hasAccess
          ? "Session active."
          : "Your account does not have access to this workspace.",
      });
    } catch {
      setConfigured(false);
      setProfile(null);
      const demoWorkspaceEnabled = process.env.NODE_ENV !== "production";
      onAccessChange?.(demoWorkspaceEnabled);
      setNotice({
        tone: demoWorkspaceEnabled ? "info" : "error",
        text: demoWorkspaceEnabled
          ? "Demo mode active until Supabase Auth is configured."
          : "Authentication is unavailable in this environment.",
      });
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
        passwordChangeRequired?: boolean;
      };
      if (!response.ok || !body.ok) {
        setNotice({
          tone: "error",
          text:
            body.message ||
            "Sign-in failed. Check the account details and try again.",
        });
        return;
      }

      if (body.passwordChangeRequired) {
        onAccessChange?.(false);
        setNotice({
          tone: "warning",
          text: "Complete your password setup before opening the workspace.",
        });
        window.location.assign("/password-setup");
        return;
      }

      await refreshSession();
    } catch {
      setConfigured(false);
      setNotice({
        tone: "error",
        text: "Authentication is unavailable in this environment.",
      });
    }
  }

  async function requestPasswordReset() {
    if (!email.trim()) {
      setNotice({
        tone: "warning",
        text: "Enter your email address before requesting a password reset.",
      });
      return;
    }
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      const recoveryRequested = response.ok && body.ok;
      setNotice({
        tone: recoveryRequested ? "success" : "error",
        text: recoveryRequested
          ? "If this is an approved account, a recovery email has been sent. Open it in this browser."
          : body.message ||
            "Password recovery could not be requested. Try again later.",
      });
    } catch {
      setNotice({
        tone: "error",
        text: "Password recovery could not be requested. Try again later.",
      });
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
      onAccessChange?.(false);
      setNotice({ tone: "success", text: "You have been signed out." });
    }
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  return (
    <section className={`panel auth-panel${profile ? " is-authenticated" : ""}`} aria-label="Account session">
      <div className="auth-copy">
        <p className="eyebrow">Account access</p>
        <h2>{expectedRole === "trade" ? "Trade login" : "Staff login"}</h2>
        <p>
          {profile
            ? `${profile.displayName ?? "Signed-in user"} | ${profile.role ?? "role pending"}`
            : expectedRole === "trade"
              ? "Sign in with your approved trade account to continue."
              : "Sign in with your approved work account to continue."}
        </p>
      </div>

      {profile ? (
        <div className="auth-actions">
          <button className="secondary-button" onClick={signOut} type="button">
            Sign out
          </button>
        </div>
      ) : configured ? (
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void signIn();
          }}
        >
          <div className="auth-field">
            <label htmlFor="drivemate-login-email">Email address</label>
            <input
              autoComplete="email"
              id="drivemate-login-email"
              placeholder="name@company.com"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="auth-field">
            <span className="auth-field-heading">
              <label htmlFor="drivemate-login-password">Password</label>
              <button
                className="auth-forgot-link"
                onClick={() => void requestPasswordReset()}
                type="button"
              >
                Forgot password?
              </button>
            </span>
            <input
              autoComplete="current-password"
              id="drivemate-login-password"
              placeholder="Enter your password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <button className="primary-button auth-submit" type="submit">
            Sign in
          </button>
        </form>
      ) : (
        <div className="auth-actions">
          <span className="badge">Demo access</span>
        </div>
      )}

      <div
        className={`auth-notice auth-notice--${notice.tone}`}
        aria-atomic="true"
        aria-live="polite"
      >
        <NoticeIcon aria-hidden="true" size={18} weight="fill" />
        <span>{notice.text}</span>
      </div>
    </section>
  );
}
