"use client";

import { AuthPanel } from "./AuthPanel";

export function StaffLoginPanel({ next }: { next?: string | null }) {
  return (
    <AuthPanel
      expectedRole="partner"
      entryNext={next}
      redirectToWorkspace
    />
  );
}
