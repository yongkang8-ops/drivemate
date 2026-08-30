import { describe, expect, it } from "vitest";
import {
  recoveryAccessTokenFromHash,
  recoveryFragmentRelayHtml,
} from "../lib/authRecovery";

describe("Supabase recovery-link compatibility", () => {
  it("extracts an implicit-flow recovery access token from a URL fragment", () => {
    expect(
      recoveryAccessTokenFromHash(
        "#access_token=recovery-token&type=recovery&expires_in=3600",
      ),
    ).toBe("recovery-token");
  });

  it("does not treat a non-recovery fragment as a password-reset session", () => {
    expect(
      recoveryAccessTokenFromHash("#access_token=sign-in-token&type=signup"),
    ).toBeNull();
  });

  it("preserves the fragment while relaying to the password setup page", () => {
    const html = recoveryFragmentRelayHtml();

    expect(html).toContain("window.location.hash");
    expect(html).toContain("/password-setup");
  });
});
