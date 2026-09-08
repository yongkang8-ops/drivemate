"use client";

import { useEffect, useState } from "react";

// SSR controls must not accept typing before React has attached the handlers
// and restored URL state; otherwise a fast user can lose an apparent draft.
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  return hydrated;
}
