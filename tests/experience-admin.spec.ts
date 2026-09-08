import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: {
    authenticated: true, profile: { role: "admin", displayName: "QA Administrator" },
  } }));
});

test("admin opens overview without exposing unrelated write forms", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("button", { name: "Refresh admin state" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Authoritative purchase order" })).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Landed cost version" })).not.toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin modules" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
});

test("admin legacy deep links and browser back retain the correct section", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", r => { if (["POST", "PATCH", "DELETE"].includes(r.method())) writes.push(r.url()); });
  await page.goto("/admin#products");
  await expect(page.getByRole("heading", { name: "SKU master data", exact: true })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Admin modules" });
  await nav.getByRole("link", { name: "Purchasing", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Authoritative purchase order" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "SKU master data", exact: true })).not.toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "SKU master data", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "SKU master data", exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});

test("business section switching preserves unfinished inputs", async ({ page }) => {
  await page.goto("/admin#products");
  await page.getByLabel("New SKU", { exact: true }).fill("QA-UNSAVED");
  await page.getByRole("navigation", { name: "Admin modules" }).getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Operating exports" })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("New SKU", { exact: true })).toHaveValue("QA-UNSAVED");
});

test("workspace navigation retains role boundaries and provides administration only to admin", async ({ page }) => {
  await page.goto("/partner");
  const nav = page.getByRole("navigation", { name: "Partner operations navigation" });
  await expect(nav.getByRole("link", { name: "Staff management" })).toBeVisible();
  await nav.getByRole("link", { name: "Administration", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "warehouse_staff", displayName: "QA Operator" } } }));
  await page.goto("/warehouse");
  const warehouseNav = page.getByRole("navigation", { name: "Workspace navigation", exact: true });
  await expect(warehouseNav.getByRole("link", { name: "Administration", exact: true })).toHaveCount(0);
  await expect(warehouseNav.getByRole("link", { name: "Staff management" })).toHaveCount(0);
  await expect(warehouseNav.getByRole("link", { name: "Public website" })).toBeVisible();
});

test("complete product register supports paging and browser back without writes", async ({ page }) => {
  await page.route("**/api/admin-state", async route => {
    const response = await route.fetch(); const body = await response.json();
    body.catalogue = Array.from({ length: 61 }, (_, i) => ({ ...body.catalogue[0], sku: `QA-PAGED-${String(i + 1).padStart(3, "0")}` }));
    await route.fulfill({ json: body });
  });
  await page.goto("/admin#products");
  const pager = page.getByRole("group", { name: "Products pagination", exact: true });
  await expect(pager).toContainText("1–25 of 61");
  await expect(pager.getByRole("button", { name: "Previous", exact: true })).toHaveCSS("opacity", "0.55");
  await pager.getByRole("button", { name: "Next", exact: true }).click();
  await expect(pager).toContainText("26–50 of 61");
  await page.goBack();
  await expect(pager).toContainText("1–25 of 61");
  await pager.getByRole("combobox").selectOption("100");
  await expect(pager).toContainText("1–61 of 61");
  await expect(page.getByRole("cell", { name: "QA-PAGED-061", exact: true })).toBeVisible();
});
