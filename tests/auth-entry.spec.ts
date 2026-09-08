import { expect, test, type Page } from "@playwright/test";

type Role = "admin" | "partner" | "warehouse_staff" | "trade";

function session(role: Role) {
  return {
    authenticated: true,
    passwordChangeRequired: false,
    profile: { role, displayName: `QA ${role}` },
  };
}

async function signedOut(page: Page) {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
}

for (const [role, destination] of [
  ["admin", "/partner"],
  ["partner", "/partner"],
  ["warehouse_staff", "/warehouse"],
  ["trade", "/portal"],
] as const) {
  test(`generic entry sends an existing ${role} session to ${destination}`, async ({ page }) => {
    await page.route("**/api/auth/session", (route) => route.fulfill({ json: session(role) }));
    await page.goto("/staff/login");
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
  });
}

test("authorized next keeps business context while hostile next falls back", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: session("partner") }));
  await page.goto("/staff/login?next=%2Fprearrival%3Fshipment%3DDM-9%23carton-2");
  await expect(page).toHaveURL(/\/prearrival\?shipment=DM-9#carton-2$/);

  await page.goto("/staff/login?next=https%3A%2F%2Fevil.example%2Fadmin");
  await expect(page).toHaveURL(/\/partner$/);
});

test("sign-in trusts the refreshed session role and blocks repeated clicks", async ({ page }) => {
  let authenticated = false;
  let loginCalls = 0;
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: authenticated ? session("warehouse_staff") : { authenticated: false } }),
  );
  await page.route("**/api/auth/login", async (route) => {
    loginCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 150));
    authenticated = true;
    await route.fulfill({ json: { ok: true, role: "admin" } });
  });

  await page.goto("/staff/login");
  await page.getByLabel("Email address").fill("operator@drivemateparts.com.au");
  await page.getByLabel("Password").fill("local-test-password");
  await page.getByRole("button", { name: "Sign in" }).dblclick();

  await expect(page).toHaveURL(/\/warehouse$/);
  expect(loginCalls).toBe(1);
});

test("a network or non-JSON failure is recoverable and preserves fields", async ({ page }) => {
  await signedOut(page);
  let attempt = 0;
  await page.route("**/api/auth/login", (route) => {
    attempt += 1;
    if (attempt === 1) {
      return route.fulfill({ status: 502, contentType: "text/html", body: "Bad gateway" });
    }
    return route.fulfill({ status: 401, json: { ok: false, message: "Invalid email or password." } });
  });

  await page.goto("/staff/login");
  const email = page.getByLabel("Email address");
  const password = page.getByLabel("Password");
  await email.fill("operator@drivemateparts.com.au");
  await password.fill("still-present");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".auth-notice--error")).toContainText("Sign-in is temporarily unavailable");
  await expect(email).toHaveValue("operator@drivemateparts.com.au");
  await expect(password).toHaveValue("still-present");

  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".auth-notice--error")).toContainText("Invalid email or password.");
});

test("a failed session check keeps the generic sign-in form recoverable", async ({ page }) => {
  let authenticated = false;
  await page.route("**/api/auth/session", (route) => {
    if (!authenticated) return route.abort("failed");
    return route.fulfill({ json: session("partner") });
  });
  await page.route("**/api/auth/login", (route) => {
    authenticated = true;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/staff/login");
  await expect(page.locator(".auth-notice--error")).toContainText("Authentication is temporarily unavailable");
  await page.getByLabel("Email address").fill("partner@drivemateparts.com.au");
  await page.getByLabel("Password").fill("local-test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/partner$/);
});

test("protected-route sign-in stays on the deliberately opened authorized route", async ({ page }) => {
  let authenticated = false;
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: authenticated ? session("partner") : { authenticated: false } }),
  );
  await page.route("**/api/auth/login", (route) => {
    authenticated = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/prearrival");
  await page.getByLabel("Email address").fill("partner@drivemateparts.com.au");
  await page.getByLabel("Password").fill("local-test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/prearrival$/);
  await expect(page.locator(".auth-panel.is-authenticated")).toHaveCount(1);
});

test("password-first login carries only a safe intended route into setup", async ({ page }) => {
  await signedOut(page);
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ json: { ok: true, passwordChangeRequired: true } }),
  );
  await page.goto("/staff/login?next=%2Fwarehouse%3Fshipment%3DDM-9");
  await page.getByLabel("Email address").fill("operator@drivemateparts.com.au");
  await page.getByLabel("Password").fill("one-time-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/password-setup\?next=%2Fwarehouse%3Fshipment%3DDM-9$/);
  expect(page.url()).not.toContain("one-time-password");
});

test("protected first-password session carries the deliberately opened business context", async ({ page }) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        ...session("partner"),
        passwordChangeRequired: true,
      },
    }),
  );
  await page.goto("/prearrival?shipment=DM-9&view=receiving#carton-2");
  await expect(page).toHaveURL(
    /\/password-setup\?next=%2Fprearrival%3Fshipment%3DDM-9%26view%3Dreceiving%23carton-2$/,
  );
});

test("password setup guards duplicate submission, handles non-JSON, and clears secrets after success", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/auth/password-setup", async (route) => {
    calls += 1;
    if (calls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return route.fulfill({ status: 502, contentType: "text/html", body: "Bad gateway" });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/password-setup?next=%2Fwarehouse#access_token=recovery-token&type=recovery");
  const password = page.getByLabel("New password");
  const confirm = page.getByLabel("Confirm password");
  await password.fill("DriveMate!2026");
  await confirm.fill("DriveMate!2026");
  await page.getByRole("button", { name: "Set password" }).dblclick();
  await expect(page.locator(".auth-notice--error")).toContainText("Password setup is temporarily unavailable");
  expect(calls).toBe(1);
  await expect(password).toHaveValue("DriveMate!2026");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue to sign in" })).toHaveAttribute(
    "href",
    "/staff/login?next=%2Fwarehouse",
  );
  expect(await page.evaluate(() => window.location.hash)).toBe("");
});

test("password setup success strips rejected raw query and recovery hash", async ({ page }) => {
  await page.route("**/api/auth/password-setup", (route) => route.fulfill({ json: { ok: true } }));
  await page.goto(
    "/password-setup?next=%2Fwarehouse%3FaccessToken%3Dleak&access_token=query-leak#access_token=recovery-token&type=recovery",
  );
  await page.getByLabel("New password").fill("DriveMate!2026");
  await page.getByLabel("Confirm password").fill("DriveMate!2026");
  await page.getByRole("button", { name: "Set password" }).click();

  await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();
  expect(page.url()).toBe("http://127.0.0.1:3242/password-setup");
  await expect(page.getByRole("link", { name: "Continue to sign in" })).toHaveAttribute("href", "/staff/login");
});
