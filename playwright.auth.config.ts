import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    /account-access-polish\.spec\.ts/,
    /auth-panel-redesign\.spec\.ts/,
    /auth-entry\.spec\.ts/,
    /staff-role-acceptance\.spec\.ts/,
  ],
  workers: 1,
  outputDir: "test-results-auth",
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3242",
    url: "http://127.0.0.1:3242",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DRIVEMATE_REPOSITORY: "memory",
      DRIVEMATE_ENABLE_DEMO_AUTH: "true",
      NEXT_PUBLIC_SHOW_INTERNAL_NAV: "false",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3242",
      DRIVEMATE_TURNSTILE_REQUIRED: "false",
      REQUIRE_SUPABASE_USERS: "false",
      REQUIRE_SUPABASE_STORAGE: "false",
    },
  },
  use: {
    baseURL: "http://127.0.0.1:3242",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "auth-edge",
      use: { ...devices["Desktop Edge"], channel: "msedge" },
    },
    { name: "auth-chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "auth-webkit", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
});
