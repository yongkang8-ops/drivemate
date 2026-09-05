import { expect, test, type Page } from "@playwright/test";

const headers = { "x-drivemate-role": "partner" };
test.beforeEach(async ({ request }) => { await request.post("/api/test/reset"); });

test("Pre-arrival global navigation leaves the shipment rather than scrolling to unrelated sections", async ({ page }) => {
  await page.goto("/prearrival?shipmentId=shipment-test-1");
  await page.locator(".prearrival-nav").getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/partner$/);
  await page.goto("/prearrival?shipmentId=shipment-test-1");
  await page.locator(".prearrival-nav").getByRole("link", { name: /Inventory/ }).click();
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.getByRole("heading", { name: "Location management" })).toBeVisible();
});

test("Dashboard history opens History directly and view navigation survives reload and back", async ({ page }) => {
  await page.goto("/partner");
  await page.getByRole("link", { name: "Open receipt history" }).click();
  await expect(page.getByRole("heading", { name: "Receipt history", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Label print", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Label print", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Receipt history", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Receipt history", exact: true })).toBeVisible();
});

test("direct Put away links show prerequisites without enabling receipt or inventory writes", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", r => { if (r.method() === "POST" && /\/api\/(warehouse|inventory)/.test(r.url())) writes.push(r.url()); });
  await page.goto("/warehouse?shipmentId=shipment-test-1&view=put_away");
  await expect(page.getByRole("heading", { name: "Put away", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Confirm putaway|Confirm put away/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Receive stock", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Receive stock", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm receipt", exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("History deep link works before the first Packing List and Warehouse has global exits", async ({ page, request }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "partner", displayName: "QA Partner" } } }));
  await request.post("/api/test/reset?packingList=empty");
  await page.goto("/warehouse?shipmentId=shipment-test-1&view=receipt_history");
  await expect(page.getByRole("heading", { name: "Receipt history", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Workspace navigation", exact: true }).getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/partner$/);
});

test("warehouse employee navigation does not offer privileged workspaces", async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "warehouse_staff", displayName: "QA Operator" } } }));
  await page.goto("/warehouse");
  const nav = page.getByRole("navigation", { name: "Workspace navigation", exact: true });
  await expect(nav).toBeVisible();
  for (const name of ["Dashboard", "Pre-arrival shipments", "Inventory & locations", "Staff management"]) {
    await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
  await nav.getByRole("link", { name: "Public website", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
});

test("partner Staff navigation does not advertise administrator-only access", async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "partner", displayName: "QA Partner" } } }));
  await page.goto("/admin/staff");
  const nav = page.getByRole("navigation", { name: "Operations modules" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Administration", exact: true })).toHaveCount(0);
});

test("every Administration module link resolves to a real destination", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "SKU master data" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Admin modules", exact: true });
  const targets = await nav.locator("a").evaluateAll(links => links.map(a => ({ name: a.textContent, href: a.getAttribute("href")! })));
  for (const { name, href } of targets.filter(t => t.href.startsWith("#"))) {
    expect(await page.locator(href).count(), `${name} target missing`).toBe(1);
    await nav.getByRole("link", { name: name!, exact: true }).click();
    await expect(page.locator(href)).toBeInViewport();
  }
  await nav.getByRole("link", { name: "Inventory", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Location management" })).toBeVisible();
});

async function assertFocusInViewport(page: Page, label: string) {
  const field = page.getByLabel(label, { exact: true });
  await expect(field).toBeFocused();
  await expect(field).toBeInViewport();
}

test("location Edit locates the editor and Close returns focus to its original row", async ({ page, request }, info) => {
  const codes = Array.from({ length: 30 }, (_, i) => `BNE-QA-${String(i + 1).padStart(2, "0")}`);
  const created = await request.post("/api/inventory/locations", { headers, data: { locationCodes: codes } });
  expect(created.ok()).toBeTruthy();
  await page.goto("/inventory");
  const trigger = page.getByRole("button", { name: "Edit BNE-QA-01", exact: true });
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await trigger.click();
    await assertFocusInViewport(page, "Physical description for BNE-QA-01");
    await page.screenshot({ path: info.outputPath(`location-editor-${width}.png`) });
    await page.getByRole("button", { name: "Close editor", exact: true }).click();
    await expect(trigger).toBeFocused();
    await expect(trigger).toBeInViewport();
  }
});

test("product Edit focuses its loaded master editor without saving or jumping on initial load", async ({ page }, info) => {
  // Enlarge only the local catalogue response to reproduce the real long-register layout.
  await page.route("**/api/admin-state", async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.catalogue = Array.from({ length: 119 }, (_, i) => ({ ...body.catalogue[0], sku: `QA-SKU-${i + 1}` }));
    await route.fulfill({ response, json: body });
  });
  const writes: string[] = [];
  page.on("request", r => { if (r.method() === "PATCH") writes.push(r.url()); });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "SKU master data" })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const row = page.locator("#products tbody tr").first();
  const editor = page.getByRole("heading", { name: "SKU master data" }).locator("..");
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(editor.getByRole("combobox").first()).toHaveValue("QA-SKU-1");
    await expect(editor.getByLabel("Barcode", { exact: true })).toBeFocused();
    await expect(editor.getByLabel("Barcode", { exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`product-editor-${width}.png`) });
  }
  expect(writes).toEqual([]);
});

test("global and local navigation remain usable at every supported width", async ({ page }, info) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "admin", displayName: "QA Admin" } } }));
  for (const path of ["/warehouse", "/prearrival", "/partner", "/inventory"]) {
    await page.goto(path);
    const navs = page.locator(".inbound-nav, .prearrival-nav, .partner-dashboard-nav, .inventory-location-nav");
    await expect(navs.first()).toBeVisible();
    for (const width of [1440, 1024, 880, 768, 701, 375]) {
      await page.setViewportSize({ width, height: 900 });
      const metrics = await navs.evaluateAll(nodes => nodes.map(nav => {
        const rect = nav.getBoundingClientRect();
        return {
          client: nav.clientWidth, scroll: nav.scrollWidth,
          links: Array.from(nav.querySelectorAll("a"), a => {
            const r = a.getBoundingClientRect();
            return { name: a.textContent, inside: r.left >= rect.left - 1 && r.right <= rect.right + 1 && r.width > 0 && r.height > 0 };
          }),
        };
      }));
      for (const nav of metrics) {
        expect(nav.scroll, `${path} nav at ${width}`).toBeLessThanOrEqual(nav.client);
        for (const link of nav.links) expect(link.inside, `${link.name} at ${width}`).toBeTruthy();
      }
      if ([1440, 768, 375].includes(width)) await page.screenshot({ path: info.outputPath(`${path.slice(1)}-${width}.png`) });
    }
  }
});

test("History contains long production-shaped references without truncating their content", async ({ page }, info) => {
  const reference = "c49dad78-2ffc-406a-ac50-3c1e4ffec434";
  const actor = "warehouse.operations@drivemateparts.com.au";
  await page.route("**/api/warehouse/history?*", route => route.fulfill({ json: { ok: true, rows: [{
    id: "qa-layout-event", date: "06 Sept 2026", time: "11:30", timeZone: "Australia/Brisbane",
    action: "print_cancelled", actionLabel: "Label print cancelled", actor, reference,
    outcome: "Print cancelled. No receipt or inventory movement was recorded.",
  }] } }));
  await page.goto("/warehouse?shipmentId=shipment-test-1&view=receipt_history");
  await expect(page.getByText(reference, { exact: true })).toBeVisible();
  for (const width of [375, 701, 768, 880, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const cells = page.locator("#receipt-history [data-label]");
    for (const cell of await cells.all()) {
      const metrics = await cell.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
      expect(metrics.scroll, `${await cell.getAttribute("data-label")} at ${width}`).toBeLessThanOrEqual(metrics.client);
    }
    await expect(page.getByText(actor, { exact: true })).toBeVisible();
    await page.locator("#receipt-history").screenshot({ path: info.outputPath(`history-long-${width}.png`) });
  }
});

test("legacy History hash remains readable and an invalid view falls back to label preparation", async ({ page }) => {
  await page.goto("/warehouse?shipmentId=shipment-test-1#receipt-history");
  await expect(page.getByRole("heading", { name: "Receipt history", exact: true })).toBeVisible();
  await page.goto("/warehouse?shipmentId=shipment-test-1&view=invalid");
  await expect(page.getByRole("heading", { name: "Label print", exact: true })).toBeVisible();
});

test("mobile module navigation brings the requested work panel into view", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "partner", displayName: "QA Partner" } } }));
  await page.goto("/warehouse");
  await page.getByRole("link", { name: "Receipt history", exact: true }).click();
  const heading = page.getByRole("heading", { name: "Receipt history", exact: true });
  await expect(heading).toBeInViewport();
  await expect(heading).toBeFocused();
  await page.goto("/warehouse?shipmentId=shipment-test-1&view=put_away");
  await expect(page.getByRole("heading", { name: "Put away", exact: true })).toBeInViewport();
});

test("populated History fits tablet content width with every field readable", async ({ page, request }, info) => {
  const created = await request.post("/api/warehouse/labels", { headers, data: {
    selection: { shipmentId: "shipment-test-1", cartonNumbers: ["C001"] }, templateId: "unit_product",
  } });
  expect(created.status()).toBe(201);
  const { job } = await created.json();
  expect((await request.post(`/api/warehouse/labels/${job.id}`, { headers, data: { action: "outcome", outcome: "cancelled" } })).ok()).toBeTruthy();
  await page.goto("/warehouse");
  await page.getByRole("link", { name: "Receipt history", exact: true }).click();
  await expect(page.getByText(job.id, { exact: true })).toBeVisible();
  for (const width of [768, 701, 880, 1024, 1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    const panel = page.locator("#receipt-history");
    const bounds = await panel.evaluate(el => ({
      client: el.clientWidth, scroll: el.scrollWidth,
      pageClient: document.documentElement.clientWidth, pageScroll: document.documentElement.scrollWidth,
      fields: Array.from(el.querySelectorAll("[data-label], input, select, button"), field => {
        const r = field.getBoundingClientRect(), p = el.getBoundingClientRect();
        return { label: field.getAttribute("data-label") ?? field.getAttribute("aria-label"), contained: r.left >= p.left && r.right <= p.right, client: field.clientWidth, scroll: field.scrollWidth };
      }),
    }));
    expect(bounds.scroll, `panel at ${width}`).toBeLessThanOrEqual(bounds.client);
    expect(bounds.pageScroll, `page at ${width}`).toBeLessThanOrEqual(bounds.pageClient);
    for (const field of bounds.fields) expect(field.contained, `${field.label} at ${width}`).toBe(true);
    await panel.screenshot({ path: info.outputPath(`history-${width}.png`) });
  }
  const audit = await request.get(`/api/warehouse/labels/${job.id}`, { headers });
  expect((await audit.json()).job.status).toBe("cancelled");
});

test("finishing all staged units keeps the putaway confirmation visible", async ({ page, request }) => {
  expect((await request.post("/api/inventory/locations", { headers, data: { locationCodes: ["BNE-QA-END"] } })).ok()).toBeTruthy();
  await page.addInitScript(() => { window.print = () => undefined; });
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Print labels", exact: true }).click();
  await page.getByRole("button", { name: "Confirm printed", exact: true }).click();
  await page.getByRole("link", { name: "Receive stock", exact: true }).click();
  await page.getByRole("button", { name: "Counted quantity", exact: true }).click();
  for (const [sku, barcode, quantity] of [["DM-GWM-OF-001", "DMPGWMOF001", "12"], ["DM-GWM-AF-002", "DMPGWMAF002", "6"]]) {
    await page.getByLabel("Scan product barcode", { exact: true }).fill(barcode);
    await page.getByLabel("Scan product barcode", { exact: true }).press("Enter");
    await page.getByLabel(`Actual quantity for ${sku}`, { exact: true }).fill(quantity);
    await page.getByRole("button", { name: "Add receipt line", exact: true }).click();
  }
  await page.getByRole("button", { name: "Confirm receipt", exact: true }).click();
  await expect(page.getByText("Receipt confirmed. Actual quantities are recorded in system staging.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Put away", exact: true }).click();
  for (const [barcode, quantity] of [["DMPGWMOF001", "12"], ["DMPGWMAF002", "6"]]) {
    await page.getByLabel("Scan product barcode", { exact: true }).fill(barcode);
    await page.getByLabel("Scan destination location", { exact: true }).fill("DMLOC:BNE-QA-END");
    await page.getByLabel("Move quantity", { exact: true }).fill(quantity);
    await page.getByRole("button", { name: "Confirm put away", exact: true }).click();
    await expect(page.getByText(`Moved ${quantity} units from BNE-RECEIVING-STAGING to BNE-QA-END.`, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Putaway audit has been recorded.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm put away", exact: true })).toBeDisabled();
});
