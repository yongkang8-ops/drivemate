import { expect, test } from "@playwright/test";

test("every administrator register has its complete paginated path in the correct section", async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "admin", displayName: "QA Administrator" } } }));
  await page.route("**/api/admin-state", async route => {
    const response = await route.fetch(); const body = await response.json();
    const fallback = { sku: "QA-SKU", brand: "GWM", name: "QA part", status: "approved", userId: "QA-USER", role: "trade", displayName: "QA user", id: "QA-ID", accountName: "QA workshop", contactName: "QA contact", contactEmail: "qa@example.invalid", contactPhone: "0400000000", vehicle: "QA vehicle", lines: [], quantity: 1, movement: "receipt", location: "BNE-QA", type: "invoice", createdAt: "2026-09-08T00:00:00Z", reorderPoint: 5, reorderQuantity: 10 };
    for (const [key, value] of Object.entries(body)) {
      if (!Array.isArray(value)) continue;
      body[key] = Array.from({ length: 31 }, (_, i) => ({ ...fallback, ...value[0], sku: `QA-SKU-${i}`, id: `QA-ID-${i}`, userId: `QA-USER-${i}`, batchNo: `QA-BATCH-${i}`, status: key === "tradeAccounts" ? "approved" : value[0]?.status ?? "active" }));
    }
    await route.fulfill({ json: body });
  });
  await page.goto("/admin");
  const sections: Array<[string, string[]]> = [
    ["Overview", ["Reorder alerts"]],
    ["Purchasing", ["Purchase batches"]],
    ["Products & fitment", ["Products", "Fitment rules", "Lookup requests"]],
    ["Accounts", ["Trade accounts", "User roles", "Account applications"]],
    ["Orders & returns", ["Orders", "Stock movements", "Account documents"]],
    ["Pricing & compliance", ["Pricing rules", "RFQ reviews"]],
  ];
  for (const [section, labels] of sections) {
    await page.getByRole("navigation", { name: "Admin modules" }).getByRole("link", { name: section, exact: true }).click();
    for (const label of labels) {
      const pager = page.getByRole("group", { name: `${label} pagination`, exact: true });
      await expect(pager).toContainText("1–25 of 31");
      await pager.getByRole("button", { name: "Next", exact: true }).click();
      await expect(pager).toContainText("26–31 of 31");
      await pager.getByRole("combobox").selectOption("100");
      await expect(pager).toContainText("1–31 of 31");
    }
  }
});

test("purchase preview offers all rows rather than a twelve-row excerpt", async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "admin", displayName: "QA Administrator" } } }));
  const lines = Array.from({ length: 61 }, (_, i) => ({ sku: `QA-ROW-${i + 1}`, partNumber: `QA-PN-${i + 1}`, nameEn: "QA part", quantity: 1, cashPurchaseCostMinor: 100, riskTier: "low" }));
  await page.route("**/api/admin/imports/purchase-order/preview", route => route.fulfill({ json: { ok: true, previewToken: "local-fixture-only", preview: { summary: { lineCount: 61, quantity: 61, finalTotalMinor: 6100, riskCounts: { low: 61, medium: 0, high: 0 }, supplementedLines: 0 }, warnings: [], sourceSha256: "qa-fixture-only", lines } } }));
  await page.goto("/admin#purchasing");
  await page.getByLabel("Authoritative PI (.xlsx)", { exact: true }).setInputFiles({ name: "qa-preview.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("intercepted local UI fixture, not an import workbook") });
  await page.getByRole("button", { name: "Preview & validate", exact: true }).click();
  const pager = page.getByRole("group", { name: "Purchase preview pagination", exact: true });
  await expect(pager).toContainText("1–25 of 61");
  await pager.getByRole("combobox").selectOption("100");
  await expect(page.getByRole("cell", { name: "QA-ROW-61", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Admin modules" }).getByRole("link", { name: "Overview", exact: true }).click();
  await page.goBack();
  await expect(page.getByRole("cell", { name: "QA-ROW-61", exact: true })).toBeVisible();
});

test("all existing administrator export buttons download and recover after failure", async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "admin", displayName: "QA Administrator" } } }));
  await page.goto("/admin#reports");
  const buttons = page.getByRole("button", { name: /^Export / });
  await expect(buttons).toHaveCount(9);
  for (let i = 0; i < 9; i++) {
    const download = page.waitForEvent("download");
    await buttons.nth(i).click();
    expect((await download).suggestedFilename()).toMatch(/^drivemate-.*\.csv$/);
    await expect(buttons.nth(i)).toBeEnabled();
  }
  await page.route("**/api/admin-export?**", route => route.abort("failed"));
  await buttons.first().click();
  await expect(page.getByRole("status").first()).toContainText("could not be downloaded");
  await expect(buttons.first()).toBeEnabled();
});

test("public search, filter, zero result and all legal/footer links work through real clicks", async ({ page }) => {
  const products = [{ sku: "QA-OIL", partNumber: "QA-PN-OIL", brand: "GWM", name: "Oil filter", category: "Filter", availability: "Enquire" }, { sku: "QA-AIR", partNumber: "QA-PN-AIR", brand: "GWM", name: "Air filter", category: "Filter", availability: "Enquire" }];
  await page.route("**/api/catalogue", route => route.fulfill({ json: { ok: true, products } }));
  await page.goto("/");
  await page.getByLabel("VIN, Part Number, vehicle or engine", { exact: true }).fill("QA-PN-OIL");
  await page.getByRole("button", { name: "Search catalogue", exact: true }).click();
  await expect(page).toHaveURL(/\/catalogue\?q=QA-PN-OIL$/);
  await expect(page.getByRole("heading", { name: "Oil filter", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Air filter", exact: true })).toHaveCount(0);
  await page.getByLabel("Search released catalogue", { exact: true }).fill("QA-NO-MATCH");
  await expect(page.getByRole("heading", { name: "No released match found" })).toBeVisible();
  await page.getByRole("link", { name: "Open Trade Portal", exact: true }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await page.goBack();
  for (const [label, path] of [["Privacy", "/privacy"], ["Website Terms", "/terms"], ["Trade Terms", "/trade-terms"], ["Delivery, Returns & Warranty", "/delivery-returns-warranty"], ["Staff login", "/staff/login"]]) {
    await page.locator(".site-footer").getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(path + "$"));
    await expect(page.locator("h1").first()).toBeVisible();
  }
  await page.goto("/");
  for (const [label, hash] of [["Delivery", "delivery"], ["Account Support", "support"]]) {
    await page.locator(".site-header").getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/#" + hash + "$"));
    await expect(page.locator(`#${hash}`)).toBeInViewport();
  }
});

test("Catalogue can browse beyond 25 products and restore its search and page", async ({ page }) => {
  const products = Array.from({ length: 31 }, (_, i) => ({ sku: `QA-CATALOGUE-${i + 1}`, brand: "GWM", name: `QA filter ${i + 1}`, category: "Filter", availability: "Enquire" }));
  await page.route("**/api/catalogue", route => route.fulfill({ json: { ok: true, products } }));
  await page.goto("/catalogue");
  await page.getByLabel("Search released catalogue", { exact: true }).fill("QA filter");
  const pager = page.getByRole("group", { name: "Catalogue pagination", exact: true });
  await expect(pager).toContainText("1–25 of 31");
  await pager.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "QA filter 31", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Search released catalogue", { exact: true })).toHaveValue("QA filter");
  await expect(pager).toContainText("26–31 of 31");
  await pager.getByRole("combobox").selectOption("100");
  await expect(pager).toContainText("1–31 of 31");
  await page.evaluate(() => scrollTo({ top: 1000, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(1000);
  await page.goto("/");
  await page.goBack();
  await expect(pager).toContainText("1–31 of 31");
  await expect.poll(() => page.evaluate(() => Math.abs(scrollY - 1000))).toBeLessThan(5);
});

test("creating a new SKU retains unrelated master and fitment drafts", async ({ page, request }) => {
  await request.post("/api/test/reset");
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "admin", displayName: "QA Administrator" } } }));
  await page.goto("/admin#products");
  await page.getByLabel("Barcode", { exact: true }).fill("QA-UNSAVED-BARCODE");
  await page.getByLabel("Make", { exact: true }).fill("QA unsaved make");
  const fitmentSku = await page.getByRole("combobox", { name: /Fitment SKU/ }).inputValue();
  await page.getByLabel("New SKU", { exact: true }).fill("QA-NEW-INDEPENDENT");
  await page.getByLabel("New part name", { exact: true }).fill("QA independent part");
  await page.getByLabel("New barcode", { exact: true }).fill("QA-NEW-INDEPENDENT-CODE");
  await page.getByRole("button", { name: "Create SKU master", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("QA-NEW-INDEPENDENT master data created");
  await expect(page.getByLabel("Barcode", { exact: true })).toHaveValue("QA-UNSAVED-BARCODE");
  await expect(page.getByLabel("Make", { exact: true })).toHaveValue("QA unsaved make");
  await expect(page.getByRole("combobox", { name: /Fitment SKU/ })).toHaveValue(fitmentSku);
  let prompts = 0;
  page.on("dialog", async dialog => { prompts++; await dialog.dismiss(); });
  await page.getByRole("navigation", { name: "Workspace navigation", exact: true }).getByRole("link", { name: "Dashboard", exact: true }).click();
  expect(prompts).toBe(1);
});
