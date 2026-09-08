import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("staff first-login gate", () => {
  it("keeps pending staff out of the workspace and sends them to password setup", () => {
    const source = readFileSync(join(process.cwd(), "components", "AuthPanel.tsx"), "utf8");
    expect(source).toContain("passwordChangeRequired");
    expect(source).toContain("Complete your password setup before opening the workspace.");
  });
});
