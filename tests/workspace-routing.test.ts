import { describe, expect, it } from "vitest";
import {
  resolveWorkspaceDestination,
  safeWorkspaceNext,
} from "../lib/workspaceRouting";

describe("workspace destination authorization", () => {
  it.each([
    ["admin", "/partner"],
    ["partner", "/partner"],
    ["warehouse_staff", "/warehouse"],
    ["trade", "/portal"],
  ] as const)("sends %s to its business workspace", (role, expected) => {
    expect(resolveWorkspaceDestination(role)).toBe(expected);
  });

  it("keeps an authorized same-origin route with context and hash", () => {
    expect(
      resolveWorkspaceDestination(
        "partner",
        "/prearrival?shipment=DM-2026-009&section=receiving#carton-4",
      ),
    ).toBe("/prearrival?shipment=DM-2026-009&section=receiving#carton-4");
  });

  it.each([
    ["partner", "/admin"],
    ["warehouse_staff", "/inventory"],
    ["trade", "/partner"],
  ] as const)("rejects %s access to %s", (role, next) => {
    expect(resolveWorkspaceDestination(role, next)).toBe(
      resolveWorkspaceDestination(role),
    );
  });

  it.each([
    "//evil.example/warehouse",
    "https://evil.example/warehouse",
    "/%2e%2e/admin",
    "/warehouse%2f..%2fadmin",
    "/staff/login",
    "/password-setup",
    "/warehouse?access_token=secret",
    "/warehouse?accessToken=secret",
    "/warehouse?refreshToken=secret",
    "/warehouse#refresh_token=secret",
    "/warehouse#section=receiving&access_token=secret",
    "/warehouse#overview&token=secret",
    "/warehouse?email=user%40example.com",
    "/warehouse?unreviewedContext=value",
    "/unknown",
  ])("rejects hostile or unsupported next value %s", (next) => {
    expect(safeWorkspaceNext(next)).toBeNull();
  });

  it("accepts only reviewed context keys and a harmless anchor", () => {
    expect(
      safeWorkspaceNext("/warehouse?shipment=DM-9&view=receiving#carton-4"),
    ).toBe("/warehouse?shipment=DM-9&view=receiving#carton-4");
  });

  it.each([
    "/admin?productsPage=2&productsSize=50#products",
    "/admin/staff?staffPage=3&staffSize=25#accounts",
    "/inventory?locationsPage=4&locationsSize=100#locations",
    "/admin?purchasePreviewPage=1&purchasePreviewSize=25",
  ])("accepts reviewed paginated context %s", (next) => {
    expect(safeWorkspaceNext(next)).toBe(next);
  });

  it.each([
    "/admin?productsPage=0",
    "/admin?productsPage=-1",
    "/admin?productsPage=1.5",
    "/admin?productsSize=20",
    "/admin?unknownPage=2",
    "/admin/staff?staffSize=500",
    "/inventory?locationsPage=all",
  ])("rejects invalid paginated context %s", (next) => {
    expect(safeWorkspaceNext(next)).toBeNull();
  });

  it("does not grant a destination to disabled or unknown roles", () => {
    expect(resolveWorkspaceDestination("disabled", "/partner")).toBeNull();
    expect(resolveWorkspaceDestination("owner", "/admin")).toBeNull();
  });
});
