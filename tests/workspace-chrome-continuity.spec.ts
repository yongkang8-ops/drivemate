import { expect, test } from "@playwright/test";

test("same administrator keeps primary navigation geometry across workspace pages", async ({ page }) => {
  await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, profile: { role: "admin", displayName: "QA Administrator" } } }));
  await page.route("**/api/admin/staff", r => r.fulfill({ json: { ok: true, canManage: true, accounts: [] } }));
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    let reference: { x: number; y: number; width: number; height: number } | null = null;
    for (const path of ["/admin", "/partner", "/prearrival", "/warehouse", "/inventory", "/admin/staff"]) {
      await page.goto(path);
      const link = page.locator(".workspace-navigation").first().getByRole("link", { name: "Dashboard", exact: true });
      await expect(link).toBeVisible();
      const box = (await link.boundingBox())!;
      if (!reference) reference = box;
      for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(box[key] - reference[key]), `${path} at ${width}: ${key}`).toBeLessThanOrEqual(1);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
  }
});
