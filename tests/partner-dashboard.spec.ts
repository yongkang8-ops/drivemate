import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("partners can review the saved inbound operation snapshot in either display timezone", async ({ page }) => {
  await page.goto("/partner");

  await expect(page.getByRole("heading", { name: "Inbound pipeline command board" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inbound shipment board" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attention queue" })).toBeVisible();
  await expect(page.getByText("Label print confirmation required")).toBeVisible();
  await expect(page.getByText("Prepare labels", { exact: true })).toBeVisible();
  await expect(page.getByText(/2 source scopes · 2 physical cartons/)).toBeVisible();
  await expect(page.getByLabel("Display timezone")).toHaveValue("Australia/Brisbane");

  await page.getByLabel("Display timezone").selectOption("Asia/Shanghai");
  await expect(page.getByText("China Standard Time", { exact: true })).toBeVisible();
});

test("the dashboard reflects a label-confirmed receipt that remains in system staging", async ({ page }) => {
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Preview labels" }).click();
  await page.getByRole("button", { name: "Print labels" }).click();
  await page.getByRole("button", { name: "Confirm printed" }).click();
  await page.getByRole("link", { name: "Receive stock" }).click();
  await page.getByRole("button", { name: "Counted quantity" }).click();

  await page.getByLabel("Scan product barcode").fill("DMPGWMOF001");
  await page.getByLabel("Scan product barcode").press("Enter");
  await page.getByLabel("Actual quantity for DM-GWM-OF-001").fill("12");
  await page.getByRole("button", { name: "Add receipt line" }).click();
  await page.getByLabel("Scan product barcode").fill("DMPGWMAF002");
  await page.getByLabel("Scan product barcode").press("Enter");
  await page.getByLabel("Actual quantity for DM-GWM-AF-002").fill("6");
  await page.getByRole("button", { name: "Add receipt line" }).click();
  await page.getByRole("button", { name: "Confirm receipt" }).click();
  await expect(page.getByText("Receipt confirmed. Actual quantities are recorded in system staging.")).toBeVisible();

  await page.goto("/partner");
  await expect(page.getByText("In staging", { exact: true })).toBeVisible();
  const operationStatus = page.getByLabel("Operation status for BNE-TEST-001");
  await expect(operationStatus.getByText("Receipt confirmed", { exact: true })).toBeVisible();
  await expect(operationStatus.getByText("Putaway pending", { exact: true })).toBeVisible();
  await expect(page.locator(".partner-metric-grid article").nth(2).getByText("18", { exact: true })).toBeVisible();
});

test("the dashboard separates a carton group from its physical carton count", async ({
  page,
  request,
}) => {
  const created = await request.post(
    "/api/prearrival/shipments/shipment-test-1/revisions",
    {
      headers: { "x-drivemate-role": "partner" },
      data: {
        schemaVersion: 3,
        shipmentId: "shipment-test-1",
        cartons: [{
          sourceCartonNumber: "7#8#9#",
          kind: "carton_group",
          physicalCartonCount: 3,
          memberCartonNumbers: ["7#", "8#", "9#"],
          sourcePalletNumber: null,
          lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 10 }],
        }],
      },
    },
  );
  expect(created.status()).toBe(201);
  const body = await created.json();
  const confirmed = await request.post(
    `/api/prearrival/revisions/${body.revision.id}/confirm`,
    { headers: { "x-drivemate-role": "partner" } },
  );
  expect(confirmed.ok()).toBeTruthy();

  await page.goto("/partner");
  await expect(page.getByText(/1 source scope · 3 physical cartons · 1 group/)).toBeVisible();
});

test("an unconfirmed Packing List stays visible but blocked before label preparation", async ({
  page,
  request,
}) => {
  await request.post("/api/test/reset?packingList=empty");
  await page.goto("/partner");

  await expect(page.getByText("Packing List required", { exact: true })).toBeVisible();
  await expect(page.getByText("Packing List not confirmed", { exact: true })).toBeVisible();
  await expect(page.getByText("Labels blocked", { exact: true })).toBeVisible();
  await expect(page.getByText("Receipt blocked", { exact: true })).toBeVisible();
  await expect(page.getByText("Putaway blocked", { exact: true })).toBeVisible();
  await expect(
    page.locator(".partner-attention-packing_list_required").getByRole("link", { name: "Review operation", exact: true }),
  ).toHaveAttribute("href", "/prearrival?shipmentId=shipment-test-1");
  await expect(page.getByRole("link", { name: "Open pre-arrival", exact: true })).toHaveAttribute(
    "href",
    "/prearrival?shipmentId=shipment-test-1",
  );
  await expect(page.getByText("Prepare labels", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/ready for label preparation/i)).toHaveCount(0);
  await expect(page.locator(".partner-metric-grid article").nth(0).getByText("0", { exact: true })).toBeVisible();
  await expect(page.locator(".partner-metric-grid article").nth(1).getByText("0", { exact: true })).toBeVisible();
});

test("the dashboard keeps private module navigation inside its workspace chrome", async ({ page }) => {
  await page.goto("/partner");

  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Partner modules" })).toHaveCount(0);

  const operationsNavigation = page.getByRole("navigation", {
    name: "Partner operations navigation",
  });
  await expect(
    operationsNavigation.getByRole("link", { name: "Staff management" }),
  ).toHaveAttribute("href", "/admin/staff");
});

test("partner dashboard mobile navigation uses two visible columns", async ({ page }) => {
  await page.goto("/partner");
  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();

  for (const width of [390, 701, 768, 880, 1040, 1440]) {
    await page.setViewportSize({ width, height: 900 });

    const navigation = page.locator(".partner-dashboard-nav");
    await expect(navigation).toBeVisible();
    const layout = await navigation.evaluate((element) => {
      const documentElement = document.documentElement;
      const navigationRect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        documentClientWidth: documentElement.clientWidth,
        documentScrollWidth: documentElement.scrollWidth,
        navigationClientWidth: element.clientWidth,
        navigationScrollWidth: element.scrollWidth,
        navigationRect: { left: navigationRect.left, right: navigationRect.right },
        display: style.display,
        gridTemplateColumns: style.gridTemplateColumns,
        links: Array.from(element.querySelectorAll("a"), (link) => {
          const rect = link.getBoundingClientRect();
          const linkStyle = getComputedStyle(link);
          return {
            text: link.textContent?.trim() ?? "",
            left: rect.left,
            right: rect.right,
            visible: rect.width > 0 && rect.height > 0 && linkStyle.display !== "none" && linkStyle.visibility !== "hidden",
          };
        }),
      };
    });

    expect(layout.documentScrollWidth, `document overflow at ${width}px`).toBeLessThanOrEqual(layout.documentClientWidth);
    expect(layout.navigationScrollWidth, `navigation overflow at ${width}px`).toBeLessThanOrEqual(layout.navigationClientWidth);
    for (const link of layout.links) {
      expect(link.visible, `${link.text} is hidden at ${width}px`).toBe(true);
      expect(link.left, `${link.text} starts outside navigation at ${width}px`).toBeGreaterThanOrEqual(layout.navigationRect.left - 1);
      expect(link.right, `${link.text} ends outside navigation at ${width}px`).toBeLessThanOrEqual(layout.navigationRect.right + 1);
      expect(link.left, `${link.text} starts outside viewport at ${width}px`).toBeGreaterThanOrEqual(-1);
      expect(link.right, `${link.text} ends outside viewport at ${width}px`).toBeLessThanOrEqual(layout.documentClientWidth + 1);
    }

    if (width === 390) {
      expect(layout.display).toBe("grid");
      expect(layout.gridTemplateColumns.trim().split(/\s+/)).toHaveLength(2);
      expect(layout.links.length).toBeGreaterThan(0);
    }
  }
});

test("shipment actions stay inside the worklist at a narrow desktop width", async ({
  page,
  request,
}) => {
  await request.post("/api/test/reset?packingList=empty");
  await page.setViewportSize({ width: 1150, height: 900 });
  await page.goto("/partner");

  const shipmentPanel = page.locator(".partner-shipment-panel");
  const attentionPanel = page.locator(".partner-attention-panel");
  const action = page.getByRole("link", { name: "Open pre-arrival", exact: true });

  await expect(action).toBeVisible();
  const shipmentBox = await shipmentPanel.boundingBox();
  const attentionBox = await attentionPanel.boundingBox();
  const actionBox = await action.boundingBox();

  expect(shipmentBox).not.toBeNull();
  expect(attentionBox).not.toBeNull();
  expect(actionBox).not.toBeNull();

  expect(actionBox!.x).toBeGreaterThanOrEqual(shipmentBox!.x);
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(
    shipmentBox!.x + shipmentBox!.width,
  );
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(attentionBox!.x);
});

test("the dashboard avoids page-level horizontal overflow at supported widths", async ({
  page,
  request,
}) => {
  await request.post("/api/test/reset?packingList=empty");
  await page.goto("/partner");
  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 900 },
    { width: 1150, height: 900 },
    { width: 1040, height: 900 },
    { width: 768, height: 844 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => {
      const clientWidth = document.documentElement.clientWidth;
      return {
        overflow: document.documentElement.scrollWidth - clientWidth,
        offenders: [...document.querySelectorAll<HTMLElement>("body *")]
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              className: element.className,
              parentClassName: element.parentElement?.className ?? "",
              right: Math.round(rect.right),
              tagName: element.tagName,
              text: element.textContent?.trim().slice(0, 80) ?? "",
            };
          })
          .filter((element) => element.right > clientWidth + 1)
          .slice(0, 8),
      };
    });
    expect(
      layout.overflow,
      `horizontal overflow at ${viewport.width}px: ${JSON.stringify(layout.offenders)}`,
    ).toBeLessThanOrEqual(1);
  }
});
