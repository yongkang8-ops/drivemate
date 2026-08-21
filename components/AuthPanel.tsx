"use client";

import { useEffect, useState } from "react";
import { type AuthenticatedRole } from "../lib/clientAuth";

type Profile = {
  role?: string;
  displayName?: string | null;
};

type AuthPanelProps = {
  expectedRole: AuthenticatedRole;
  onAccessChange?: (hasAccess: boolean) => void;
};

function roleCanAccess(role: string | undefined, expectedRole: AuthenticatedRole): boolean {
  if (expectedRole === "admin") return role === "admin";
  if (expectedRole === "warehouse") return role === "warehouse" || role === "admin";
  return role === "trade";
}

function localDemoWorkspaceEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SHOW_INTERNAL_NAV === "true";
}

export function AuthPanel({ expectedRole, onAccessChange }: AuthPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [configured, setConfigured] = useState(true);
  const [message, setMessage] = useState("Checking session.");

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
      onAccessChange?.(hasAccess && !body.mfaRequired);
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
      const body = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setMessage(body.message || "Sign-in failed. Check the account details and try again.");
        return;
      }

      await refreshSession();
    } catch {
      setConfigured(false);
      setMessage("Supabase Auth is not configured in this environment.");
    }
  }

  async function signOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setProfile(null);
      onAccessChange?.(false);
      setMessage("Signed out.");
    }
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
          </>
        ) : (
          <span className="badge">Demo access</span>
        )}
      </div>

      <span className="badge" aria-live="polite">
        {message}
      </span>
    </section>
  );
}
