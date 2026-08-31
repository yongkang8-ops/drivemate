import { expect, test } from "@playwright/test";

test("warehouse staff demo session opens the routine warehouse workspace", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.goto("/warehouse");

  await expect(page).toHaveTitle(/^Warehouse Operations \| DriveMate Parts/);
  await expect(page.getByRole("heading", { name: "Inbound operations" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Label print" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Receive stock" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Put away" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Receipt history" })).toBeVisible();
  await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});
