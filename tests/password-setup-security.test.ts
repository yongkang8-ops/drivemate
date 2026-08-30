import { describe, expect, it } from "vitest";
import { passwordSetupRequestAllowed } from "../lib/requestSecurity";

describe("password setup request security", () => {
  it("accepts a same-origin recovery-session request without a CSRF cookie", () => {
    const request = new Request(
      "https://drivemateparts.com.au/api/auth/password-setup",
      {
        method: "POST",
        headers: { origin: "https://drivemateparts.com.au" },
      },
    );

    expect(passwordSetupRequestAllowed(request)).toBe(true);
  });

  it("rejects a cross-origin recovery-session request", () => {
    const request = new Request(
      "https://drivemateparts.com.au/api/auth/password-setup",
      {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      },
    );

    expect(passwordSetupRequestAllowed(request)).toBe(false);
  });
});
