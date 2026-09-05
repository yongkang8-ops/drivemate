import { expect, test, type Page } from "@playwright/test";

const events = ["C001", "C002", "C003"].map((scope, i) => ({
  id: `history-${scope}`, createdAt: "2026-09-04T13:45:00Z", action: "print_cancelled",
  actionLabel: "Label print cancelled", actor: "Local QA", reference: `cancel-${scope}`,
  shipmentId: "shipment-test-1", cartonNumbers: [scope], outcome: "Print cancelled",
  date: "04 Sept 2026", time: "23:45", timeZone: "Australia/Brisbane",
}));

async function openHistory(page: Page) {
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Full shipment", exact: true }).click();
  await expect(page.getByRole("button", { name: "Find scope", exact: true })).toBeEnabled();
  await page.getByRole("link", { name: "Receipt history", exact: true }).click();
}

test.beforeEach(async ({ page, request }) => {
  await request.post("/api/test/reset");
  await page.route("**/api/warehouse/history?*", route => {
    const q = new URL(route.request().url()).searchParams;
    const scopes = q.getAll("sourceScope");
    const rows = events.filter(e => (!q.get("cartonNumber") || e.cartonNumbers.includes(q.get("cartonNumber")!))
      && (!scopes.length || scopes.some(s => e.cartonNumbers.includes(s)))
      && (!q.get("action") || e.action === q.get("action")));
    return route.fulfill({ json: { ok: true, rows: rows.map(row => ({ ...row, timeZone: q.get("timeZone"), time: q.get("timeZone") === "Asia/Shanghai" ? "21:45" : "23:45" })) } });
  });
});

test("all selected scopes are shown by default; choosing the second scope sticks", async ({ page }) => {
  await openHistory(page);
  await expect(page.getByLabel("Source scope", { exact: true })).toHaveValue("");
  await expect(page.getByText("cancel-C001", { exact: true })).toBeVisible();
  await expect(page.getByText("cancel-C002", { exact: true })).toBeVisible();
  await expect(page.getByText("cancel-C003", { exact: true })).toHaveCount(0);
  await page.getByLabel("Source scope", { exact: true }).selectOption("C002");
  await expect(page.getByText("cancel-C002", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Source scope", { exact: true })).toHaveValue("C002");
  await expect(page.getByText("cancel-C001", { exact: true })).toHaveCount(0);
  await page.getByLabel("Action", { exact: true }).selectOption("print_cancelled");
  await page.getByLabel("Display timezone", { exact: true }).selectOption("Asia/Shanghai");
  await page.getByLabel("Date from", { exact: true }).fill("2026-09-01");
  await page.getByLabel("Date to", { exact: true }).fill("2026-09-06");
  await expect(page.getByLabel("Source scope", { exact: true })).toHaveValue("C002");
  await expect(page.getByText("21:45", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByLabel("Source scope", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Date from", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Action", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Display timezone", { exact: true })).toHaveValue("Asia/Shanghai");
  await expect(page.getByText("cancel-C001", { exact: true })).toBeVisible();
  await expect(page.getByText("cancel-C002", { exact: true })).toBeVisible();
  await expect(page.getByText("cancel-C003", { exact: true })).toHaveCount(0);
});

test("changing the outer scope resets only its dependent selection and cannot leak other scopes", async ({ page }) => {
  await openHistory(page);
  await page.getByLabel("Source scope", { exact: true }).selectOption("C002");
  await page.getByLabel("Source scope C001", { exact: true }).check();
  await expect(page.getByLabel("Source scope", { exact: true })).toHaveValue("C001");
  await expect(page.getByText("cancel-C001", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByText("cancel-C002", { exact: true })).toHaveCount(0);
});

test("an older request cannot replace the latest selection", async ({ page }) => {
  let releaseOld!: () => void;
  const held = new Promise<void>(resolve => { releaseOld = resolve; });
  let oldArrived!: () => void;
  const arrived = new Promise<void>(resolve => { oldArrived = resolve; });
  let served = false;
  await page.route("**/api/warehouse/history?*", async route => {
    const q = new URL(route.request().url()).searchParams;
    if (q.get("cartonNumber") !== "C001") return route.fallback();
    oldArrived();
    await held;
    await route.fulfill({ json: { ok: true, rows: [{ ...events[0], reference: "stale-result" }] } }).catch(() => {});
    served = true;
  });
  await openHistory(page);
  await page.getByLabel("Source scope", { exact: true }).selectOption("C001");
  await arrived;
  await page.getByLabel("Source scope", { exact: true }).selectOption("C002");
  await expect(page.getByText("cancel-C002", { exact: true })).toBeVisible();
  releaseOld();
  await expect.poll(() => served).toBe(true);
  await expect(page.getByText("stale-result", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Source scope", { exact: true })).toHaveValue("C002");
});

test("network failure shows a retry and retry restores current filters", async ({ page }) => {
  let broken = true;
  await page.route("**/api/warehouse/history?*", route => broken ? route.abort("failed") : route.fallback());
  await openHistory(page);
  await expect(page.getByText("Audit history could not be loaded. Try again.", { exact: true })).toBeVisible();
  await expect(page.getByText("History view loaded.", { exact: true })).toHaveCount(0);
  broken = false;
  await page.getByRole("button", { name: "Retry history", exact: true }).click();
  await expect(page.getByText("cancel-C002", { exact: true })).toBeVisible();
});

test("invalid dates remain editable without sending invalid requests or showing false success", async ({ page }) => {
  const queries: string[] = [];
  page.on("request", r => { if (r.url().includes("/api/warehouse/history?")) queries.push(r.url()); });
  await openHistory(page);
  await page.getByLabel("Date from", { exact: true }).fill("2026-02-31");
  await expect(page.getByText("Enter a valid date in YYYY-MM-DD format.", { exact: true })).toBeVisible();
  expect(queries.some(q => q.includes("2026-02-31"))).toBe(false);
  await page.getByLabel("Date from", { exact: true }).fill("2026-09-06");
  await page.getByLabel("Date to", { exact: true }).fill("2026-09-01");
  await expect(page.getByText("Date from must be before or equal to date to.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByText("cancel-C002", { exact: true })).toBeVisible();
});

test("the real local API can read cancelled jobs across scopes without changing their audit", async ({ page, request }, testInfo) => {
  await page.unroute("**/api/warehouse/history?*");
  const ids: string[] = [];
  for (const carton of ["C001", "C002"]) {
    const created = await request.post("/api/warehouse/labels", {
      headers: { "x-drivemate-role": "partner" },
      data: { selection: { shipmentId: "shipment-test-1", cartonNumbers: [carton] }, templateId: "unit_product" },
    });
    expect(created.status()).toBe(201);
    const { job } = await created.json();
    ids.push(job.id);
    const cancelled = await request.post(`/api/warehouse/labels/${job.id}`, {
      headers: { "x-drivemate-role": "partner" }, data: { action: "outcome", outcome: "cancelled" },
    });
    expect(cancelled.ok()).toBeTruthy();
  }
  await openHistory(page);
  await expect(page.getByText(ids[0], { exact: true })).toBeVisible();
  await expect(page.getByText(ids[1], { exact: true })).toBeVisible();
  await page.getByLabel("Source scope", { exact: true }).selectOption("C002");
  await expect(page.getByText(ids[0], { exact: true })).toHaveCount(0);
  await expect(page.getByText(ids[1], { exact: true })).toBeVisible();
  await expect(page.locator(".inbound-history-scope-summary")).toContainText("1 source scope");
  const layoutResults = [];
  for (const width of [1440, 1024, 880, 768, 701, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByLabel("Source scope", { exact: true }).scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    layoutResults.push({ width, ...layout });
    // The release combines the filter patch with the independently tested layout fix.
    expect(layout.scroll, `History overflow at ${width}px`).toBeLessThanOrEqual(layout.client);
    await page.locator("#receipt-history").screenshot({ path: testInfo.outputPath(`history-${width}.png`) });
  }
  await testInfo.attach("layout-observations", { body: JSON.stringify(layoutResults, null, 2), contentType: "application/json" });
  for (const id of ids) {
    const audit = await request.get(`/api/warehouse/labels/${id}`, { headers: { "x-drivemate-role": "partner" } });
    expect((await audit.json()).job.status).toBe("cancelled");
  }
});
