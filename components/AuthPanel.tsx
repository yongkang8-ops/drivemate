"use client";

import {
  CheckCircle,
  Info,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { confirmWorkspaceExit } from "../hooks/useUnsavedChanges";
import { useHydrated } from "../hooks/useHydrated";
import { buildApiHeaders, type AuthenticatedRole } from "../lib/clientAuth";
import {
  passwordSetupDestination,
  resolveWorkspaceDestination,
} from "../lib/workspaceRouting";

type Profile = {
  role?: string;
  displayName?: string | null;
};
type AuthPanelProps = {
  expectedRole: AuthenticatedRole;
  onAccessChange?: (hasAccess: boolean, role?: string) => void;
  entryNext?: string | null;
  redirectToWorkspace?: boolean;
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

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function AuthPanel({ expectedRole, onAccessChange, entryNext, redirectToWorkspace = false }: AuthPanelProps) {
  const hydrated = useHydrated();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [configured, setConfigured] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [requestingRecovery, setRequestingRecovery] = useState(false);
  const recoveryPending = useRef(false);
  const logoutPending = useRef(false);
  const lifecycleVersion = useRef(0);
  const [notice, setNotice] = useState<AuthNotice>({
    tone: "info",
    text: "Checking your session.",
  });
  const NoticeIcon = noticeIcons[notice.tone];
  function intendedWorkspaceRoute() {
    if (entryNext !== undefined) return entryNext;
    if (typeof window === "undefined") return null;
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }
  async function refreshSession() {
    const version = lifecycleVersion.current;
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const body = (await responseBody(response)) as {
        authenticated?: boolean;
        profile?: Profile;
        message?: string;
        code?: "account_disabled" | "reauthentication_required";
        passwordChangeRequired?: boolean;
      };
      if (version !== lifecycleVersion.current) return;

      if (!response.ok || !body.authenticated || !body.profile) {
        if (localDemoWorkspaceEnabled()) {
          setConfigured(false);
          setProfile(null);
          setNotice({
            tone: "info",
            text: "Demo workspace active for local testing.",
          });
          onAccessChange?.(true, expectedRole);
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
        window.location.assign(passwordSetupDestination(intendedWorkspaceRoute()));
        return;
      }

      const nextProfile = body.profile;
      if (redirectToWorkspace) {
        const destination = resolveWorkspaceDestination(nextProfile.role, entryNext);
        if (destination) {
          setPassword("");
          window.location.assign(destination);
          return;
        }
      }
      const hasAccess = roleCanAccess(nextProfile.role, expectedRole);
      setProfile(nextProfile);
      onAccessChange?.(hasAccess, nextProfile.role);
      setNotice({
        tone: hasAccess ? "success" : "error",
        text: hasAccess
          ? "Session active."
          : "Your account does not have access to this workspace.",
      });
    } catch {
      if (version !== lifecycleVersion.current) return;
      setProfile(null);
      const demoWorkspaceEnabled = localDemoWorkspaceEnabled();
      setConfigured(!demoWorkspaceEnabled);
      onAccessChange?.(demoWorkspaceEnabled, demoWorkspaceEnabled ? expectedRole : undefined);
      setNotice({
        tone: demoWorkspaceEnabled ? "info" : "error",
        text: demoWorkspaceEnabled
          ? "Demo mode active until Supabase Auth is configured."
          : "Authentication is temporarily unavailable. You can still try to sign in.",
      });
    }
  }

  async function signIn() {
    if (signingIn) return;
    const version = lifecycleVersion.current;
    setSigningIn(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await responseBody(response)) as {
        ok?: boolean;
        message?: string;
        passwordChangeRequired?: boolean;
      };
      if (version !== lifecycleVersion.current) return;
      if (!response.ok || !body.ok) {
        setNotice({
          tone: "error",
          text:
            (typeof body.message === "string" ? body.message : "") ||
            (response.headers.get("content-type")?.includes("application/json")
              ? "Sign-in failed. Check the account details and try again."
              : "Sign-in is temporarily unavailable. Try again."),
        });
        return;
      }

      if (body.passwordChangeRequired) {
        onAccessChange?.(false);
        setNotice({
          tone: "warning",
          text: "Complete your password setup before opening the workspace.",
        });
        setPassword("");
        window.location.assign(passwordSetupDestination(intendedWorkspaceRoute()));
        return;
      }

      setPassword("");
      await refreshSession();
    } catch {
      setNotice({
        tone: "error",
        text: "Sign-in is temporarily unavailable. Try again.",
      });
    } finally {
      setSigningIn(false);
    }
  }

  async function requestPasswordReset() {
    if (recoveryPending.current || signingIn) return;
    if (!email.trim()) {
      setNotice({
        tone: "warning",
        text: "Enter your email address before requesting a password reset.",
      });
      return;
    }
    const version = lifecycleVersion.current;
    recoveryPending.current = true;
    setRequestingRecovery(true);
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await responseBody(response)) as { ok?: boolean; message?: string };
      if (version !== lifecycleVersion.current) return;
      const recoveryRequested = response.ok && body.ok;
      setNotice({
        tone: recoveryRequested ? "success" : "error",
        text: recoveryRequested
          ? "If this is an approved account, a recovery email has been sent. Open it in this browser."
          : body.message ||
            "Password recovery could not be requested. Try again later.",
      });
    } catch {
      if (version !== lifecycleVersion.current) return;
      setNotice({
        tone: "error",
        text: "Password recovery could not be requested. Try again later.",
      });
    } finally {
      recoveryPending.current = false;
      setRequestingRecovery(false);
    }
  }

  async function signOut() {
    if (logoutPending.current || !confirmWorkspaceExit()) return;
    logoutPending.current = true;
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: await buildApiHeaders(expectedRole),
      });
      const body = await responseBody(response);
      if (!response.ok || body.ok !== true) throw new Error("logout_unconfirmed");
      setProfile(null);
      onAccessChange?.(false);
      setNotice({ tone: "success", text: "You have been signed out." });
    } catch {
      setNotice({ tone: "error", text: "Sign-out could not be confirmed. Your session may still be active. Check the connection and try again." });
    } finally {
      logoutPending.current = false;
      setSigningOut(false);
    }
  }

  useEffect(() => {
    void refreshSession();
    const suspend = () => {
      lifecycleVersion.current++;
      // Purge protected children and credentials before a page can be kept in
      // browser back/forward cache. Restoring always requires a fresh session.
      flushSync(() => { setPassword(""); setProfile(null); onAccessChange?.(false); });
    };
    const resume = (event: PageTransitionEvent) => { if (event.persisted) void refreshSession(); };
    window.addEventListener("pagehide", suspend);
    window.addEventListener("pageshow", resume);
    return () => { lifecycleVersion.current++; window.removeEventListener("pagehide", suspend); window.removeEventListener("pageshow", resume); };
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
          <button className="secondary-button" disabled={signingOut} onClick={signOut} type="button">
            {signingOut ? "Signing out…" : "Sign out"}
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
              disabled={!hydrated || signingIn || requestingRecovery}
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
                disabled={!hydrated || requestingRecovery || signingIn}
                onClick={() => void requestPasswordReset()}
                type="button"
              >
                {requestingRecovery ? "Requesting recovery…" : "Forgot password?"}
              </button>
            </span>
            <input
              autoComplete="current-password"
              disabled={!hydrated || signingIn}
              id="drivemate-login-password"
              placeholder="Enter your password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <button className="primary-button auth-submit" disabled={!hydrated || signingIn || requestingRecovery} type="submit">
            {signingIn ? "Signing in…" : "Sign in"}
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
