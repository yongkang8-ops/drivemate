import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({
    json: { authenticated: true, profile: { role: "admin", displayName: "QA Administrator" } },
  }));
});

test("purchase preview belongs to the current files and commit is submitted once", async ({ page }) => {
  let previewRequests = 0;
  let commitRequests = 0;
  let releaseCommit!: () => void;
  const commitCanFinish = new Promise<void>((resolve) => { releaseCommit = resolve; });
  let releaseOldPreview!: () => void;
  const oldPreviewCanFinish = new Promise<void>((resolve) => { releaseOldPreview = resolve; });

  await page.route("**/api/admin/imports/purchase-order/preview", async (route) => {
    previewRequests += 1;
    if (previewRequests === 1) await oldPreviewCanFinish;
    await route.fulfill({ json: {
      ok: true,
      previewToken: `preview-${previewRequests}`,
      preview: {
        sourceSha256: "abcdef0123456789abcdef0123456789",
        summary: { lineCount: 2, quantity: 7, finalTotalMinor: 12345, supplementedLines: 1, riskCounts: { high: 0, medium: 1, low: 1 } },
        lines: [],
      },
    } });
  });
  await page.route("**/api/admin/imports/purchase-order/commit", async (route) => {
    commitRequests += 1;
    await commitCanFinish;
    await route.fulfill({ json: { ok: true, importRunId: "run-qa", quantity: 7 } });
  });

  await page.goto("/admin#purchasing");
  const pi = page.getByLabel("Authoritative PI (.xlsx)");
  await pi.setInputFiles({ name: "old.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("old") });
  await page.getByRole("button", { name: "Preview & validate" }).click();
  await pi.setInputFiles({ name: "new.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("new") });
  releaseOldPreview();
  await expect(page.getByRole("button", { name: "Commit approved preview" })).toBeDisabled();
  await expect(page.getByText("Preview passed.")).toHaveCount(0);

  await page.getByRole("button", { name: "Preview & validate" }).click();
  await expect(page.getByText("Packing matched")).toBeVisible();
  await expect(page.getByText("1 / 2")).toBeVisible();
  const commit = page.getByRole("button", { name: "Commit approved preview" });
  await commit.click({ noWaitAfter: true });
  await expect(commit).toBeDisabled();
  await commit.click({ force: true, noWaitAfter: true });
  expect(commitRequests).toBe(1);
  releaseCommit();
  await expect(page.getByText(/Import committed as run-qa\. 7 units/)).toBeVisible();
});

test("operation forms validate locally, preserve values, and show section-specific network failure", async ({ page }) => {
  let accountWrites = 0;
  let releaseAdjustment!: () => void;
  const adjustmentCanFail = new Promise<void>((resolve) => { releaseAdjustment = resolve; });
  await page.route("**/api/admin/accounts/**/adjustments", async (route) => {
    accountWrites += 1;
    await adjustmentCanFail;
    await route.abort("failed");
  });

  await page.goto("/admin#accounts");
  const accountId = page.getByLabel("Trade account ID");
  await page.getByRole("button", { name: "Post account entry" }).click();
  expect(accountWrites).toBe(0);
  await expect(accountId).toBeFocused();
  await expect(page.getByText("Trade account ID is required.", { exact: true })).toBeVisible();

  await accountId.fill("acct-qa");
  await page.getByLabel("Amount AUD", { exact: true }).fill("12.50");
  await page.getByLabel("Reference", { exact: true }).fill("retain-me");
  const submit = page.getByRole("button", { name: "Post account entry" });
  await submit.click({ noWaitAfter: true });
  await expect(submit).toBeDisabled();
  await submit.click({ force: true, noWaitAfter: true });
  expect(accountWrites).toBe(1);
  releaseAdjustment();
  await expect(page.getByText("Result could not be confirmed. Check saved records before retrying.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Reference", { exact: true })).toHaveValue("retain-me");
  await expect(submit).toBeEnabled();
});

test("dashboard distinguishes refresh failure and prevents overlapping create requests", async ({ page }) => {
  let refreshRequests = 0;
  let createRequests = 0;
  let releaseCreate!: () => void;
  const createCanFail = new Promise<void>((resolve) => { releaseCreate = resolve; });
  await page.route("**/api/admin-state", async (route) => {
    refreshRequests += 1;
    if (refreshRequests === 1) {
      const response = await route.fetch();
      await route.fulfill({ response });
      return;
    }
    await route.abort("failed");
  });
  await page.route("**/api/products", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    createRequests += 1;
    await createCanFail;
    await route.abort("failed");
  });

  await page.goto("/admin#products");
  await page.getByRole("button", { name: "Refresh admin state" }).click();
  const firstSku = page.getByRole("region", { name: /Products table/ }).locator("tbody tr").first();
  await expect(firstSku).toBeVisible();
  await page.getByRole("button", { name: "Refresh admin state" }).click();
  await expect(page.getByText("Admin state could not be loaded. Existing records are still shown.", { exact: true })).toBeVisible();
  await expect(firstSku).toBeVisible();

  await page.getByLabel("New SKU", { exact: true }).fill("QA-RECOVERY-001");
  await page.getByLabel("New part name").fill("Recovery test part");
  await page.getByLabel("New barcode").fill("QARECOVERY001");
  const create = page.getByRole("button", { name: "Create SKU master" });
  await create.click({ noWaitAfter: true });
  await expect(create).toBeDisabled();
  await create.click({ force: true, noWaitAfter: true });
  expect(createRequests).toBe(1);
  releaseCreate();
  await expect(page.getByText("Result could not be confirmed. Check saved records before retrying.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("New SKU", { exact: true })).toHaveValue("QA-RECOVERY-001");
  await expect(create).toBeEnabled();
});

test("landed cost treats malformed success as an unknown write outcome", async ({ page }) => {
  await page.route("**/api/admin/landed-costs", (route) => route.fulfill({ status: 200, body: "not-json", contentType: "text/plain" }));
  await page.goto("/admin#costs");
  await page.getByLabel("Shipment ID").fill("shipment-qa");
  await page.getByRole("button", { name: "Save cost version" }).click();
  await expect(page.getByText("Result could not be confirmed. Check saved records before retrying.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Shipment ID")).toHaveValue("shipment-qa");
});

test("dashboard rejects incomplete refresh payload without replacing loaded records", async ({ page }) => {
  let refreshRequests = 0;
  await page.route("**/api/admin-state", async (route) => {
    refreshRequests += 1;
    if (refreshRequests === 1) return route.fulfill({ response: await route.fetch() });
    return route.fulfill({ json: { catalogue: [] } });
  });
  await page.goto("/admin#products");
  await page.getByRole("button", { name: "Refresh admin state" }).click();
  const loadedRow = page.getByRole("region", { name: /Products table/ }).locator("tbody tr").first();
  await expect(loadedRow).toBeVisible();
  await page.getByRole("button", { name: "Refresh admin state" }).click();
  await expect(page.getByText("Admin state returned an unreadable response. Existing records are still shown.", { exact: true })).toBeVisible();
  await expect(loadedRow).toBeVisible();
});

test("successful mutation reports when the following list refresh fails", async ({ page }) => {
  let refreshRequests = 0;
  await page.route("**/api/admin-state", async (route) => {
    refreshRequests += 1;
    if (refreshRequests === 1) return route.fulfill({ response: await route.fetch() });
    return route.abort("failed");
  });
  await page.route("**/api/products", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({ json: { ok: true, product: {
      sku: "QA-REFRESH-001", brand: "GWM", name: "Refresh warning part", category: "Service Filter",
      barcode: "QAREFRESH001", reorderPoint: 0, reorderQuantity: 0, status: "draft",
      onHand: 0, reserved: 0, quarantine: 0, available: 0,
    } } });
  });
  await page.goto("/admin#products");
  await page.getByRole("button", { name: "Refresh admin state" }).click();
  await page.getByLabel("New SKU", { exact: true }).fill("QA-REFRESH-001");
  await page.getByLabel("New part name").fill("Refresh warning part");
  await page.getByLabel("New barcode").fill("QAREFRESH001");
  await page.getByRole("button", { name: "Create SKU master" }).click();
  await expect(page.getByText("QA-REFRESH-001 master data created, but the list could not be refreshed. Existing records may be stale.", { exact: true })).toBeVisible();
});

test("fitment form focuses each missing API-required field without dispatching", async ({ page }) => {
  let writes = 0;
  await page.route("**/api/fitment-rules", (route) => { writes += 1; return route.fulfill({ json: { ok: false, message: "should not dispatch" }, status: 400 }); });
  await page.goto("/admin#products");
  await page.getByRole("button", { name: "Refresh admin state" }).click();

  const make = page.getByLabel("Make", { exact: true });
  const model = page.getByLabel("Model", { exact: true });
  const yearFrom = page.getByLabel("Year from", { exact: true });
  await make.fill("");
  await page.getByRole("button", { name: "Create fitment rule" }).click();
  await expect(make).toBeFocused();
  await expect(page.locator("#fitment-form-error")).toHaveText("Make is required.");
  await make.fill("GWM"); await model.fill("");
  await page.getByRole("button", { name: "Create fitment rule" }).click();
  await expect(model).toBeFocused();
  await expect(page.locator("#fitment-form-error")).toHaveText("Model is required.");
  await model.fill("Cannon Alpha"); await yearFrom.fill("");
  await page.getByRole("button", { name: "Create fitment rule" }).click();
  await expect(yearFrom).toBeFocused();
  await expect(page.locator("#fitment-form-error")).toHaveText("Year from is required.");
  expect(writes).toBe(0);
});
