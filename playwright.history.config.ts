import { defineConfig, devices } from "@playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  testMatch: /experience-(history-guard|scope-context)\.spec\.ts/,
  outputDir: "test-results-history",
  projects: [
    { name: "history-edge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
    { name: "history-webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
