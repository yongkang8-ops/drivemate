import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({ ...base, outputDir: "test-results/label-v4", use: { ...base.use, baseURL: "http://127.0.0.1:3224" },
  webServer: { command: "npm run dev -- --hostname 127.0.0.1 --port 3224", url: "http://127.0.0.1:3224", reuseExistingServer: false, timeout: 120_000,
    env: { DRIVEMATE_REPOSITORY: "memory", DRIVEMATE_ENABLE_DEMO_AUTH: "true", NEXT_PUBLIC_SHOW_INTERNAL_NAV: "true", NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3224", DRIVEMATE_TURNSTILE_REQUIRED: "false", REQUIRE_SUPABASE_USERS: "false", REQUIRE_SUPABASE_STORAGE: "false" } },
});
