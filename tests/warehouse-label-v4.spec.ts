import { expect, test } from "@playwright/test";
test.beforeEach(async ({ request }) => { expect((await request.post("/api/test/reset")).ok()).toBeTruthy(); });

test("carton lookup explains a SKU, preserves selection, and responds on Enter and click", async ({ page }) => {
  await page.goto("/warehouse");
  const input = page.getByLabel("Find source scope or member carton");
  const before = await page.locator(".inbound-scope-bar").innerText();
  await input.fill("DM-GWM-OF-001"); await page.getByRole("button", { name: "Find scope", exact: true }).click();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#warehouse-scope-feedback")).toContainText("This is a product SKU or barcode");
  expect(await page.locator(".inbound-scope-bar").innerText()).toBe(before);
  await input.fill("C002"); await input.press("Enter");
  await expect(page.locator("#warehouse-scope-feedback")).toContainText("Source scope C002 selected.");
  await expect(input).toHaveAttribute("aria-invalid", "false");
  await expect(page.locator(".inbound-scope-bar")).toContainText("24 expected units");
});

test("metadata editor saves two-line product artwork and Position states; preview is responsive", async ({ page }, testInfo) => {
  await page.goto("/admin#sku-master-editor");
  const editor = page.getByRole("heading", { name: "SKU master data" }).locator("..");
  await expect(editor.getByRole("combobox", { name: "SKU", exact: true })).toBeVisible();
  await editor.getByRole("combobox", { name: "SKU", exact: true }).selectOption("DM-GWM-OF-001");
  await editor.getByLabel("Label product name").fill("FRONT SUSPENSION LOWER CONTROL ARM ASSEMBLY");
  await editor.getByLabel("Compatible vehicle makes").fill("Toyota,Lexus");
  await editor.getByLabel("Position applicability").selectOption("specified");
  await editor.getByLabel("Label position", { exact: true }).fill("Front / Left (LH)");
  const saved = page.waitForResponse(response => response.url().endsWith("/api/products/DM-GWM-OF-001") && response.request().method() === "PATCH");
  await editor.getByRole("button", { name: "Save SKU master" }).click();
  expect((await saved).ok()).toBeTruthy();
  await page.reload(); await expect(editor.getByLabel("Label position", { exact: true })).toHaveValue("Front / Left (LH)");
  await page.goto("/warehouse");
  const label = page.locator(".warehouse-label-print-sheet .product-label-v4");
  await expect(label).toContainText("For Toyota / Lexus"); await expect(label).toContainText("Position: Front / Left (LH)");
  for (const width of [375, 701, 768, 880, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await label.evaluate(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, overflow: element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth, pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
    expect(layout.overflow, `label at ${width}`).toBe(false); expect(layout.pageOverflow, `page at ${width}`).toBe(false);
    expect(await page.locator(".warehouse-label-print-sheet").evaluate(element => element.scrollWidth <= element.clientWidth), `full preview visible at ${width}`).toBe(true);
    expect(layout.width).toBeCloseTo(70 * 96 / 25.4, 0); expect(layout.height).toBeCloseTo(50 * 96 / 25.4, 0);
    await label.screenshot({ path: testInfo.outputPath(`product-v4-${width}.png`) });
  }
});

test("missing details block only new labels and keep history available", async ({ request, page }) => {
  const patch = await request.patch("/api/products/DM-GWM-OF-001", { headers: { "x-drivemate-role": "admin" }, data: { labelProfile: null } }); expect(patch.ok()).toBeTruthy();
  await page.goto("/warehouse");
  await expect(page.getByRole("button", { name: "Print labels", exact: true })).toBeDisabled();
  await expect(page.locator(".label-readiness-alert").first()).toContainText("DM-GWM-OF-001");
  await page.getByRole("link", { name: "Receipt history", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Receipt history", exact: true })).toBeVisible();
});

test("location label preserves a long code and fits its physical sheet across viewports", async ({ request, page }, testInfo) => {
  const code = "BNE-RACK1234567890-LEVEL123-SEGMENT123";
  expect((await request.post("/api/inventory/locations", { headers: { "x-drivemate-role": "partner" }, data: { locationCodes: [code] } })).ok()).toBeTruthy();
  await page.goto("/inventory"); await page.getByLabel(`Select ${code}`, { exact: true }).check();
  await page.getByRole("button", { name: "Preview location labels", exact: true }).click();
  const label = page.getByLabel(`Location label for ${code}`, { exact: true });
  await expect(label).toContainText(`DMLOC:${code}`);
  for (const width of [375, 701, 768, 880, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await label.evaluate(element => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight), `location label at ${width}`).toBe(true);
    const pageLayout = await page.evaluate(() => ({ fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth, offenders: Array.from(document.querySelectorAll("section,main,article,div")).filter(element => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1).map(element => ({ cls: element.className, width: element.getBoundingClientRect().width })).slice(0, 15) }));
    expect(pageLayout.fits, `inventory at ${width}: ${JSON.stringify(pageLayout.offenders)}`).toBe(true);
  }
  await label.screenshot({ path: testInfo.outputPath("long-location-label.png") });
});
