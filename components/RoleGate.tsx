"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import { type AuthenticatedRole } from "../lib/clientAuth";
import { AuthPanel, type AuthSessionPhase } from "./AuthPanel";
import { MfaStepUpProvider } from "./MfaStepUpProvider";
import { useHistoryScroll } from "../hooks/useHistoryScroll";

type RoleGateProps = {
  expectedRole: AuthenticatedRole;
  children: ReactNode;
};

// Presentation only: server permission checks remain authoritative.
const WorkspaceRoleContext = createContext<string | null>(null);
export function useWorkspaceRole() {
  return useContext(WorkspaceRoleContext);
}

export function RoleGate({ expectedRole, children }: RoleGateProps) {
  const [hasAccess, setHasAccess] = useState(false);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [sessionPhase, setSessionPhase] = useState<AuthSessionPhase>("checking");
  useHistoryScroll(hasAccess);

  return (
    <MfaStepUpProvider role={expectedRole}>
      <div className={expectedRole !== "trade" ? `operations-frame${hasAccess ? " has-access" : ""}${sessionPhase !== "resolved" ? " session-pending" : ""}` : "trade-frame"}>
      <AuthPanel expectedRole={expectedRole} onSessionPhaseChange={setSessionPhase} onAccessChange={(allowed, role) => {
        setHasAccess(allowed);
        setViewerRole(allowed ? role ?? null : null);
      }} />
      {hasAccess ? (
        <WorkspaceRoleContext.Provider value={viewerRole}>{children}</WorkspaceRoleContext.Provider>
      ) : sessionPhase === "resolved" ? (
        <section className="panel">
          <h2>Workspace access required</h2>
          <p>Sign in with an approved account to load this workspace.</p>
        </section>
      ) : null}
      </div>
    </MfaStepUpProvider>
  );
}
