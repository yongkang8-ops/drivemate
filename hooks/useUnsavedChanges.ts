"use client";

import { useEffect, useRef } from "react";

export function confirmDiscardChanges(dirty: boolean): boolean {
  return !dirty || window.confirm("You have unsaved changes. Discard them and continue?");
}

const dirtyReaders = new Set<() => boolean>();

// Programmatic workspace teardown (for example sign-out) has no unload event.
export function confirmWorkspaceExit(): boolean {
  return confirmDiscardChanges(Array.from(dirtyReaders).some(readDirty => readDirty()));
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (!Array.from(dirtyReaders).some(readDirty => readDirty())) return;
  event.preventDefault();
  event.returnValue = "";
}

// One native warning for every mounted editor. No history patching, stored
// drafts, or click confirmation that would duplicate the unload warning.
export function useUnsavedChanges(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const readDirty = () => dirtyRef.current;
    if (dirtyReaders.size === 0) window.addEventListener("beforeunload", beforeUnload);
    dirtyReaders.add(readDirty);
    return () => {
      dirtyReaders.delete(readDirty);
      if (dirtyReaders.size === 0) window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);
}
