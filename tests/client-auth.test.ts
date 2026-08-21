import { describe, expect, it } from "vitest";
import { DEMO_ROLE_HEADER } from "../lib/auth";
import { buildApiHeaders } from "../lib/clientAuth";

describe("client API auth headers", () => {
  it("does not expose a bearer token or demo role in ordinary client headers", async () => {
    const headers = new Headers(await buildApiHeaders("warehouse", { "Content-Type": "application/json" }));

    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get(DEMO_ROLE_HEADER)).toBeNull();
    expect(headers.get("Authorization")).toBeNull();
  });
});
