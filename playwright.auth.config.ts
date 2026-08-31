import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    /account-access-polish\.spec\.ts/,
    /auth-panel-redesign\.spec\.ts/,
    /staff-role-acceptance\.spec\.ts/,
  ],
  workers: 1,
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      DRIVEMATE_REPOSITORY: "memory",
      DRIVEMATE_ENABLE_DEMO_AUTH: "true",
      NEXT_PUBLIC_SHOW_INTERNAL_NAV: "false",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3101",
      DRIVEMATE_TURNSTILE_REQUIRED: "false",
      REQUIRE_SUPABASE_USERS: "false",
      REQUIRE_SUPABASE_STORAGE: "false",
    },
  },
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "auth-edge",
      use: { ...devices["Desktop Edge"], channel: "msedge" },
    },
  ],
});
