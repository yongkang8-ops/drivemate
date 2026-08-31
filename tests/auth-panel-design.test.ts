import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("shared authentication panel design", () => {
  it("uses the approved structured split form hierarchy", () => {
    const source = read("components/AuthPanel.tsx");

    for (const className of [
      "auth-copy",
      "auth-form",
      "auth-field",
      "auth-field-heading",
      "auth-forgot-link",
      "auth-submit",
    ]) {
      expect(source).toContain(className);
    }

    expect(source).toContain("Email address");
    expect(source).toContain("Password");
    expect(source).toContain("Forgot password?");
    expect(source).toContain("<form");
    expect(source).toContain("onSubmit=");
    expect(source).not.toContain(
      'className="secondary-button" onClick={() => void requestPasswordReset()}',
    );
  });

  it("renders consistent semantic feedback states", () => {
    const source = read("components/AuthPanel.tsx");

    for (const tone of ["info", "success", "warning", "error"]) {
      expect(source).toContain(`"${tone}"`);
    }
    for (const icon of ["Info", "CheckCircle", "WarningCircle", "XCircle"]) {
      expect(source).toContain(icon);
    }

    expect(source).toContain("auth-notice");
    expect(source).toContain("auth-notice--${notice.tone}");
    expect(source).toContain('aria-live="polite"');
    expect(source).not.toContain('className="badge auth-status"');
  });

  it("applies one responsive visual system to every shared login", () => {
    const source = read("app/globals.css");

    for (const selector of [
      ".auth-copy",
      ".auth-form",
      ".auth-field",
      ".auth-field-heading",
      ".auth-forgot-link",
      ".auth-submit",
      ".auth-notice",
      ".auth-notice--info",
      ".auth-notice--success",
      ".auth-notice--warning",
      ".auth-notice--error",
    ]) {
      expect(source).toContain(selector);
    }

    expect(source).toContain("max-width: 520px");
    expect(source).toContain("width: 100%");
    expect(source).toContain("@media (max-width: 700px)");
    expect(source).not.toContain(".auth-status { grid-column: 2");
  });

  it("uses the same notice system on password setup", () => {
    const source = read("components/PasswordSetupForm.tsx");
    expect(source).toContain("auth-notice");
    expect(source).toContain("auth-notice--${notice.tone}");
    expect(source).toContain("Info");
    expect(source).toContain("WarningCircle");
    expect(source).toContain("XCircle");
    expect(source).not.toContain('<p role="status">');
  });
});
