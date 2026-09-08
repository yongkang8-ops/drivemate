import { expect, test, type Page } from "@playwright/test";

// Mutations start an asynchronous list refresh. Let intercepted responses
// finish before Playwright disposes the request context at test teardown.
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "wait" }); });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: {
    authenticated: true, profile: { role: "admin", displayName: "QA Administrator" },
  } }));
});

async function routeAdminState(page: Page, mutate?: (body: Record<string, any>) => void) {
  await page.route("**/api/admin-state", async route => {
    const response = await route.fetch();
    const body = await response.json();
    mutate?.(body);
    await route.fulfill({ json: body });
  });
}

test("initial admin state failure shows retry instead of zero metrics and empty rows", async ({ page }) => {
  let fail = true;
  await page.route("**/api/admin-state", async route => fail ? route.abort("failed") : route.fulfill({ response: await route.fetch() }));
  await page.goto("/admin");
  await expect(page.getByRole("alert").filter({ hasText: "Admin state could not be loaded" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry admin state" })).toBeVisible();
  await expect(page.getByText("Active SKUs", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No active SKUs are below reorder point.", { exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Retry admin state" }).click();
  await expect(page.getByText("Active SKUs", { exact: true })).toBeVisible();
});

test("bulk SKU and fitment buttons send parsed rows through their existing APIs", async ({ page }) => {
  await routeAdminState(page);
  const requests: Array<{ url: string; body: any }> = [];
  await page.route("**/api/products/import", async route => {
    requests.push({ url: route.request().url(), body: route.request().postDataJSON() });
    await route.fulfill({ json: { ok: true, summary: { created: 1, updated: 0, failed: 0 }, failures: [] } });
  });
  await page.route("**/api/fitment-rules/import", async route => {
    requests.push({ url: route.request().url(), body: route.request().postDataJSON() });
    await route.fulfill({ json: { ok: true, summary: { created: 1, failed: 0 }, failures: [] } });
  });
  await page.goto("/admin#products");
  await page.getByLabel("Bulk SKU import rows").fill("sku,brand,name,category,barcode,status\nQA-BULK-001,GWM,Oil Filter,Service Filter,QABULK001,draft");
  await page.getByRole("button", { name: "Import SKU masters" }).click();
  await expect(page.getByText(/SKU import complete: 1 created/)).toBeVisible();
  await page.getByLabel("Bulk fitment import rows").fill("sku,make,model,yearFrom,confidence\nQA-BULK-001,GWM,Cannon,2024,exact");
  await page.getByRole("button", { name: "Import fitment rules" }).click();
  await expect(page.getByText(/Fitment import complete: 1 created/)).toBeVisible();
  expect(requests.map(item => new URL(item.url).pathname)).toEqual(["/api/products/import", "/api/fitment-rules/import"]);
  expect(requests[0].body.rows[0]).toMatchObject({ sku: "QA-BULK-001", barcode: "QABULK001" });
  expect(requests[1].body.rows[0]).toMatchObject({ sku: "QA-BULK-001", make: "GWM", model: "Cannon", yearFrom: 2024 });
});

test("account and order action buttons call existing status and cancel APIs", async ({ page }) => {
  await routeAdminState(page, body => {
    body.tradeAccounts = [
      { id: "acct-approved", accountName: "Approved Garage", contactName: "A", contactEmail: "a@example.com", contactPhone: "1", status: "approved" },
      { id: "acct-paused", accountName: "Paused Garage", contactName: "P", contactEmail: "p@example.com", contactPhone: "2", status: "paused" },
    ];
    body.orders = [{ id: "order-qa", status: "submitted", lines: [], totalIncGstCents: 1000 }];
  });
  const actions: Array<{ method: string; path: string; body?: any }> = [];
  await page.route("**/api/trade-account-applications/*/status", async route => {
    const body = route.request().postDataJSON(); actions.push({ method: route.request().method(), path: new URL(route.request().url()).pathname, body });
    const id = new URL(route.request().url()).pathname.split("/").at(-2)!;
    await route.fulfill({ json: { ok: true, application: { id, accountName: id, status: body.status } } });
  });
  await page.route("**/api/orders/order-qa/cancel", async route => {
    actions.push({ method: route.request().method(), path: new URL(route.request().url()).pathname });
    await route.fulfill({ json: { ok: true, order: { id: "order-qa", status: "cancelled" } } });
  });
  await page.goto("/admin#accounts");
  await page.getByRole("row", { name: /Approved Garage/ }).getByRole("button", { name: "Pause" }).click();
  await page.getByRole("row", { name: /Paused Garage/ }).getByRole("button", { name: "Reactivate" }).click();
  await page.getByRole("navigation", { name: "Admin modules" }).getByRole("link", { name: "Orders & returns" }).click();
  await page.getByRole("row", { name: /order-qa/ }).getByRole("button", { name: "Cancel" }).click();
  expect(actions).toEqual([
    { method: "PATCH", path: "/api/trade-account-applications/acct-approved/status", body: { status: "paused" } },
    { method: "PATCH", path: "/api/trade-account-applications/acct-paused/status", body: { status: "approved" } },
    { method: "POST", path: "/api/orders/order-qa/cancel" },
  ]);
});

test("RMA inspection button sends the visible outcome and credit through its existing API", async ({ page }) => {
  await routeAdminState(page);
  let request: { path: string; body: any } | undefined;
  await page.route("**/api/admin/rma/rma-qa/inspect", async route => {
    request = { path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() };
    await route.fulfill({ json: { ok: true, rmaId: "rma-qa" } });
  });
  await page.goto("/admin#orders");
  await page.getByLabel("RMA ID").fill("rma-qa");
  await page.getByLabel("Outcome").selectOption("carrier_damage");
  await page.getByLabel("Credit amount AUD").fill("12.34");
  await page.getByRole("button", { name: "Record inspection" }).click();
  await expect(page.getByText("RMA rma-qa inspection recorded.", { exact: true })).toBeVisible();
  expect(request?.path).toBe("/api/admin/rma/rma-qa/inspect");
  expect(request?.body).toMatchObject({ outcome: "carrier_damage", creditAmountCents: 1234 });
  expect(request?.body.idempotencyKey).toEqual(expect.any(String));
});

test("application approval and login provisioning preserve their API contracts and recover from denial", async ({ page }) => {
  await routeAdminState(page, body => {
    body.accountApplications = [
      { id: "application-success", accountName: "Approved Workshop", contactName: "Alex", contactEmail: "alex@example.com", contactPhone: "1", status: "pending" },
      { id: "application-denied", accountName: "Denied Workshop", contactName: "Dana", contactEmail: "dana@example.com", contactPhone: "2", status: "pending" },
    ];
  });
  const requests: Array<{ method: string; path: string; payload: string | null; idempotencyKey?: string }> = [];
  await page.route("**/api/trade-account-applications/*/approve", async route => {
    const request = route.request();
    requests.push({ method: request.method(), path: new URL(request.url()).pathname, payload: request.postData(), idempotencyKey: request.headers()["idempotency-key"] });
    if (request.url().includes("application-denied")) return route.fulfill({ status: 422, json: { ok: false, message: "Approval denied for QA." } });
    return route.fulfill({ json: { ok: true, application: { id: "application-success", accountName: "Approved Workshop", status: "approved" } } });
  });
  await page.route("**/api/trade-account-applications/*/provision-login", async route => {
    const request = route.request();
    requests.push({ method: request.method(), path: new URL(request.url()).pathname, payload: request.postData() });
    if (request.url().includes("application-denied")) return route.fulfill({ status: 503, json: { ok: false, message: "Provisioning unavailable." } });
    return route.fulfill({ json: {
      ok: true,
      application: { id: "application-success", accountName: "Approved Workshop", status: "approved" },
      login: { email: "alex@example.com", created: true, setupEmailSent: false },
    } });
  });

  await page.goto("/admin#accounts");
  const successRow = page.getByRole("row", { name: /Approved Workshop/ });
  await successRow.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Trade account Approved Workshop approved.", { exact: true })).toBeVisible();
  await successRow.getByRole("button", { name: "Provision login" }).click();
  await expect(page.getByText("Login provisioned for alex@example.com. Password setup email was not sent.", { exact: true })).toBeVisible();

  const deniedRow = page.getByRole("row", { name: /Denied Workshop/ });
  await deniedRow.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approval denied for QA.", { exact: true })).toBeVisible();
  await expect(deniedRow.getByRole("button", { name: "Approve" })).toBeEnabled();
  await deniedRow.getByRole("button", { name: "Provision login" }).click();
  await expect(page.getByText("Provisioning unavailable.", { exact: true })).toBeVisible();
  await expect(deniedRow.getByRole("button", { name: "Provision login" })).toBeEnabled();

  expect(requests).toHaveLength(4);
  expect(requests.map(({ method, path, payload }) => ({ method, path, payload }))).toEqual([
    { method: "POST", path: "/api/trade-account-applications/application-success/approve", payload: null },
    { method: "POST", path: "/api/trade-account-applications/application-success/provision-login", payload: null },
    { method: "POST", path: "/api/trade-account-applications/application-denied/approve", payload: null },
    { method: "POST", path: "/api/trade-account-applications/application-denied/provision-login", payload: null },
  ]);
  expect(requests[0].idempotencyKey).toEqual(expect.any(String));
  expect(requests[2].idempotencyKey).toEqual(expect.any(String));
  expect(requests[1].idempotencyKey).toBeUndefined();
  expect(requests[3].idempotencyKey).toBeUndefined();
});
