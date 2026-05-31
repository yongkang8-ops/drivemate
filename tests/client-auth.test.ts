import { describe, expect, it } from "vitest";
import { DEMO_ROLE_HEADER } from "../lib/auth";
import { buildApiHeaders } from "../lib/clientAuth";

describe("client API auth headers", () => {
  it("falls back to a demo role header when no browser Supabase session is configured", async () => {
    const headers = new Headers(await buildApiHeaders("warehouse", { "Content-Type": "application/json" }));

    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get(DEMO_ROLE_HEADER)).toBe("warehouse");
    expect(headers.get("Authorization")).toBeNull();
  });
});
