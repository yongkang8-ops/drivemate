import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "admin", displayName: "QA Administrator" } } }));
});

for (const failingRead of [1, 2]) {
  test(`Warehouse scope HTTP failure on read ${failingRead} offers retry and recovers`, async ({ page, request }) => {
    await request.post("/api/test/reset");
    let unavailable = true;
    await page.route(/\/api\/warehouse\/labels\?/, async route => {
      const scoped = new URL(route.request().url()).searchParams.has("palletNumber");
      if (unavailable && (failingRead === 1 || scoped)) return route.fulfill({ status: 503, json: { ok: false, message: "Scope temporarily unavailable." } });
      await route.continue();
    });
    await page.goto("/warehouse?shipmentId=shipment-test-1");
    await expect(page.getByRole("button", { name: "Retry loading shipments", exact: true })).toBeVisible();
    unavailable = false;
    await page.getByRole("button", { name: "Retry loading shipments", exact: true }).click();
    await expect(page.getByLabel("Shipment", { exact: true })).toHaveValue("shipment-test-1");
    await expect(page.getByRole("heading", { name: "Source carton scopes", exact: true })).toBeVisible();
  });
}

test("Warehouse initial network failure offers an explicit retry", async ({ page }) => {
  await page.route("**/api/prearrival/shipments", route => route.abort("failed"));
  await page.goto("/warehouse");
  await expect(page.getByRole("button", { name: "Retry loading shipments", exact: true })).toBeVisible();
  await expect(page.getByRole("status").last()).toContainText("could not be loaded");
});

test("Pre-arrival initial network failure offers an explicit retry", async ({ page }) => {
  await page.route("**/api/prearrival/shipments", route => route.abort("failed"));
  await page.goto("/prearrival");
  await expect(page.getByRole("button", { name: "Retry loading shipments", exact: true })).toBeVisible();
});

test("Staff successful HTTP response without a result is unknown, never falsely unchanged", async ({ page }) => {
  await page.route("**/api/admin/staff", route => route.fulfill({ json: route.request().method() === "POST" ? {} : { ok: true, canManage: true, accounts: [] } }));
  await page.goto("/admin/staff");
  await page.getByRole("button", { name: "Create staff account", exact: true }).first().click();
  await page.getByLabel("Full name", { exact: true }).fill("QA worker");
  await page.getByLabel("Personal work email", { exact: true }).fill("qa@example.invalid");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("could not be confirmed");
  await expect(page.getByRole("dialog")).not.toContainText("No account access was changed");
});

test("Staff creation draft survives a rejected close confirmation", async ({ page }) => {
  await page.route("**/api/admin/staff", route => route.fulfill({ json: { ok: true, canManage: true, accounts: [] } }));
  await page.goto("/admin/staff");
  await page.getByRole("button", { name: "Create staff account", exact: true }).first().click();
  await page.getByLabel("Full name", { exact: true }).fill("Draft worker");
  let warned = false;
  page.on("dialog", async dialog => { warned = true; await dialog.dismiss(); });
  await page.getByRole("button", { name: "Close account panel", exact: true }).click();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Draft worker");
  expect(warned).toBe(true);
});

test("Trade lookup failure is visible and the submit control recovers", async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "trade", displayName: "QA Trade" } } }));
  await page.route("**/api/trade-state", route => route.fulfill({ json: { orders: [], accountDocuments: [] } }));
  await page.route("**/api/vehicle-lookup", route => route.abort("failed"));
  await page.goto("/portal");
  await page.getByRole("button", { name: "Search matching parts", exact: true }).click();
  await expect(page.locator(".workspace-feedback[role=status]")).toContainText("could not be confirmed");
  await expect(page.getByRole("button", { name: "Search matching parts", exact: true })).toBeEnabled();
});

test("location register exposes all pages and remembers its filter after refresh", async ({ page, request }) => {
  await request.post("/api/test/reset");
  const codes = Array.from({ length: 31 }, (_, i) => `BNE-QA-PAGE-${String(i + 1).padStart(2, "0")}`);
  expect((await request.post("/api/inventory/locations", { headers: { "x-drivemate-role": "partner" }, data: { locationCodes: codes } })).ok()).toBeTruthy();
  await page.goto("/inventory");
  await page.getByLabel("Search locations", { exact: true }).fill("BNE-QA-PAGE");
  const pager = page.getByRole("group", { name: "Location register pagination" });
  await expect(pager).toContainText("1–25 of 31");
  await pager.getByRole("button", { name: "Next", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Search locations", { exact: true })).toHaveValue("BNE-QA-PAGE");
  await expect(pager).toContainText("26–31 of 31");
});

test("a missing document URL is an error and never opens an undefined page", async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "trade", displayName: "QA Trade" } } }));
  await page.route("**/api/trade-state", route => route.fulfill({ json: { orders: [], accountDocuments: [{ id: "qa-doc", type: "invoice", reference: "QA-INV", createdAt: "2026-09-08T00:00:00Z" }] } }));
  await page.route("**/api/account-documents/qa-doc", route => route.fulfill({ json: { ok: true } }));
  await page.goto("/portal");
  await page.getByRole("button", { name: "Open QA-INV", exact: true }).click();
  await expect(page.locator(".workspace-feedback[role=status]")).toContainText("could not be confirmed");
  await expect(page.getByRole("link", { name: /QA-INV/ })).toHaveCount(0);
});

test("Pre-arrival detail failure keeps the initial retry available", async ({ page, request }) => {
  await request.post("/api/test/reset");
  await page.route(/\/api\/prearrival\/shipments\?shipmentId=/, route => route.abort("failed"));
  await page.goto("/prearrival");
  await expect(page.getByRole("button", { name: "Retry loading shipments", exact: true })).toBeVisible();
});

test("admin product and finance drafts ask before leaving the workspace", async ({ page }) => {
  await page.goto("/admin#products");
  await page.getByLabel("New SKU", { exact: true }).fill("QA-DRAFT");
  let prompts = 0;
  page.on("dialog", async dialog => { prompts++; await dialog.dismiss(); });
  await page.getByRole("navigation", { name: "Workspace navigation", exact: true }).getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByLabel("New SKU", { exact: true })).toHaveValue("QA-DRAFT");
  expect(prompts).toBe(1);
  await page.getByRole("navigation", { name: "Admin modules" }).getByRole("link", { name: "Shipment costs", exact: true }).click();
  await page.getByLabel("Shipment ID", { exact: true }).fill("qa-shipment");
  await page.getByRole("navigation", { name: "Workspace navigation", exact: true }).getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByLabel("Shipment ID", { exact: true })).toHaveValue("qa-shipment");
  // Two dirty editors still produce one shared prompt per attempted exit.
  expect(prompts).toBe(2);
});

test("public application draft asks before leaving to Catalogue", async ({ page }) => {
  await page.goto("/open-account");
  await page.getByLabel("Workshop or business name", { exact: true }).fill("Unsubmitted workshop");
  let prompts = 0;
  page.on("dialog", async dialog => { prompts++; await dialog.dismiss(); });
  await page.locator(".site-header").getByRole("link", { name: "Catalogue", exact: true }).click();
  await expect(page.getByLabel("Workshop or business name", { exact: true })).toHaveValue("Unsubmitted workshop");
  expect(prompts).toBe(1);
});

test("sign out does not discard a draft or report a failed logout as successful", async ({ page }) => {
  let logoutRequests = 0;
  await page.route("**/api/auth/logout", route => { logoutRequests++; return route.abort("failed"); });
  await page.goto("/inventory");
  await page.getByLabel("Location code batch", { exact: true }).fill("BNE-QA-DRAFT");
  let prompts = 0;
  page.once("dialog", async dialog => { prompts++; await dialog.dismiss(); });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Location code batch", { exact: true })).toHaveValue("BNE-QA-DRAFT");
  expect(logoutRequests).toBe(0); expect(prompts).toBe(1);
  await page.getByLabel("Location code batch", { exact: true }).fill("");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Account session")).toContainText("Sign-out could not be confirmed");
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeEnabled();
  expect(logoutRequests).toBe(1);
});

test("Staff drawer retains typing focus when its draft becomes dirty", async ({ page }) => {
  await page.route("**/api/admin/staff", route => route.fulfill({ json: { ok: true, canManage: true, accounts: [] } }));
  await page.goto("/admin/staff");
  await page.getByRole("button", { name: "Create staff account", exact: true }).first().click();
  const name = page.getByLabel("Full name", { exact: true });
  await name.pressSequentially("QA warehouse operator", { delay: 30 });
  await expect(name).toHaveValue("QA warehouse operator");
  await expect(name).toBeFocused();
});
