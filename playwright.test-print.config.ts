import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: /warehouse-test-print\.spec\.ts/,
  testIgnore: [],
  outputDir: "test-results-test-print",
  projects: [
    {
      name: "test-print-chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "test-print-webkit",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
  ],
});
