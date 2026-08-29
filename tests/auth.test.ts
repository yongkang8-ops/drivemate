import { afterEach, describe, expect, it } from "vitest";
import { can, DEMO_ROLE_ENV, isDemoRoleHeaderEnabled, parseRole } from "../lib/auth";
import { getRequestContext, getRequestRole } from "../lib/serverAuth";

const originalDemoAuth = process.env[DEMO_ROLE_ENV];

afterEach(() => {
  if (originalDemoAuth === undefined) {
    delete process.env[DEMO_ROLE_ENV];
  } else {
    process.env[DEMO_ROLE_ENV] = originalDemoAuth;
  }
});

describe("role capability model", () => {
  it("parses unknown role values as public", () => {
    expect(parseRole(null)).toBe("public");
    expect(parseRole("owner")).toBe("public");
    expect(parseRole("trade")).toBe("trade");
    expect(parseRole("partner")).toBe("partner");
    expect(parseRole("warehouse")).toBe("public");
  });

  it("allows each role only its intended V1 capabilities", () => {
    expect(can("public", "vehicle_lookup")).toBe(false);
    expect(can("trade", "vehicle_lookup")).toBe(true);
    expect(can("trade", "trade_read")).toBe(true);
    expect(can("trade", "create_order")).toBe(true);
    expect(can("trade", "inventory_write")).toBe(false);
    expect(can("trade", "warehouse_read")).toBe(false);
    expect(can("partner", "vehicle_lookup")).toBe(true);
    expect(can("partner", "trade_read")).toBe(false);
    expect(can("partner", "warehouse_read")).toBe(true);
    expect(can("partner", "inventory_write")).toBe(true);
    expect(can("partner", "admin_read")).toBe(false);
    expect(can("partner", "admin_write")).toBe(false);
    expect(can("admin", "warehouse_read")).toBe(true);
    expect(can("admin", "admin_read")).toBe(true);
    expect(can("admin", "admin_write")).toBe(true);
    expect(can("admin", "inventory_write")).toBe(true);
  });

  it("honours the demo role header only when demo auth is enabled", async () => {
    const request = new Request("https://example.test/api/admin-state", {
      headers: { "x-drivemate-role": "admin" },
    });

    process.env[DEMO_ROLE_ENV] = "false";
    expect(isDemoRoleHeaderEnabled()).toBe(false);
    await expect(getRequestRole(request)).resolves.toBe("public");

    process.env[DEMO_ROLE_ENV] = "true";
    expect(isDemoRoleHeaderEnabled()).toBe(true);
    await expect(getRequestRole(request)).resolves.toBe("admin");
  });

  it("attaches the demo trade account only for local trade requests", async () => {
    const request = new Request("https://example.test/api/orders", {
      headers: { "x-drivemate-role": "trade" },
    });

    process.env[DEMO_ROLE_ENV] = "true";
    await expect(getRequestContext(request)).resolves.toMatchObject({
      role: "trade",
      userId: "demo-trade-user",
      tradeAccountId: "acct-demo",
    });
  });

  it("does not promote a bearer request without a verified Supabase profile", async () => {
    const request = new Request("https://example.test/api/admin-state", {
      headers: { authorization: "Bearer invalid-token" },
    });

    process.env[DEMO_ROLE_ENV] = "false";
    await expect(getRequestRole(request)).resolves.toBe("public");
  });
});
