import { expect, test } from "@playwright/test";

test("public application inputs cannot accept a draft before hydration", async ({ browser, baseURL }) => {
  const beforeHydration = await browser.newPage({ javaScriptEnabled: false });
  try {
    await beforeHydration.goto(`${baseURL}/open-account`);
    await expect(beforeHydration.getByLabel("Workshop or business name", { exact: true })).toBeDisabled();
    await expect(beforeHydration.getByLabel("Contact email", { exact: true })).toBeDisabled();
    await beforeHydration.goto(`${baseURL}/catalogue`);
    await expect(beforeHydration.getByLabel("Search released catalogue", { exact: true })).toBeDisabled();
    await beforeHydration.goto(`${baseURL}/staff/login`);
    await expect(beforeHydration.getByLabel("Email address", { exact: true })).toHaveCount(0);
    await expect(beforeHydration.getByText("Checking your session.", { exact: true })).toBeVisible();
    await beforeHydration.goto(`${baseURL}/password-setup`);
    await expect(beforeHydration.getByLabel("New password", { exact: true })).toBeDisabled();
  } finally { await beforeHydration.close(); }
});

const worker = { userId: "qa-worker", email: "qa@example.invalid", displayName: "QA worker", role: "warehouse_staff", accountStatus: "active", mustChangePassword: false, requiresReauthentication: false, lastLoginAt: null, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "admin", displayName: "QA Administrator" } } }));
  await page.route("**/api/admin/staff", route => route.fulfill({ json: { ok: true, canManage: true, accounts: [worker] } }));
});

test("a late Staff detail response cannot reopen a dismissed drawer", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/staff/qa-worker", async route => {
    await pending;
    await route.fulfill({ json: { ok: true, account: worker, canManage: true, audit: [] } });
  });
  await page.goto("/admin/staff");
  await page.getByRole("button", { name: /QA worker/ }).click();
  await page.getByRole("button", { name: "Close account panel", exact: true }).click();
  const response = page.waitForResponse(r => r.url().endsWith("/api/admin/staff/qa-worker"));
  release(); await response;
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Staff detail network failure provides a recoverable error without a stuck loading state", async ({ page }) => {
  await page.route("**/api/admin/staff/qa-worker", route => route.abort("failed"));
  await page.goto("/admin/staff");
  await page.getByRole("button", { name: /QA worker/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Account details could not be loaded");
  await page.getByRole("button", { name: "Close account panel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("closing a changed location editor asks before discarding and Cancel retains input", async ({ page, request }) => {
  await request.post("/api/test/reset");
  await request.post("/api/inventory/locations", { headers: { "x-drivemate-role": "partner" }, data: { locationCodes: ["BNE-QA-DIRTY-01"] } });
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Edit BNE-QA-DIRTY-01", exact: true }).click();
  const input = page.getByLabel("Physical description for BNE-QA-DIRTY-01", { exact: true });
  await input.fill("Unsubmitted QA description");
  let warnings = 0;
  page.on("dialog", async dialog => { warnings++; await dialog.dismiss(); });
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("Unsubmitted QA description");
  expect(warnings).toBe(1);
});

test("Staff creation network failure releases the submit button and preserves the draft", async ({ page }) => {
  await page.route("**/api/admin/staff", route => route.request().method() === "POST" ? route.abort("failed") : route.fulfill({ json: { ok: true, canManage: true, accounts: [worker] } }));
  await page.goto("/admin/staff");
  await page.getByRole("button", { name: "Create staff account", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Unsubmitted worker");
  await page.getByLabel("Personal work email", { exact: true }).fill("qa-new@example.invalid");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("could not be confirmed");
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Unsubmitted worker");
});

test("Staff register paginates the complete list and filtering resets to the first page", async ({ page }) => {
  const many = Array.from({ length: 57 }, (_, index) => ({ ...worker, userId: `worker-${index + 1}`, displayName: `Worker ${String(index + 1).padStart(3, "0")}`, email: `worker${index + 1}@example.invalid` }));
  await page.route("**/api/admin/staff", route => route.fulfill({ json: { ok: true, canManage: true, accounts: many } }));
  await page.goto("/admin/staff");
  const pager = page.getByRole("group", { name: "Staff register pagination" });
  await expect(pager).toContainText("1–25 of 57");
  await pager.getByRole("button", { name: "Next" }).click();
  await expect(pager).toContainText("26–50 of 57");
  await page.getByRole("textbox", { name: "Search name or email" }).fill("Worker 057");
  await expect(pager).toContainText("1–1 of 1");
  await expect(page.getByRole("button", { name: /Worker 057/ })).toBeVisible();
});

test("Warehouse switch restores the latest shipment after a delayed earlier response", async ({ page, request }) => {
  await request.post("/api/test/reset?shipments=multiple");
  const headers = { "x-drivemate-role": "partner" };
  const created = await request.post("/api/prearrival/shipments/shipment-test-2/revisions", { headers, data: { schemaVersion: 3, shipmentId: "shipment-test-2", cartons: [{ sourceCartonNumber: "QA-B", kind: "carton", physicalCartonCount: 1, memberCartonNumbers: ["QA-B"], sourcePalletNumber: null, lines: [{ sku: "DM-GWM-AF-002", expectedQuantity: 7 }] }] } });
  expect(created.ok()).toBeTruthy();
  const createdBody = await created.json();
  expect((await request.post(`/api/prearrival/revisions/${createdBody.revision.id}/confirm`, { headers })).ok()).toBeTruthy();
  await page.goto("/warehouse?shipmentId=shipment-test-1");
  await expect(page.getByLabel("Shipment", { exact: true })).toHaveValue("shipment-test-1");
  let release!: () => void; let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = new Promise<void>(resolve => { started = resolve; });
  await page.route(/\/api\/warehouse\/labels\?/, async route => {
    if (new URL(route.request().url()).searchParams.get("shipmentId") === "shipment-test-2") { started(); await gate; }
    const response = await route.fetch(); await route.fulfill({ response });
  });
  await page.getByLabel("Shipment", { exact: true }).selectOption("shipment-test-2");
  await pending;
  await page.getByLabel("Shipment", { exact: true }).selectOption("shipment-test-1");
  await expect(page.locator(".inbound-scope-bar strong")).toContainText("BNE-TEST-001");
  const response = page.waitForResponse(r => r.url().includes("/api/warehouse/labels?") && r.url().includes("shipment-test-2"));
  release(); await response;
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".inbound-scope-bar strong")).toContainText("BNE-TEST-001");
});

test("public account application recovers from a network failure without losing the form", async ({ page }) => {
  await page.route("**/api/trade-account-applications", route => route.abort("failed"));
  await page.goto("/open-account");
  await page.getByLabel("Workshop or business name", { exact: true }).fill("QA workshop");
  await page.getByLabel("Contact name", { exact: true }).fill("QA contact");
  await page.getByLabel("Contact email", { exact: true }).fill("qa@example.invalid");
  await page.getByLabel("Contact phone", { exact: true }).fill("0400000000");
  await page.getByLabel(/I have read the Privacy Policy/).check();
  await page.getByLabel(/I agree that approved use/).check();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("status")).toContainText("could not be confirmed");
  await expect(page.getByRole("button", { name: "Submit application" })).toBeEnabled();
  await expect(page.getByLabel("Workshop or business name", { exact: true })).toHaveValue("QA workshop");
});

test("a pending Staff creation cannot be dismissed before the one-time result arrives", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/staff", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { ok: true, canManage: true, accounts: [worker] } });
    await gate; await route.fulfill({ status: 503, json: { ok: false, message: "Service unavailable" } });
  });
  await page.goto("/admin/staff");
  await page.getByRole("button", { name: "Create staff account", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("QA pending");
  await page.getByLabel("Personal work email", { exact: true }).fill("qa-pending@example.invalid");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Creating account", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Close account panel", exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole("button", { name: "Close account panel", exact: true })).toBeEnabled();
});

test("a changed Packing List working copy cannot be discarded silently", async ({ page, request }) => {
  await request.post("/api/test/reset");
  await page.goto("/prearrival?shipmentId=shipment-test-1");
  await page.getByRole("button", { name: "Create revision", exact: true }).click();
  await page.getByLabel("Source scope number", { exact: true }).fill("QA-UNSAVED-CARTON");
  let warned = false;
  page.on("dialog", async dialog => { warned = true; await dialog.dismiss(); });
  await page.getByRole("button", { name: "Cancel working copy", exact: true }).click();
  await expect(page.getByLabel("Source scope number", { exact: true })).toHaveValue("QA-UNSAVED-CARTON");
  expect(warned).toBe(true);
});

test("Dashboard remembers its applied search and timezone after refresh", async ({ page }) => {
  await page.goto("/partner");
  await page.getByLabel("Find shipment, SKU or reference", { exact: true }).fill("BNE-TEST-001");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByLabel("Display timezone", { exact: true }).selectOption("Asia/Shanghai");
  await page.reload();
  await expect(page.getByLabel("Find shipment, SKU or reference", { exact: true })).toHaveValue("BNE-TEST-001");
  await expect(page.getByLabel("Display timezone", { exact: true })).toHaveValue("Asia/Shanghai");
});

test("a late Dashboard search cannot replace the latest result", async ({ page }) => {
  let release!: () => void; let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = new Promise<void>(resolve => { started = resolve; });
  await page.route("**/api/partner/dashboard?**", async route => {
    const query = new URL(route.request().url()).searchParams.get("search");
    if (query === "OLD") { started(); await gate; }
    const response = await route.fetch(); const body = await response.json();
    body.dashboard.pipeline.activeShipments = query === "OLD" ? 99 : 2;
    await route.fulfill({ json: body });
  });
  await page.goto("/partner");
  const search = page.getByLabel("Find shipment, SKU or reference", { exact: true });
  await search.fill("OLD"); await page.getByRole("button", { name: "Filter", exact: true }).click(); await pending;
  await search.fill("NEW"); await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(page.locator(".partner-metric-grid article strong").first()).toHaveText("2");
  release(); await page.waitForLoadState("networkidle");
  await expect(page.locator(".partner-metric-grid article strong").first()).toHaveText("2");
});

test("Dashboard long worklists expose independent complete pagination", async ({ page }) => {
  await page.route("**/api/partner/dashboard?**", async route => {
    const response = await route.fetch(); const body = await response.json();
    body.dashboard.shipments = Array.from({ length: 31 }, (_, i) => ({ ...body.dashboard.shipments[0], shipmentId: `qa-shipment-${i}`, shipmentReference: `QA-SHIPMENT-${i}` }));
    body.dashboard.attention = Array.from({ length: 31 }, (_, i) => ({ id: `qa-attention-${i}`, type: "print_confirmation", title: "QA attention", reference: `QA-ATTENTION-${i}`, detail: "Local fixture", href: "/warehouse" }));
    body.dashboard.activities = Array.from({ length: 31 }, (_, i) => ({ id: `qa-activity-${i}`, createdAt: "2026-09-08T00:00:00Z", date: "08 Sep 2026", time: "10:00", actionLabel: "Print cancelled", outcome: "Cancelled", reference: `QA-ACTIVITY-${i}`, shipmentId: "qa-shipment" }));
    await route.fulfill({ json: body });
  });
  await page.goto("/partner");
  for (const label of ["Inbound shipments", "Attention queue", "Confirmed activity"]) {
    const pager = page.getByRole("group", { name: `${label} pagination`, exact: true });
    await expect(pager).toContainText("1–25 of 31");
    await pager.getByRole("button", { name: "Next", exact: true }).click();
    await expect(pager).toContainText("26–31 of 31");
  }
});
