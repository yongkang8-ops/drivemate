import { afterEach, describe, expect, it } from "vitest";
import { getRuntimeReadiness } from "../lib/runtimeReadiness";

const originalEnvironment = { ...process.env };

function configureHostedPreview() {
  process.env.VERCEL_ENV = "preview";
  process.env.DRIVEMATE_REPOSITORY = "supabase";
  process.env.DRIVEMATE_ENABLE_DEMO_AUTH = "false";
  process.env.NEXT_PUBLIC_SHOW_INTERNAL_NAV = "false";
  process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.com";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://staging.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
}

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
});

describe("runtime release gates", () => {
  it("classifies Vercel Preview separately from production", () => {
    configureHostedPreview();
    const readiness = getRuntimeReadiness();

    expect(readiness.environment).toBe("preview");
    expect(readiness.ready).toBe(false);
    expect(
      readiness.checks.find((check) => check.name === "site_url")?.status,
    ).toBe("pass");
    expect(
      readiness.checks.find((check) => check.name === "staff_mfa")?.message,
    ).toContain("Hosted environments");
    expect(
      readiness.checks.find((check) => check.name === "data_isolation")
        ?.message,
    ).toContain("staging");
  });

  it("allows a hosted preview only after staging security markers are complete", () => {
    configureHostedPreview();
    process.env.DRIVEMATE_REQUIRE_STAFF_MFA = "true";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-test";
    process.env.TURNSTILE_SECRET_KEY = "secret-test";
    process.env.DRIVEMATE_TURNSTILE_REQUIRED = "true";
    process.env.DRIVEMATE_IMPORT_SIGNING_SECRET = "a".repeat(32);
    process.env.DRIVEMATE_ENVIRONMENT = "staging";
    process.env.DRIVEMATE_SUPABASE_ENVIRONMENT = "staging";

    const readiness = getRuntimeReadiness();
    expect(readiness.ready).toBe(true);
    expect(readiness.checks.filter((check) => check.status === "fail")).toEqual(
      [],
    );
  });

  it("requires the real domain and production data markers for Vercel Production", () => {
    configureHostedPreview();
    process.env.VERCEL_ENV = "production";
    process.env.DRIVEMATE_REQUIRE_STAFF_MFA = "true";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-test";
    process.env.TURNSTILE_SECRET_KEY = "secret-test";
    process.env.DRIVEMATE_TURNSTILE_REQUIRED = "true";
    process.env.DRIVEMATE_IMPORT_SIGNING_SECRET = "a".repeat(32);
    process.env.DRIVEMATE_ENVIRONMENT = "staging";
    process.env.DRIVEMATE_SUPABASE_ENVIRONMENT = "staging";

    const readiness = getRuntimeReadiness();
    expect(readiness.ready).toBe(false);
    expect(
      readiness.checks.find((check) => check.name === "site_url")?.status,
    ).toBe("fail");
    expect(
      readiness.checks.find((check) => check.name === "data_isolation")
        ?.message,
    ).toContain("production");
  });

  it("allows official Turnstile test credentials only in Preview", () => {
    configureHostedPreview();
    process.env.DRIVEMATE_REQUIRE_STAFF_MFA = "true";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
    process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
    process.env.DRIVEMATE_TURNSTILE_REQUIRED = "true";
    process.env.DRIVEMATE_IMPORT_SIGNING_SECRET = "a".repeat(32);
    process.env.DRIVEMATE_ENVIRONMENT = "staging";
    process.env.DRIVEMATE_SUPABASE_ENVIRONMENT = "staging";

    const preview = getRuntimeReadiness();
    expect(preview.ready).toBe(true);
    expect(
      preview.checks.find((check) => check.name === "turnstile")?.status,
    ).toBe("warn");

    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "https://drivemateparts.com.au";
    process.env.DRIVEMATE_ENVIRONMENT = "production";
    process.env.DRIVEMATE_SUPABASE_ENVIRONMENT = "production";
    const production = getRuntimeReadiness();
    expect(production.ready).toBe(false);
    expect(
      production.checks.find((check) => check.name === "turnstile")?.status,
    ).toBe("fail");
  });
});
