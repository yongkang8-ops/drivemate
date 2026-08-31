import { expect, test, type Page } from "@playwright/test";

async function mockSignedOutSession(page: Page) {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ authenticated: false }),
    }),
  );
}

test("uses a stacked, labelled Staff login form with mature action hierarchy", async ({ page }) => {
  const runtimeErrors: string[] = [];
  const hydrationWarnings: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (
      ["error", "warning"].includes(message.type()) &&
      /hydration|did not match/i.test(message.text())
    ) {
      hydrationWarnings.push(message.text());
    }
  });
  await mockSignedOutSession(page);

  await page.goto("/warehouse");

  await expect(page.getByRole("heading", { name: "Staff login" })).toBeVisible();
  await expect(page.getByText("Email address", { exact: true })).toBeVisible();
  await expect(page.getByText("Password", { exact: true })).toBeVisible();
  const email = page.getByLabel("Email address", { exact: true });
  const password = page.getByLabel("Password", { exact: true });
  const forgot = page.getByRole("button", { name: "Forgot password?" });
  const submit = page.getByRole("button", { name: "Sign in" });
  await expect(email).toBeVisible();
  await expect(password).toBeVisible();
  await expect(forgot).toBeVisible();
  await expect(submit).toBeVisible();

  const emailBox = await email.boundingBox();
  const passwordBox = await password.boundingBox();
  const submitBox = await submit.boundingBox();
  expect(emailBox).not.toBeNull();
  expect(passwordBox).not.toBeNull();
  expect(submitBox).not.toBeNull();
  expect(passwordBox!.y).toBeGreaterThan(emailBox!.y + emailBox!.height);
  expect(Math.abs(emailBox!.width - passwordBox!.width)).toBeLessThan(2);
  expect(Math.abs(emailBox!.width - submitBox!.width)).toBeLessThan(2);
  expect(Number.parseFloat(await forgot.evaluate((node) => getComputedStyle(node).fontSize))).toBeLessThan(
    Number.parseFloat(await submit.evaluate((node) => getComputedStyle(node).fontSize)),
  );
  await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
  expect(hydrationWarnings).toEqual([]);
});

test("uses semantic warning, success and error feedback", async ({ page }) => {
  await mockSignedOutSession(page);
  await page.route("**/api/auth/password-reset", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, message: "Invalid email or password." }),
    }),
  );

  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.locator(".auth-notice--warning")).toContainText("Enter your email address");

  await page.getByLabel("Email address", { exact: true }).fill("operator@drivemateparts.com.au");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.locator(".auth-notice--success")).toContainText("recovery email has been sent");

  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".auth-notice--error")).toContainText("Invalid email or password.");
});

test("uses the same shared form for Trade login", async ({ page }) => {
  await mockSignedOutSession(page);
  await page.goto("/portal");
  await expect(page.getByRole("heading", { name: "Trade login" })).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Forgot password?" })).toBeVisible();
});

test("keeps every protected workspace on the same shared Staff login", async ({ page }) => {
  await mockSignedOutSession(page);
  for (const route of [
    "/admin",
    "/partner",
    "/inventory",
    "/prearrival",
    "/warehouse",
    "/admin/staff",
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: "Staff login" })).toBeVisible();
    await expect(page.locator(".auth-form")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Forgot password?" })).toBeVisible();
  }
});

test("collapses the structured split cleanly on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSignedOutSession(page);
  await page.goto("/warehouse");

  const panel = page.locator(".auth-panel");
  const copy = page.locator(".auth-copy");
  const form = page.locator(".auth-form");
  const notice = page.locator(".auth-notice");
  const panelBox = await panel.boundingBox();
  const copyBox = await copy.boundingBox();
  const formBox = await form.boundingBox();
  const noticeBox = await notice.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(copyBox).not.toBeNull();
  expect(formBox).not.toBeNull();
  expect(noticeBox).not.toBeNull();
  expect(formBox!.y).toBeGreaterThan(copyBox!.y + copyBox!.height);
  expect(formBox!.x).toBeGreaterThanOrEqual(panelBox!.x);
  expect(formBox!.x + formBox!.width).toBeLessThanOrEqual(panelBox!.x + panelBox!.width + 1);
  expect(noticeBox!.x + noticeBox!.width).toBeLessThanOrEqual(panelBox!.x + panelBox!.width + 1);
});

test("uses the shared notice treatment during password setup", async ({ page }) => {
  await page.goto("/password-setup#access_token=recovery-token&type=recovery");
  await expect(page.locator(".password-form .auth-notice--info")).toContainText("12 or more characters");
  await page.getByLabel("New password").fill("First-Password-123!");
  await page.getByLabel("Confirm password").fill("Second-Password-123!");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.locator(".password-form .auth-notice--warning")).toContainText("Passwords do not match");
});
