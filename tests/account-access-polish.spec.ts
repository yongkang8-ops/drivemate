import { expect, test } from "@playwright/test";

test("password setup success becomes a clear staff sign-in handoff", async ({
  page,
}) => {
  await page.route("**/api/auth/password-setup", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/password-setup#access_token=recovery-token&type=recovery");
  await page.getByLabel("New password").fill("DriveMate!2026");
  await page.getByLabel("Confirm password").fill("DriveMate!2026");
  await page.getByRole("button", { name: "Set password" }).click();

  await expect(
    page.locator(".password-complete").getByRole("heading", {
      name: "Password updated",
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Your DriveMate password has been set."),
  ).toBeVisible();
  await expect(
    page.locator(".password-complete").getByRole("link", { name: "Continue to sign in" }),
  ).toHaveAttribute("href", "/staff/login");
  await expect(
    page.getByRole("button", { name: "Set password" }),
  ).toHaveCount(0);
});

test("footer offers a restrained staff login entry and email fields fit business addresses", async ({
  page,
}) => {
  await page.goto("/");

  const footer = page.getByRole("contentinfo");
  await expect(
    footer.getByRole("link", { name: "Staff login" }),
  ).toHaveAttribute("href", "/staff/login");

  await page.goto("/admin");
  const emailWidth = await page.getByLabel("Email").evaluate((input) =>
    Math.round(input.getBoundingClientRect().width),
  );
  expect(emailWidth).toBeGreaterThanOrEqual(250);
});
