import { describe, expect, it } from "vitest";
import { demoUserRoles } from "../lib/adminMasterData";

describe("demo user roles", () => {
  it("uses the Partner demo identity for the unified internal role", () => {
    expect(demoUserRoles).toContainEqual({
      userId: "demo-partner-user",
      role: "partner",
      displayName: "Demo partner operator",
    });
    expect(demoUserRoles.some((user) => user.role === "warehouse")).toBe(false);
  });
});
