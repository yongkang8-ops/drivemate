import { expect, test } from "@playwright/test";

test("public home sections remain visible when motion observers do not fire", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 950));
  await page.waitForTimeout(500);

  const hiddenSections = await page.locator("main > section").evaluateAll((sections) =>
    sections
      .filter((section) => Number.parseFloat(getComputedStyle(section).opacity) < 0.99)
      .map((section) => section.className),
  );

  expect(hiddenSections).toEqual([]);
});

test("public home fits a 390px mobile viewport without hidden sections", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    hiddenSections: [...document.querySelectorAll("main > section")]
      .filter((section) => Number.parseFloat(getComputedStyle(section).opacity) < 0.99)
      .map((section) => section.className),
  }));

  expect(layout.viewportWidth).toBe(390);
  expect(layout.documentWidth).toBeLessThanOrEqual(390);
  expect(layout.hiddenSections).toEqual([]);
});
