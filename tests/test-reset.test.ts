import { afterEach, describe, expect, it, vi } from "vitest";
import { isTestResetEnabled } from "../lib/testReset";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("test reset boundary", () => {
  it("allows the reset endpoint only for local memory-mode automation", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DRIVEMATE_REPOSITORY", "");
    expect(isTestResetEnabled()).toBe(true);

    vi.stubEnv("DRIVEMATE_REPOSITORY", "memory");
    expect(isTestResetEnabled()).toBe(true);
  });

  it("disables the reset endpoint in production and Supabase-backed runtimes", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DRIVEMATE_REPOSITORY", "");
    expect(isTestResetEnabled()).toBe(false);

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DRIVEMATE_REPOSITORY", "supabase");
    expect(isTestResetEnabled()).toBe(false);
  });
});
