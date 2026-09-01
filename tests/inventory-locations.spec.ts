import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

async function createTwoPhysicalLocations(page: Page) {
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "Location management" })).toBeVisible();

  const createButton = page.getByRole("button", { name: "Create locations" });
  await expect(createButton).toBeDisabled();

  await page.getByLabel("Location code batch").fill("BNE-A01-03\nBNE-A01-04");
  await page.getByRole("button", { name: "Preview exact codes" }).click();
  await expect(page.getByText("DMLOC:BNE-A01-03", { exact: true })).toBeVisible();
  await expect(page.getByText("DMLOC:BNE-A01-04", { exact: true })).toBeVisible();
  await expect(createButton).toBeEnabled();

  await createButton.click();
  await expect(page.getByRole("button", { name: "Edit BNE-A01-03" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit BNE-A01-04" })).toBeVisible();
}

test("a partner creates locations, saves notes, prints two exact label sheets, confirms the job, and retains its audit state", async ({ page, request }) => {
  await page.addInitScript(() => {
    (window as Window & { __locationPrintCalls?: number }).__locationPrintCalls = 0;
    window.print = () => {
      const state = window as Window & { __locationPrintCalls?: number };
      state.__locationPrintCalls = (state.__locationPrintCalls ?? 0) + 1;
    };
  });

  await createTwoPhysicalLocations(page);

  await page.getByRole("button", { name: "Edit BNE-A01-03" }).click();
  await page.getByLabel("Physical description for BNE-A01-03").fill("Aisle A01, shelf 03");
  await page.getByLabel("Notes for BNE-A01-03").fill("Verified during warehouse walk-through");
  await page.getByRole("button", { name: "Save location notes" }).click();
  await expect(page.getByRole("status")).toContainText("Location notes saved");

  await page.getByLabel("Select BNE-A01-03").check();
  await page.getByLabel("Select BNE-A01-04").check();
  await page.getByRole("button", { name: "Preview location labels" }).click();

  await expect(page.getByLabel("Location label for BNE-A01-03")).toBeVisible();
  await expect(page.getByLabel("Location label for BNE-A01-04")).toBeVisible();
  await expect(page.getByRole("img", { name: "Code 128 barcode DMLOC:BNE-A01-03" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Code 128 barcode DMLOC:BNE-A01-04" })).toBeVisible();

  const jobCreated = page.waitForResponse((response) =>
    response.url().includes("/api/inventory/locations/print") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Print location labels" }).click();
  expect((await jobCreated).status()).toBe(201);
  await expect(page.getByText("Awaiting physical confirmation", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { __locationPrintCalls?: number }).__locationPrintCalls ?? 0)).toBe(1);

  const originalJobId = await page.getByLabel("Location print job ID").textContent();
  expect(originalJobId).toBeTruthy();
  await page.getByRole("button", { name: "Confirm printed" }).click();
  await expect(page.getByRole("heading", { name: "Printed confirmation recorded" })).toBeVisible();

  const audit = await request.get(`/api/warehouse/labels/${originalJobId}`, {
    headers: { "x-drivemate-role": "partner" },
  });
  await expect(audit).toBeOK();
  await expect(audit.json()).resolves.toMatchObject({
    ok: true,
    job: { id: originalJobId, status: "printed", templateId: "bin_location", requestedQuantity: 2 },
    items: [
      { payloadSnapshot: { locationCode: "BNE-A01-03", barcode: "DMLOC:BNE-A01-03" } },
      { payloadSnapshot: { locationCode: "BNE-A01-04", barcode: "DMLOC:BNE-A01-04" } },
    ],
  });
});

test("a cancelled job stays auditable and a printed job can reprint one selected item only with a reason", async ({ page, request }) => {
  await createTwoPhysicalLocations(page);
  await page.getByLabel("Select BNE-A01-03").check();
  await page.getByRole("button", { name: "Preview location labels" }).click();
  await page.getByRole("button", { name: "Print location labels" }).click();
  const cancelledJobId = await page.getByLabel("Location print job ID").textContent();
  await page.getByRole("button", { name: "Cancel print" }).click();
  await expect(page.getByRole("heading", { name: "Print cancelled" })).toBeVisible();

  const cancelledAudit = await request.get(`/api/warehouse/labels/${cancelledJobId}`, {
    headers: { "x-drivemate-role": "partner" },
  });
  await expect(cancelledAudit).toBeOK();
  await expect(cancelledAudit.json()).resolves.toMatchObject({ job: { id: cancelledJobId, status: "cancelled" } });

  await page.getByRole("button", { name: "Preview location labels" }).click();
  await page.getByRole("button", { name: "Print location labels" }).click();
  await expect(page.getByRole("heading", { name: "Awaiting physical confirmation" })).toBeVisible();
  const printedJobId = await page.getByLabel("Location print job ID").textContent();
  await page.getByRole("button", { name: "Confirm printed" }).click();
  await expect(page.getByLabel("Reprint label BNE-A01-03")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reprint selected labels" })).toBeDisabled();

  await page.getByLabel("Reprint label BNE-A01-03").check();
  await expect(page.getByRole("button", { name: "Reprint selected labels" })).toBeDisabled();
  await page.getByLabel("Reprint reason").fill("Label damaged while mounting the rack.");
  await page.getByRole("button", { name: "Reprint selected labels" }).click();
  await expect(page.getByText("Reprint job created", { exact: false })).toBeVisible();

  const reprintJobId = await page.getByLabel("Location print job ID").textContent();
  expect(reprintJobId).not.toBe(printedJobId);
  const reprintAudit = await request.get(`/api/warehouse/labels/${reprintJobId}`, {
    headers: { "x-drivemate-role": "partner" },
  });
  await expect(reprintAudit).toBeOK();
  const reprint = await reprintAudit.json() as {
    job: { reprintOfJobId?: string; reprintReason?: string; requestedQuantity: number };
    items: Array<{ sourceItemId?: string; payloadSnapshot: { locationCode?: string } }>;
  };
  expect(reprint.job).toMatchObject({
    reprintOfJobId: printedJobId,
    reprintReason: "Label damaged while mounting the rack.",
    requestedQuantity: 1,
  });
  expect(reprint.items).toHaveLength(1);
  expect(reprint.items[0]).toMatchObject({
    sourceItemId: expect.any(String),
    payloadSnapshot: { locationCode: "BNE-A01-03" },
  });
});

test("the location workspace remains visible at a 390px mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/inventory");

  await expect(page.getByRole("heading", { name: "Location management" })).toBeVisible();
  await expect(page.getByLabel("Location code batch")).toBeVisible();
  await expect(page.getByRole("table", { name: "Location register" })).toBeVisible();
});

test("disabled location actions look unavailable and recover enabled styling", async ({ page }) => {
  await page.goto("/inventory");

  const createButton = page.getByRole("button", { name: "Create locations" });
  await expect(createButton).toBeDisabled();

  const disabledStyle = await createButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      cursor: style.cursor,
    };
  });
  expect(disabledStyle.cursor).toBe("not-allowed");

  await page.getByLabel("Location code batch").fill("BNE-A01-03");
  await page.getByRole("button", { name: "Preview exact codes" }).click();
  await expect(createButton).toBeEnabled();

  const enabledStyle = await createButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      cursor: style.cursor,
    };
  });
  expect(enabledStyle.cursor).toBe("pointer");
  expect(disabledStyle.backgroundColor).not.toBe(enabledStyle.backgroundColor);
  expect(disabledStyle.color).not.toBe(enabledStyle.color);
});
