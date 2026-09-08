import { describe, expect, it } from "vitest";
import { historyEntryIndex, withHistoryEntryIndex } from "../lib/historyGuard";

describe("history guard state", () => {
  it("preserves opaque Next history fields while adding a traversal index", () => {
    const nextState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["", {}], custom: "keep" };
    const guarded = withHistoryEntryIndex(nextState, 7);
    expect(guarded).toMatchObject(nextState);
    expect(historyEntryIndex(guarded)).toBe(7);
  });

  it("does not mutate the caller's state", () => {
    const state = { __NA: true };
    const guarded = withHistoryEntryIndex(state, 2);
    expect(guarded).not.toBe(state);
    expect(historyEntryIndex(state)).toBeNull();
  });

  it("handles missing and malformed indices", () => {
    expect(historyEntryIndex(null)).toBeNull();
    expect(historyEntryIndex({ __drivemateHistoryIndex: -1 })).toBeNull();
    expect(historyEntryIndex({ __drivemateHistoryIndex: 1.5 })).toBeNull();
  });
});
