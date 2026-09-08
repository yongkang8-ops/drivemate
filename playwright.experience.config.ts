import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  outputDir: "test-results-experience",
  testMatch: [/experience-.*\.spec\.ts/, /warehouse-label-v4\.spec\.ts/, /warehouse-label-print\.spec\.ts/],
  testIgnore: [/experience-trade\.spec\.ts/],
  projects: [
    { name: "experience-chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "experience-webkit", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
});
