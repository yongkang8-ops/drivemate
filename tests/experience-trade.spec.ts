import { expect, test, type Page } from "@playwright/test";

const part = { sku: "QA-PART-1", brand: "GWM", name: "QA filter", category: "Filter", vehicle: "Cannon", fitment: "Reviewed", available: 20, tradePriceExGstCents: 1000, fitmentConfidence: "exact" };
const vehicle = { make: "GWM", model: "Cannon", market: "AU-spec", confidence: "exact" };
const dispatched = { id: "QA-DISPATCHED", status: "dispatched", poNumber: "QA-OLD", totalIncGstCents: 1100, lines: [{ sku: part.sku, quantity: 1 }] };
const doc = { id: "QA-DOC", type: "invoice", reference: "QA-INVOICE", createdAt: "2026-09-08T00:00:00Z" };
async function session(page: Page) {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { authenticated: true, profile: { role: "trade", displayName: "QA workshop" } } }));
  await page.route("**/api/vehicle-lookup", route => route.fulfill({ json: { vehicle, matches: [part] } }));
}

test("Trade user can find a part, submit and cancel an order, open a document and request a return", async ({ page }) => {
  await session(page);
  let orders = [dispatched]; let orderWrites = 0; let rmaWrites = 0;
  await page.route("**/api/trade-state", route => route.fulfill({ json: { orders, accountDocuments: [doc] } }));
  await page.route("**/api/orders", route => {
    orderWrites++;
    expect(route.request().postDataJSON().lines).toEqual([{ sku: part.sku, quantity: 1 }]);
    orders = [...orders, { ...dispatched, id: "QA-NEW", poNumber: "QA-JOB", status: "submitted" }];
    return route.fulfill({ json: { ok: true, order: orders[1] } });
  });
  await page.route("**/api/orders/QA-NEW/cancel", route => { orders[1] = { ...orders[1], status: "cancelled" }; return route.fulfill({ json: { ok: true, order: orders[1] } }); });
  await page.route("**/api/account-documents/QA-DOC", route => route.fulfill({ json: { ok: true, downloadUrl: "/qa-invoice.pdf" } }));
  await page.route("**/api/rma", route => { rmaWrites++; expect(route.request().postDataJSON().salesOrderId).toBe(dispatched.id); return route.fulfill({ json: { ok: true, rmaId: "QA-RMA" } }); });
  await page.goto("/portal");
  await page.getByRole("button", { name: "Search matching parts", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("PO / job number", { exact: true }).fill("QA-JOB");
  await page.getByRole("button", { name: "Submit order", exact: true }).click();
  await expect(page.locator(".workspace-feedback[role=status]")).toContainText("Order QA-NEW submitted");
  expect(orderWrites).toBe(1);
  await page.getByRole("table", { name: "Trade orders", exact: true }).getByRole("row").filter({ hasText: "QA-NEW" }).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".workspace-feedback[role=status]")).toContainText("Order QA-NEW cancelled");
  await page.getByRole("button", { name: "Open QA-INVOICE", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open QA-INVOICE in a new tab" })).toHaveAttribute("href", /qa-invoice\.pdf$/);
  await page.getByLabel("Dispatched order", { exact: true }).selectOption(dispatched.id);
  await page.getByLabel("Return lines: SKU, quantity", { exact: true }).fill(`${part.sku},1`);
  await page.getByRole("button", { name: "Submit return request", exact: true }).click();
  await expect(page.locator(".workspace-feedback[role=status]")).toContainText("QA-RMA submitted for review");
  expect(rmaWrites).toBe(1);
});

test("a separate successful return does not erase an uncertain order's retry identity", async ({ page }) => {
  await session(page);
  const keys: string[] = [];
  await page.route("**/api/trade-state", route => route.fulfill({ json: { orders: [dispatched], accountDocuments: [] } }));
  await page.route("**/api/orders", route => { keys.push(route.request().headers()["idempotency-key"]); return route.abort("failed"); });
  await page.route("**/api/rma", route => route.fulfill({ json: { ok: true, rmaId: "QA-RMA" } }));
  await page.goto("/portal");
  await page.getByRole("button", { name: "Search matching parts", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Submit order", exact: true }).click();
  await expect(page.locator(".workspace-feedback[role=status]")).toContainText("could not be confirmed");
  expect(keys).toHaveLength(1);
  await page.getByLabel("Dispatched order", { exact: true }).selectOption(dispatched.id);
  await page.getByLabel("Return lines: SKU, quantity", { exact: true }).fill(`${part.sku},1`);
  await page.getByRole("button", { name: "Submit return request", exact: true }).click();
  await expect(page.locator(".workspace-feedback[role=status]")).toContainText("QA-RMA submitted");
  await page.getByRole("button", { name: "Submit order", exact: true }).click();
  await expect(page.locator(".workspace-feedback[role=status]")).toContainText("could not be confirmed");
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy(); expect(keys[1]).toBe(keys[0]);
});

test("all four Trade tables expose complete data with independent paging", async ({ page }) => {
  await session(page);
  const parts = Array.from({ length: 31 }, (_, i) => ({ ...part, sku: `QA-PART-${String(i + 1).padStart(2, "0")}` }));
  await page.route("**/api/vehicle-lookup", route => route.fulfill({ json: { vehicle, matches: parts } }));
  await page.route("**/api/trade-state", route => route.fulfill({ json: { orders: parts.map((p, i) => ({ ...dispatched, id: `QA-ORDER-${i}` })), accountDocuments: parts.map((p, i) => ({ ...doc, id: `QA-DOC-${i}`, reference: `QA-INVOICE-${i}` })) } }));
  await page.goto("/portal");
  await page.getByRole("button", { name: "Search matching parts", exact: true }).click();
  const matching = page.getByRole("table", { name: "Matching parts", exact: true });
  for (let i = 0; i < 25; i++) await matching.getByRole("button", { name: "Add", exact: true }).nth(i).click();
  await page.getByRole("group", { name: "Matching parts pagination", exact: true }).getByRole("button", { name: "Next", exact: true }).click();
  for (let i = 0; i < 6; i++) await matching.getByRole("button", { name: "Add", exact: true }).nth(i).click();
  for (const name of ["Order pad", "Trade orders", "Account documents"]) {
    const pager = page.getByRole("group", { name: `${name} pagination`, exact: true });
    await expect(pager).toContainText("1–25 of 31");
    await pager.getByRole("button", { name: "Next", exact: true }).click();
    await expect(pager).toContainText("26–31 of 31");
    await pager.getByRole("combobox").selectOption("100");
    await expect(pager).toContainText("1–31 of 31");
  }
});
