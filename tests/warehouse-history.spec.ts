import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("receipt history is read-only and displays timezone-aware putaway audit rows", async ({ page }) => {
  await page.goto("/warehouse");

  await expect(page.getByRole("link", { name: "Receipt history" })).not.toHaveAttribute("aria-disabled", "true");
  await page.getByRole("link", { name: "Receipt history" }).click();
  await expect(page.getByRole("heading", { name: "Receipt history" })).toBeVisible();
  await expect(page.getByText("No audit events match this view")).toBeVisible();
  await expect(page.getByLabel("Display timezone")).toHaveValue("Australia/Brisbane");
  await page.getByLabel("Display timezone").selectOption("Asia/Shanghai");
  await expect(page.locator(".inbound-history-timezone")).toHaveText("China Standard Time");
});
