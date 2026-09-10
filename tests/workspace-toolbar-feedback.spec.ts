import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  await request.post("/api/test/reset");
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "admin", displayName: "QA Administrator" } } }));
  await page.route("**/api/admin/staff", route => route.fulfill({ json: { ok: true, canManage: true, accounts: [] } }));
});

test("mobile dashboard keeps the timezone value and refresh action readable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/partner");
  const zone = page.getByRole("combobox", { name: "Display timezone" });
  await expect(zone).toBeVisible();
  for (const value of ["Australia/Brisbane", "Asia/Shanghai"]) {
    await zone.selectOption(value);
    const fits = await zone.evaluate((element: HTMLSelectElement) => {
      const style = getComputedStyle(element);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d")!;
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 24 >= context.measureText(element.selectedOptions[0].text).width;
    });
    expect(fits).toBe(true);
  }
  const refresh = page.getByRole("button", { name: "Refresh snapshot" });
  expect(await refresh.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
  expect(await refresh.evaluate(element => {
    const style = getComputedStyle(element);
    const context = document.createElement("canvas").getContext("2d")!;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return element.clientWidth >= context.measureText(element.textContent ?? "").width + 24;
  })).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("internal page titles retain a consistent hierarchy at each viewport", async ({ page }) => {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    let reference: unknown;
    for (const path of ["/admin", "/partner", "/prearrival", "/warehouse", "/inventory", "/admin/staff"]) {
      await page.goto(path);
      const heading = page.locator(".operations-frame h1");
      await expect(heading).toBeVisible();
      const type = await heading.evaluate(element => {
        const s = getComputedStyle(element);
        return { size: s.fontSize, weight: s.fontWeight, line: s.lineHeight, tracking: s.letterSpacing };
      });
      reference ??= type;
      expect(type, `${path} at ${width}`).toEqual(reference);
    }
  }
});

test("export actions remain separated when wrapping on desktop and mobile", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin#reports");
    const buttons = page.locator("#reports button");
    await expect(buttons).toHaveCount(9);
    await expect(buttons.first()).toBeVisible();
    const boxes = await buttons.evaluateAll(elements => elements.map(e => {
      const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    }));
    for (let i = 1; i < boxes.length; i++) {
      const a = boxes[i - 1], b = boxes[i];
      expect(Math.abs(a.y - b.y) < 1 ? b.x - a.right : b.y - a.bottom).toBeGreaterThanOrEqual(8);
    }
  }
});

test("Put away instructions do not inherit the label preparation message", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => { if (request.method() === "POST" && /\/api\/warehouse/.test(request.url())) writes.push(request.url()); });
  await page.goto("/warehouse?shipmentId=shipment-test-1");
  await expect(page.getByRole("heading", { name: "Label print", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Put away", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Put away", exact: true })).toBeVisible();
  await expect(page.locator(".inbound-bottom-note")).not.toContainText("Windows print");
  await expect(page.locator(".inbound-message")).not.toContainText("label queue");
  await expect(page.locator(".inbound-bottom-note")).toContainText(/staging/i);
  expect(writes).toEqual([]);
});
