import { expect, test } from "@playwright/test";

const routes = ["/partner", "/prearrival", "/warehouse", "/inventory", "/admin/staff", "/admin"];
for (const route of routes) {
  test(`workspace chrome, keyboard and viewport containment ${route}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, profile: { role: "admin", displayName: "QA Administrator with a long display name" } } }));
    // Staff directory is an external-auth surface; no real accounts are needed for layout.
    await page.route("**/api/admin/staff", r => r.fulfill({ json: { ok: true, canManage: true, accounts: [] } }));
    await page.goto(route);
    await expect(page.locator(".operations-frame.has-access")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
    await expect(page.locator(".site-header")).toBeHidden();
    for (const width of [375, 390, 701, 768, 880, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const nav = page.locator(".workspace-navigation").first();
      await expect(nav.getByRole("link", { name: "Public website" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Administration", exact: true })).toBeVisible();
      if ([375, 768, 1440].includes(width)) await page.screenshot({ path: info.outputPath(`${route.replaceAll("/", "-")}-${width}.png`), fullPage: true });
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    // 640 CSS px is the reflow space of a 1280px browser at 200% desktop
    // zoom. Native browser zoom and the physical soft keyboard remain manual.
    await page.setViewportSize({ width: 640, height: 450 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`${route.replaceAll("/", "-")}-zoom-reflow.png`), fullPage: true });
    await page.getByRole("button", { name: "Sign out", exact: true }).focus();
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test("all original public pages remain readable and reachable", async ({ page }, info) => {
  // Catalogue queries Supabase directly, unlike the in-memory warehouse repository.
  // Isolate that external dependency without requesting Production credentials.
  await page.route("**/api/catalogue", route => route.fulfill({ json: { ok: true, products: [{ sku: "QA-CATALOGUE-1", brand: "GWM", name: "Oil filter", category: "Service filter", partNumber: "QA-PN-1", availability: "Enquire" }] } }));
  for (const path of ["/", "/catalogue", "/open-account", "/portal", "/password-setup", "/privacy", "/terms", "/trade-terms", "/delivery-returns-warranty"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), { message: path }).toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: info.outputPath(`public-${path.replaceAll("/", "-")}.png`) });
  }
});
