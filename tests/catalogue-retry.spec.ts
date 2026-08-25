import { expect, test } from "@playwright/test";

test("catalogue recovers when the first request is temporarily unavailable", async ({
  page,
}) => {
  let attempts = 0;

  await page.route("**/api/catalogue", async (route) => {
    attempts += 1;

    // Next.js development mode may mount effects twice. Fail both incidental
    // requests so the test only passes when the component owns a real retry.
    if (attempts <= 2) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          message: "Catalogue is temporarily unavailable.",
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        products: [
          {
            sku: "DM-GWM-TEST-001",
            brand: "GWM",
            name: "Catalogue Retry Test Part",
            category: "Service Part",
            partNumber: "2904104XKV1BA",
            fitment: "Fitment review required",
            availability: "Enquire",
          },
        ],
      }),
    });
  });

  await page.goto("/catalogue?q=2904104XKV1BA");

  await expect(
    page.getByRole("heading", { name: "Catalogue Retry Test Part" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Catalogue is temporarily unavailable" }),
  ).toHaveCount(0);
  expect(attempts).toBeGreaterThanOrEqual(3);
});
