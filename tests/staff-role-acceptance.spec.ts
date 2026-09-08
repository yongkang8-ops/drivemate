import { expect, test, type Page } from "@playwright/test";

type SessionRole = "admin" | "partner" | "warehouse_staff" | "trade";

async function mockSession(page: Page, role: SessionRole, options?: { passwordChangeRequired?: boolean }) {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        assuranceLevel: "aal1",
        mfaRequired: false,
        passwordChangeRequired: options?.passwordChangeRequired ?? false,
        profile: {
          role,
          displayName: role === "trade" ? "Workshop Customer" : `${role} account`,
          ...(role === "trade" ? { tradeAccountId: "trade-account-1" } : {}),
        },
      }),
    }),
  );
}

async function expectRouteAccess(page: Page, route: string, allowed: boolean) {
  await page.goto(route);
  if (allowed) {
    await expect(page.locator(".auth-panel.is-authenticated")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Workspace access required" })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: /sensitive action|authenticator|session has expired/i })).toHaveCount(0);
    return;
  }
  await expect(page.getByRole("heading", { name: "Workspace access required" })).toBeVisible();
}

test("administrator inherits every internal workspace without a global MFA wall", async ({ page }) => {
  await mockSession(page, "admin");
  for (const route of ["/admin", "/partner", "/warehouse", "/inventory", "/prearrival", "/admin/staff"]) {
    await expectRouteAccess(page, route, true);
  }
});

test("partner keeps daily operations and Staff read access but cannot enter system administration", async ({ page }) => {
  await mockSession(page, "partner");
  for (const route of ["/partner", "/warehouse", "/inventory", "/prearrival", "/admin/staff"]) {
    await expectRouteAccess(page, route, true);
  }
  await expectRouteAccess(page, "/admin", false);
});

test("warehouse staff is confined to routine warehouse operations", async ({ page }) => {
  await mockSession(page, "warehouse_staff");
  await expectRouteAccess(page, "/warehouse", true);
  for (const route of ["/partner", "/inventory", "/prearrival", "/admin/staff", "/admin"]) {
    await expectRouteAccess(page, route, false);
  }
});

test("trade customer keeps Trade Portal access without inheriting staff workspaces", async ({ page }) => {
  await mockSession(page, "trade");
  await expectRouteAccess(page, "/portal", true);
  for (const route of ["/warehouse", "/partner", "/admin/staff", "/admin"]) {
    await expectRouteAccess(page, route, false);
  }
});

test("pending first login redirects to password setup before workspace content", async ({ page }) => {
  await mockSession(page, "warehouse_staff", { passwordChangeRequired: true });
  await page.goto("/warehouse");
  await expect(page).toHaveURL(/\/password-setup\?next=%2Fwarehouse$/);
  await expect(page.locator(".inbound-app")).toHaveCount(0);
});

for (const [code, message] of [
  ["account_disabled", "This staff account is disabled."],
  ["reauthentication_required", "Sign in again to continue."],
] as const) {
  test(`shows an explicit ${code} session message`, async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: false, code, message }),
      }),
    );
    await page.goto("/warehouse");
    await expect(page.locator(".auth-notice")).toContainText(message);
    await expect(page.locator(".inbound-app")).toHaveCount(0);
  });
}
