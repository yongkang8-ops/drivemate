import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("print job remains readable from mobile through narrow desktop", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await page.goto("/warehouse");

  await page.getByLabel("Pallet P001").check();
  await page.getByRole("button", { name: "Preview labels" }).click();
  await page.getByRole("button", { name: "Print labels" }).click();
  await expect(page.getByText("Awaiting physical confirmation")).toBeVisible();

  const printJob = page.locator(".inbound-job-row");
  const workPanel = page.locator(".inbound-work-panel").filter({ has: printJob });
  const referenceBlock = printJob.locator(":scope > div").nth(0);
  const statusBlock = printJob.locator(":scope > div").nth(1);
  const reference = printJob.locator("strong").nth(0);
  const status = printJob.locator("strong").nth(1);
  const actions = printJob.locator(".inbound-job-actions");
  const cancelButton = actions.getByRole("button", { name: "Cancel print" });
  const confirmButton = actions.getByRole("button", { name: "Confirm printed" });

  const expectHorizontallyContained = (
    child: { x: number; width: number },
    container: { x: number; width: number },
  ) => {
    expect(child.x).toBeGreaterThanOrEqual(container.x - 1);
    expect(child.x + child.width).toBeLessThanOrEqual(container.x + container.width + 1);
  };

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1600, height: 900 },
    { width: 1440, height: 900 },
    { width: 1040, height: 900 },
    { width: 880, height: 900 },
    { width: 768, height: 900 },
    { width: 701, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(reference).toBeVisible();
    await expect(status).toBeVisible();

    const documentWidth = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(documentWidth.scrollWidth).toBeLessThanOrEqual(documentWidth.clientWidth);

    const maxTextHeight = viewport.width > 700 ? 48 : 72;
    const [panelBox, printJobBox, referenceBlockBox, statusBlockBox, referenceBox, statusBox, actionsBox] = await Promise.all([
      workPanel.boundingBox(),
      printJob.boundingBox(),
      referenceBlock.boundingBox(),
      statusBlock.boundingBox(),
      reference.boundingBox(),
      status.boundingBox(),
      actions.boundingBox(),
    ]);
    expect(panelBox).not.toBeNull();
    expect(printJobBox).not.toBeNull();
    expect(referenceBlockBox).not.toBeNull();
    expect(statusBlockBox).not.toBeNull();
    expect(referenceBox).not.toBeNull();
    expect(statusBox).not.toBeNull();
    expect(actionsBox).not.toBeNull();
    expectHorizontallyContained(printJobBox!, panelBox!);
    expectHorizontallyContained(referenceBox!, panelBox!);
    expectHorizontallyContained(statusBox!, panelBox!);
    expectHorizontallyContained(actionsBox!, panelBox!);
    expect(referenceBox!.height).toBeLessThanOrEqual(maxTextHeight);
    expect(statusBox!.height).toBeLessThanOrEqual(maxTextHeight);

    const contentWidth = await workPanel.evaluate(element => element.clientWidth - parseFloat(getComputedStyle(element).paddingLeft) - parseFloat(getComputedStyle(element).paddingRight));
    if (viewport.width > 1100 && contentWidth > 780) {
      const gridColumns = await printJob.evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean),
      );
      expect(gridColumns).toHaveLength(3);
      expect(referenceBlockBox!.y).toBeLessThan(actionsBox!.y + actionsBox!.height);
      expect(actionsBox!.y).toBeLessThan(referenceBlockBox!.y + referenceBlockBox!.height);
      expect(statusBlockBox!.y).toBeLessThan(actionsBox!.y + actionsBox!.height);
      expect(actionsBox!.y).toBeLessThan(statusBlockBox!.y + statusBlockBox!.height);
    }

    if ([768, 701, 390].includes(viewport.width)) {
      const [cancelBox, confirmBox] = await Promise.all([
        cancelButton.boundingBox(),
        confirmButton.boundingBox(),
      ]);
      expect(cancelBox).not.toBeNull();
      expect(confirmBox).not.toBeNull();
      expectHorizontallyContained(cancelBox!, actionsBox!);
      expectHorizontallyContained(confirmBox!, actionsBox!);
      expectHorizontallyContained(cancelBox!, printJobBox!);
      expectHorizontallyContained(confirmBox!, printJobBox!);
      if (viewport.width === 390) {
        expect(Math.abs(cancelBox!.width - confirmBox!.width)).toBeLessThanOrEqual(1);
      }
    }
  }
});

test("an operator prints the selected pallet labels and unlocks receipt only after confirming the physical outcome", async ({ page }) => {
  await page.goto("/warehouse");

  await page.getByLabel("Shipment").selectOption("shipment-test-1");
  await page.getByLabel("Pallet P001").check();
  await page.getByRole("button", { name: "Preview labels" }).click();
  await expect(page.getByText("DM-GWM-OF-001", { exact: true })).toBeVisible();
  await expect(page.getByText("18 labels")).toBeVisible();

  await page.getByRole("button", { name: "Print labels" }).click();
  await expect(page.getByText("Awaiting physical confirmation")).toBeVisible();
  await page.getByRole("button", { name: "Confirm printed" }).click();

  await expect(page.getByText("Receipt unlocked", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Receive stock" }).click();
  await expect(page.getByRole("heading", { name: "Receive stock" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm receipt" })).toBeDisabled();
});

test("a cancelled print task leaves receipt locked for the selected scope", async ({ page }) => {
  await page.goto("/warehouse");

  await page.getByLabel("Pallet P001").check();
  await page.getByRole("button", { name: "Preview labels" }).click();
  await page.getByRole("button", { name: "Print labels" }).click();
  await page.getByRole("button", { name: "Cancel print" }).click();

  await expect(page.getByText("Receipt locked")).toBeVisible();
  await page.getByRole("link", { name: "Receive stock", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Receive stock", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm receipt", exact: true })).toHaveCount(0);
});

test("a confirmed print unlocks counted-quantity receipt into the system staging location", async ({ page }) => {
  await page.goto("/warehouse");

  await page.getByRole("button", { name: "Preview labels" }).click();
  await page.getByRole("button", { name: "Print labels" }).click();
  await page.getByRole("button", { name: "Confirm printed" }).click();
  await page.getByRole("link", { name: "Receive stock" }).click();
  await page.getByRole("button", { name: "Counted quantity" }).click();

  await page.getByLabel("Scan product barcode").fill("DMPGWMOF001");
  await page.getByLabel("Scan product barcode").press("Enter");
  await page.getByLabel("Actual quantity for DM-GWM-OF-001").fill("11");
  await expect(page.getByRole("button", { name: "Add receipt line" })).toBeDisabled();
  await page.getByLabel("Difference reason for DM-GWM-OF-001").fill("Supplier short packed one unit.");
  await expect(page.getByRole("button", { name: "Add receipt line" })).toBeEnabled();
  await page.getByRole("button", { name: "Add receipt line" }).click();

  await page.getByLabel("Scan product barcode").fill("DMPGWMAF002");
  await page.getByLabel("Scan product barcode").press("Enter");
  await page.getByLabel("Actual quantity for DM-GWM-AF-002").fill("6");
  await page.getByRole("button", { name: "Add receipt line" }).click();

  await expect(page.getByRole("button", { name: "Confirm receipt" })).toBeEnabled();
  await page.getByRole("button", { name: "Confirm receipt" }).click();
  await expect(page.getByText("Receipt confirmed. Actual quantities are recorded in system staging.")).toBeVisible();
  await expect(page.getByText("BNE-RECEIVING-STAGING", { exact: true })).toHaveCount(1);
});
