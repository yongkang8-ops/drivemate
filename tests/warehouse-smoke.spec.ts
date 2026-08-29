import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("warehouse opens the scoped label-first inbound desk", async ({ page }) => {
  await page.goto("/warehouse");
  await expect(page.getByRole("heading", { name: "Inbound operations" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Label print" })).toHaveClass(/is-active/);
  await expect(page.getByText("Physical print confirmation required")).toBeVisible();
  await expect(page.getByText("DM-GWM-OF-001", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Receive stock" })).toHaveAttribute("aria-disabled", "true");
});
