import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("trade portal preserves the pre-trade order lock while internal operating views remain available", async ({
  page,
}) => {
  await page.goto("/portal");

  await page.getByRole("button", { name: "Search matching parts" }).click();
  await expect(page.getByRole("status")).toContainText("matching parts found");
  await expect(page.getByRole("row", { name: /DM-GWM-OF-001/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Closed" })).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Closed" }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Ordering unavailable" })).toBeDisabled();

  await page.goto("/admin");
  await page.getByRole("button", { name: "Refresh admin state" }).click();
  await expect(page.getByText("Operating state refreshed.")).toBeVisible();
  await expect(
    page.getByRole("row", {
      name: /DM-GWM-OF-001\s+GWM Cannon Alpha 2024-on\s+GW4D24/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /BNE-2026-06-PILOT\s+DM-GWM-OF-001/ }),
  ).toBeVisible();

  await page.goto("/warehouse");
  await expect(page.getByRole("heading", { name: "Inbound operations" })).toBeVisible();
  await expect(page.getByText("Physical print confirmation required")).toBeVisible();
  await page.getByRole("link", { name: "Receive stock", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Receive stock", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm receipt", exact: true })).toHaveCount(0);
});
