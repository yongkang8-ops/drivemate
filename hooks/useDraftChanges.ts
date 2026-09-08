"use client";

import { useEffect, useState } from "react";
import { useUnsavedChanges } from "./useUnsavedChanges";

// Ephemeral baseline only. Call markSaved only after a confirmed result or an
// intentional load; a lost response must keep the draft dirty.
export function useDraftChanges(value: unknown) {
  const signature = JSON.stringify(value);
  const [baseline, setBaseline] = useState(signature);
  const [savedVersion, setSavedVersion] = useState(0);
  useEffect(() => { setBaseline(signature); }, [savedVersion]);
  const dirty = signature !== baseline;
  useUnsavedChanges(dirty);
  return [dirty, () => setSavedVersion(version => version + 1)] as const;
}
