import { expect, test } from "@playwright/test";

test("leaving during MFA verification cancels the deferred write and clears the dialog", async ({ page }) => {
  let attempts = 0; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/landed-costs", route => { attempts++; return route.fulfill({ status: 403, json: { ok: false, code: "mfa_required" } }); });
  await page.route("**/api/auth/mfa", route => route.fulfill({ json: { ok: true, factors: [{ id: "qa-factor", status: "verified" }] } }));
  await page.route("**/api/auth/mfa/verify", async route => { await gate; await route.fulfill({ json: { ok: true, assuranceLevel: "aal2" } }); });
  await page.goto("/admin#costs");
  await page.getByLabel("Shipment ID", { exact: true }).fill("qa-shipment");
  await page.getByRole("button", { name: "Save cost version", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Verify this sensitive action" });
  await dialog.getByLabel("Six-digit code").fill("123456");
  await dialog.getByRole("button", { name: "Verify and continue" }).click();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  release();
  await page.waitForLoadState("networkidle");
  expect(attempts).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("authenticator setup network failure is recoverable and does not leave the button busy", async ({ page }) => {
  await page.route("**/api/admin/landed-costs", route => route.fulfill({ status: 403, json: { ok: false, code: "mfa_required" } }));
  await page.route("**/api/auth/mfa", route => route.request().method() === "POST" ? route.abort("failed") : route.fulfill({ json: { ok: true, factors: [] } }));
  await page.goto("/admin#costs");
  await page.getByLabel("Shipment ID", { exact: true }).fill("qa-shipment");
  await page.getByRole("button", { name: "Save cost version", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Set up authenticator" });
  await dialog.getByRole("button", { name: "Set up authenticator", exact: true }).click();
  await expect(dialog).toContainText("Check the connection and try again");
  await expect(dialog.getByRole("button", { name: "Set up authenticator", exact: true })).toBeEnabled();
});

test("MFA dialog contains keyboard focus and Escape cancels without a second request", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/admin/landed-costs", route => { attempts++; return route.fulfill({ status: 403, json: { ok: false, code: "mfa_required" } }); });
  await page.route("**/api/auth/mfa", route => route.fulfill({ json: { ok: true, factors: [{ id: "qa-factor", status: "verified" }] } }));
  await page.goto("/admin#costs");
  await page.getByLabel("Shipment ID", { exact: true }).fill("qa-shipment");
  const trigger = page.getByRole("button", { name: "Save cost version", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Verify this sensitive action" });
  await dialog.getByRole("button", { name: "Verify and continue", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Cancel verification", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(attempts).toBe(1);
});

test("a sensitive admin mutation pauses for MFA and then resumes once", async ({ page }) => {
  let landedCostAttempts = 0;

  await page.route("**/api/admin/landed-costs", async (route) => {
    landedCostAttempts += 1;
    if (landedCostAttempts === 1) {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          code: "mfa_required",
          message: "Verify your identity to continue this sensitive operation.",
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        landedCostId: "cost-1",
        cashTotalMinor: 10000,
        cogsTotalMinor: 9000,
      }),
    });
  });
  await page.route("**/api/auth/mfa", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        assuranceLevel: "aal1",
        factors: [{ id: "11111111-1111-4111-8111-111111111111", friendlyName: "DriveMate staff authenticator", status: "verified" }],
      }),
    });
  });
  await page.route("**/api/auth/mfa/verify", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, assuranceLevel: "aal2" }),
    });
  });

  await page.goto("/admin#costs");
  await page.getByLabel("Shipment ID").fill("11111111-1111-4111-8111-111111111111");
  await page.getByRole("button", { name: "Save cost version" }).click();

  const dialog = page.getByRole("dialog", { name: "Verify this sensitive action" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Six-digit code").fill("123456");
  await dialog.getByRole("button", { name: "Verify and continue" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Landed cost cost-1 saved" })).toBeVisible();
  expect(landedCostAttempts).toBe(2);
});

test("an expired session explains that the pending action was not submitted", async ({ page }) => {
  await page.route("**/api/admin/landed-costs", async (route) => {
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, code: "mfa_required" }),
    });
  });
  await page.route("**/api/auth/mfa", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, code: "session_expired", message: "Session expired." }),
    });
  });

  await page.goto("/admin#costs");
  await page.getByLabel("Shipment ID").fill("11111111-1111-4111-8111-111111111111");
  await page.getByRole("button", { name: "Save cost version" }).click();

  const dialog = page.getByRole("dialog", { name: "Your session has expired" });
  await expect(dialog).toContainText("The pending operation has not been submitted.");
  await expect(dialog.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/staff/login?next=%2Fadmin%23costs");
});

test("the first sensitive action can enroll an authenticator before resuming", async ({ page }) => {
  let landedCostAttempts = 0;
  await page.route("**/api/admin/landed-costs", async (route) => {
    landedCostAttempts += 1;
    await route.fulfill({
      status: landedCostAttempts === 1 ? 403 : 200,
      contentType: "application/json",
      body: JSON.stringify(landedCostAttempts === 1
        ? { ok: false, code: "mfa_required" }
        : { ok: true, landedCostId: "cost-enrolled", cashTotalMinor: 10000, cogsTotalMinor: 9000 }),
    });
  });
  await page.route("**/api/auth/mfa", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, factors: [] }) });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        factorId: "11111111-1111-4111-8111-111111111111",
        qrCode: "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'></svg>",
        secret: "TESTSECRET",
      }),
    });
  });
  await page.route("**/api/auth/mfa/verify", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, assuranceLevel: "aal2" }) });
  });

  await page.goto("/admin#costs");
  await page.getByLabel("Shipment ID").fill("11111111-1111-4111-8111-111111111111");
  await page.getByRole("button", { name: "Save cost version" }).click();

  const dialog = page.getByRole("dialog", { name: "Set up authenticator" });
  await dialog.getByRole("button", { name: "Set up authenticator" }).click();
  await expect(dialog.getByAltText("Authenticator setup QR code")).toBeVisible();
  await dialog.getByLabel("Six-digit code").fill("123456");
  await dialog.getByRole("button", { name: "Verify and continue" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Landed cost cost-enrolled saved" })).toBeVisible();
  expect(landedCostAttempts).toBe(2);
});

test("an invalid authenticator code keeps the pending action paused", async ({ page }) => {
  let landedCostAttempts = 0;
  await page.route("**/api/admin/landed-costs", async (route) => {
    landedCostAttempts += 1;
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, code: "mfa_required" }),
    });
  });
  await page.route("**/api/auth/mfa", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, factors: [{ id: "11111111-1111-4111-8111-111111111111", status: "verified" }] }),
    });
  });
  await page.route("**/api/auth/mfa/verify", async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, message: "Authenticator code was not accepted." }),
    });
  });

  await page.goto("/admin#costs");
  await page.getByLabel("Shipment ID").fill("11111111-1111-4111-8111-111111111111");
  await page.getByRole("button", { name: "Save cost version" }).click();
  const dialog = page.getByRole("dialog", { name: "Verify this sensitive action" });
  await dialog.getByLabel("Six-digit code").fill("111111");
  await dialog.getByRole("button", { name: "Verify and continue" }).click();

  await expect(dialog).toContainText("Authenticator code was not accepted.");
  expect(landedCostAttempts).toBe(1);
});
