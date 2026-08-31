"use client";

import { type ReactNode, useState } from "react";
import { type AuthenticatedRole } from "../lib/clientAuth";
import { AuthPanel } from "./AuthPanel";
import { MfaStepUpProvider } from "./MfaStepUpProvider";

type RoleGateProps = {
  expectedRole: AuthenticatedRole;
  children: ReactNode;
};

export function RoleGate({ expectedRole, children }: RoleGateProps) {
  const [hasAccess, setHasAccess] = useState(false);

  return (
    <MfaStepUpProvider role={expectedRole}>
      <AuthPanel expectedRole={expectedRole} onAccessChange={setHasAccess} />
      {hasAccess ? (
        children
      ) : (
        <section className="panel">
          <h2>Workspace access required</h2>
          <p>Sign in with an approved account to load this workspace.</p>
        </section>
      )}
    </MfaStepUpProvider>
  );
}
