export const HISTORY_ENTRY_INDEX = "__drivemateHistoryIndex";

export function withHistoryEntryIndex(state: unknown, index: number): Record<string, unknown> {
  const existing = state && typeof state === "object" && !Array.isArray(state)
    ? state as Record<string, unknown>
    : {};
  return { ...existing, [HISTORY_ENTRY_INDEX]: index };
}

export function historyEntryIndex(state: unknown): number | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)[HISTORY_ENTRY_INDEX];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
