import { expect, test, type Page } from "@playwright/test";

const accounts = [
  {
    userId: "worker-1",
    email: "operator01@drivemateparts.com.au",
    displayName: "Warehouse Operator 01",
    role: "warehouse_staff",
    accountStatus: "active",
    mustChangePassword: false,
    requiresReauthentication: false,
    lastLoginAt: "2026-08-31T00:00:00.000Z",
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
  },
  {
    userId: "admin-1",
    email: "lee@drivemateparts.com.au",
    displayName: "Li Yongkang",
    role: "admin",
    accountStatus: "active",
    mustChangePassword: false,
    requiresReauthentication: false,
    lastLoginAt: "2026-08-31T00:00:00.000Z",
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
  },
];

async function mockAdminSession(page: Page) {
  await page.route("**/api/auth/session", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ authenticated: true, profile: { role: "admin", displayName: "Li Yongkang" } }),
  }));
}

async function mockStaffApi(page: Page, canManage = true) {
  await page.route("**/api/admin/staff", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, canManage, accounts }) });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        account: { ...accounts[0], userId: "worker-3", email: "operator03@drivemateparts.com.au", displayName: "Warehouse Operator 03", accountStatus: "pending_first_login", mustChangePassword: true },
        temporaryPassword: "One-Time-Password-123!",
        temporaryPasswordExpiresAt: "2026-09-07T00:00:00.000Z",
      }),
    });
  });
  await page.route("**/api/admin/staff/*", async (route) => {
    const userId = route.request().url().split("/").at(-1);
    const account = accounts.find((candidate) => candidate.userId === userId) ?? accounts[0];
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        canManage: canManage && account.role !== "admin",
        account,
        ...(canManage ? { audit: [{ id: "audit-1", action: "staff_account_created", actorId: "admin-1", createdAt: "2026-08-21T00:00:00.000Z" }] } : {}),
      }),
    });
  });
}

test("opens account details in a drawer and protects the system administrator", async ({ page }) => {
  await mockAdminSession(page);
  await mockStaffApi(page);
  await page.goto("/admin/staff");

  await page.getByRole("button", { name: /Warehouse Operator 01/ }).click();
  await expect(page.getByRole("dialog", { name: "Warehouse Operator 01" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change role" })).toBeVisible();
  await page.getByRole("button", { name: "Close account panel" }).click();

  await page.getByRole("button", { name: /Li Yongkang/ }).click();
  const adminDialog = page.getByRole("dialog", { name: "Li Yongkang" });
  await expect(adminDialog).toContainText("System administrator protection");
  await expect(adminDialog.getByRole("button", { name: "Disable account" })).toHaveCount(0);
});

test("locks the one-time password handoff until secure delivery is confirmed", async ({ page }) => {
  await mockAdminSession(page);
  await mockStaffApi(page);
  await page.goto("/admin/staff");

  await page.getByRole("button", { name: "Create staff account" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create staff account" });
  await dialog.getByLabel("Full name").fill("Warehouse Operator 03");
  await dialog.getByLabel("Personal work email").fill("operator03@drivemateparts.com.au");
  await dialog.getByLabel("Role").selectOption("warehouse_staff");
  await dialog.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("dialog", { name: "Deliver one-time password" })).toContainText("One-Time-Password-123!");
  await expect(page.getByRole("button", { name: "Finish and close" })).toBeDisabled();
  await page.getByLabel("I confirm that I delivered the password securely").check();
  await page.getByRole("button", { name: "Finish and close" }).click();
  await expect(page.getByText("One-Time-Password-123!", { exact: true })).toHaveCount(0);
});

test("renders partner access as read only", async ({ page }) => {
  await mockAdminSession(page);
  await mockStaffApi(page, false);
  await page.goto("/admin/staff");

  await expect(page.getByText("Read-only partner view")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create staff account" })).toHaveCount(0);
  await page.getByRole("button", { name: /Warehouse Operator 01/ }).click();
  const dialog = page.getByRole("dialog", { name: "Warehouse Operator 01" });
  await expect(dialog.getByRole("button", { name: "Change role" })).toHaveCount(0);
  await expect(dialog.getByRole("tab", { name: "Audit history" })).toHaveCount(0);
});

test("records a reason and sends the selected role change", async ({ page }) => {
  let patchBody: Record<string, unknown> | undefined;
  await mockAdminSession(page);
  await mockStaffApi(page);
  await page.route("**/api/admin/staff/worker-1", async (route) => {
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, account: { ...accounts[0], role: "partner" }, audit: [] }) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, canManage: true, account: accounts[0], audit: [] }) });
  });
  await page.goto("/admin/staff");
  await page.getByRole("button", { name: /Warehouse Operator 01/ }).click();
  await page.getByRole("button", { name: "Change role" }).click();
  const dialog = page.getByRole("dialog", { name: "Change staff role" });
  await dialog.getByLabel("New role").selectOption("partner");
  await dialog.getByLabel("Reason").fill("Moving to operations partnership duties.");
  await dialog.getByRole("button", { name: "Apply role change" }).click();

  expect(patchBody).toEqual({ action: "change_role", role: "partner", reason: "Moving to operations partnership duties." });
  await expect(page.getByRole("dialog", { name: "Warehouse Operator 01" })).toContainText("Partner");
});

test("resumes password reset once after MFA and opens a locked handoff", async ({ page }) => {
  let resetAttempts = 0;
  await mockAdminSession(page);
  await mockStaffApi(page);
  await page.route("**/api/admin/staff/worker-1", async (route) => {
    if (route.request().method() === "PATCH") {
      resetAttempts += 1;
      if (resetAttempts === 1) {
        await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ ok: false, code: "mfa_required" }) });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ok: true, account: { ...accounts[0], accountStatus: "pending_first_login", mustChangePassword: true }, audit: [], temporaryPassword: "Reset-Password-123!", temporaryPasswordExpiresAt: "2026-09-07T00:00:00.000Z" }),
      });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, canManage: true, account: accounts[0], audit: [] }) });
  });
  await page.route("**/api/auth/mfa", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, factors: [{ id: "11111111-1111-4111-8111-111111111111", status: "verified" }] }) }));
  await page.route("**/api/auth/mfa/verify", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, assuranceLevel: "aal2" }) }));

  await page.goto("/admin/staff");
  await page.getByRole("button", { name: /Warehouse Operator 01/ }).click();
  await page.getByRole("button", { name: "Reset password" }).click();
  const actionDialog = page.getByRole("dialog", { name: "Reset staff password" });
  await actionDialog.getByLabel("Reason").fill("Credential may have been exposed.");
  await actionDialog.getByRole("button", { name: "Generate new password" }).click();
  const mfaDialog = page.getByRole("dialog", { name: "Verify this sensitive action" });
  await mfaDialog.getByLabel("Six-digit code").fill("123456");
  await mfaDialog.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByRole("dialog", { name: "Deliver one-time password" })).toContainText("Reset-Password-123!");
  expect(resetAttempts).toBe(2);
});

test("uses a right-side desktop drawer and returns focus after closing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAdminSession(page);
  await mockStaffApi(page);
  await page.goto("/admin/staff");
  const authPanelBox = await page.getByLabel("Account session").boundingBox();
  expect(authPanelBox).not.toBeNull();
  expect(authPanelBox!.height).toBeLessThanOrEqual(90);
  const tableFontSize = await page.locator(".staff-table td").first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(tableFontSize).toBeGreaterThanOrEqual(10);
  const trigger = page.getByRole("button", { name: /Warehouse Operator 01/ });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Warehouse Operator 01" });
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThan(800);
  expect(box!.width).toBeLessThanOrEqual(520);
  await page.getByRole("button", { name: "Close account panel", exact: true }).click();
  await expect(trigger).toBeFocused();
});

test("uses a full-width mobile drawer without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAdminSession(page);
  await mockStaffApi(page);
  await page.goto("/admin/staff");
  await page.getByRole("button", { name: /Warehouse Operator 01/ }).click();
  const box = await page.getByRole("dialog", { name: "Warehouse Operator 01" }).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeLessThanOrEqual(1);
  expect(box!.width).toBeGreaterThanOrEqual(389);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
