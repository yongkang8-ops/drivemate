import { describe, expect, it } from "vitest";
import { supabaseRequestCookies } from "../lib/supabaseClient";

describe("Supabase SSR cookie adapter", () => {
  it("passes every incoming browser cookie to the PKCE client", () => {
    const request = new Request("https://drivemateparts.com.au/api/auth/password-reset", {
      headers: { cookie: "one=first; two=second" },
    });

    expect(supabaseRequestCookies(request)).toEqual([
      { name: "one", value: "first" },
      { name: "two", value: "second" },
    ]);
  });
});
