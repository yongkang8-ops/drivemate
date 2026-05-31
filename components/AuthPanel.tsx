"use client";

import { useEffect, useState } from "react";
import { type AuthenticatedRole } from "../lib/clientAuth";
import { createBrowserSupabaseClient } from "../lib/supabaseClient";

type Profile = {
  role?: string;
  display_name?: string | null;
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
      const supabase = createBrowserSupabaseClient();
      const { data: sessionResult } = await supabase.auth.getSession();

      if (!sessionResult.session) {
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

      const { data } = await supabase
        .from("user_profiles")
        .select("role, display_name")
        .eq("id", sessionResult.session.user.id)
        .maybeSingle();

      const nextProfile = (data as Profile | null) ?? { role: "profile pending" };
      const hasAccess = roleCanAccess(nextProfile.role, expectedRole);
      setProfile(nextProfile);
      onAccessChange?.(hasAccess);
      setMessage(hasAccess ? "Session active." : "Signed-in role cannot access this workspace.");
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
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
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
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
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
            ? `${profile.display_name ?? "Signed-in user"} · ${profile.role ?? "role pending"}`
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
