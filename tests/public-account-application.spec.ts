import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("/api/test/reset");
});

test("public open trade account form submits an application visible to admin", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Workshop / business name").fill("Northside Workshop");
  await page.getByLabel("ABN").fill("12345678901");
  await page.getByLabel("Contact name").fill("Jamie Lee");
  await page.getByLabel("Contact email").fill("jamie@example.com");
  await page.getByLabel("Contact phone").fill("0400000000");
  await page.getByLabel("Postcode").fill("4000");
  await page.getByLabel("Notes").fill("Interested in GWM and BYD service parts.");
  await page.getByRole("button", { name: "Submit application" }).click();

  await expect(page.getByRole("status")).toContainText(/Application TA-\d+ received for Northside Workshop/);

  await page.goto("/admin");
  await page.getByRole("button", { name: "Refresh admin state" }).click();
  await expect(page.getByRole("row", { name: /TA-\d+\s+Northside Workshop\s+12345678901\s+Jamie Lee\s+jamie@example.com\s+0400000000\s+pending/ })).toBeVisible();
  await page.getByRole("button", { name: "Provision login" }).click();
  await expect(page.getByRole("status")).toContainText("Login provisioned for jamie@example.com");
  await expect(page.getByRole("status")).toContainText("Temporary password");
  await expect(page.getByText("No pending account applications.")).toBeVisible();
});
