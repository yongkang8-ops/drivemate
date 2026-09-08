import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.ts/,
  testIgnore: [
    /experience-trade\.spec\.ts/,
    /auth-entry\.spec\.ts/,
    /account-access-polish\.spec\.ts/,
    /auth-panel-redesign\.spec\.ts/,
    /staff-role-acceptance\.spec\.ts/,
  ],
  workers: 1,
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DRIVEMATE_REPOSITORY: "memory",
      DRIVEMATE_ENABLE_DEMO_AUTH: "true",
      NEXT_PUBLIC_SHOW_INTERNAL_NAV: "true",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
      DRIVEMATE_TURNSTILE_REQUIRED: "false",
      REQUIRE_SUPABASE_USERS: "false",
      REQUIRE_SUPABASE_STORAGE: "false",
    },
  },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "edge",
      use: { ...devices["Desktop Edge"], channel: "msedge" },
    },
  ],
});
