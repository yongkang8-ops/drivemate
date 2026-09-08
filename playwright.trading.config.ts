import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// Isolated local-memory coverage only. Never reads or writes Production settings.
process.env.DRIVEMATE_TRADING_ENABLED = "true";
process.env.DRIVEMATE_GST_REGISTERED = "true";
const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer!;
export default defineConfig({
  ...base,
  testMatch: [/api-routes\.spec\.ts/, /experience-trade\.spec\.ts/],
  testIgnore: [],
  outputDir: "test-results-trading",
  projects: [
    { name: "trading-edge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
    { name: "trading-chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "trading-webkit", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
  webServer: {
    ...server,
    reuseExistingServer: false,
    env: {
      ...server.env,
      DRIVEMATE_TRADING_ENABLED: "true",
      DRIVEMATE_GST_REGISTERED: "true",
    },
  },
});
