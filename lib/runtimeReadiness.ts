import { isDemoRoleHeaderEnabled } from "./auth";
import { hasConfiguredBusinessProfile } from "./accountDocumentContent";

type ReadinessStatus = "pass" | "warn" | "fail";

type ReadinessCheck = {
  name: string;
  status: ReadinessStatus;
  message: string;
};

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function addCheck(
  checks: ReadinessCheck[],
  name: string,
  status: ReadinessStatus,
  message: string,
) {
  checks.push({ name, status, message });
}

const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

export function getRuntimeReadiness() {
  const vercelEnvironment = process.env.VERCEL_ENV?.trim();
  const configuredEnvironment = process.env.DRIVEMATE_ENVIRONMENT?.trim();
  const runtimeEnvironment =
    vercelEnvironment ||
    configuredEnvironment ||
    process.env.NODE_ENV ||
    "development";
  const isProduction = vercelEnvironment
    ? vercelEnvironment === "production"
    : configuredEnvironment === "production";
  const isHosted = isProduction || vercelEnvironment === "preview";
  const repositoryMode = process.env.DRIVEMATE_REPOSITORY ?? "memory";
  const demoAuthEnabled = isDemoRoleHeaderEnabled();
  const internalNavVisible =
    process.env.NEXT_PUBLIC_SHOW_INTERNAL_NAV === "true" ||
    process.env.NODE_ENV !== "production";
  const hasSupabaseUrl = hasValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasSupabaseAnonKey = hasValue(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const hasSupabaseServiceKey = hasValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const accountDocumentsBucket =
    process.env.SUPABASE_ACCOUNT_DOCUMENTS_BUCKET ?? "account-documents";
  const businessProfileConfigured = hasConfiguredBusinessProfile();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const staffMfaRequired = process.env.DRIVEMATE_REQUIRE_STAFF_MFA === "true";
  const turnstileReady = Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() &&
    process.env.TURNSTILE_SECRET_KEY?.trim() &&
    process.env.DRIVEMATE_TURNSTILE_REQUIRED === "true",
  );
  const turnstileTestMode =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY === TURNSTILE_TEST_SITE_KEY ||
    process.env.TURNSTILE_SECRET_KEY === TURNSTILE_TEST_SECRET_KEY;
  const importSigningReady =
    (process.env.DRIVEMATE_IMPORT_SIGNING_SECRET?.trim().length ?? 0) >= 32;
  const expectedDataEnvironment = isProduction
    ? "production"
    : isHosted
      ? "staging"
      : undefined;
  const isolatedData =
    !expectedDataEnvironment ||
    (process.env.DRIVEMATE_ENVIRONMENT === expectedDataEnvironment &&
      process.env.DRIVEMATE_SUPABASE_ENVIRONMENT === expectedDataEnvironment);
  const checks: ReadinessCheck[] = [];

  if (isProduction && repositoryMode !== "supabase") {
    addCheck(
      checks,
      "repository",
      "fail",
      "Production must use DRIVEMATE_REPOSITORY=supabase.",
    );
  } else if (repositoryMode === "supabase") {
    addCheck(
      checks,
      "repository",
      "pass",
      "Supabase repository mode is selected.",
    );
  } else {
    addCheck(
      checks,
      "repository",
      "warn",
      "Memory repository is suitable only for local prototype checks.",
    );
  }

  if (isProduction && demoAuthEnabled) {
    addCheck(
      checks,
      "auth",
      "fail",
      "Production must disable demo role headers.",
    );
  } else if (demoAuthEnabled) {
    addCheck(
      checks,
      "auth",
      "warn",
      "Demo role headers are enabled for local testing.",
    );
  } else {
    addCheck(checks, "auth", "pass", "Demo role headers are disabled.");
  }

  if (isProduction && internalNavVisible) {
    addCheck(
      checks,
      "navigation",
      "fail",
      "Production public navigation must hide warehouse and admin links.",
    );
  } else if (internalNavVisible) {
    addCheck(
      checks,
      "navigation",
      "warn",
      "Internal navigation is visible for local testing.",
    );
  } else {
    addCheck(
      checks,
      "navigation",
      "pass",
      "Internal navigation is hidden from public navigation.",
    );
  }

  if (repositoryMode === "supabase" || isProduction) {
    if (hasSupabaseUrl && hasSupabaseAnonKey && hasSupabaseServiceKey) {
      addCheck(
        checks,
        "supabase_env",
        "pass",
        "Supabase URL, anon key, and service key are configured.",
      );
    } else {
      addCheck(
        checks,
        "supabase_env",
        "fail",
        "Supabase URL, anon key, and service key are required.",
      );
    }
  } else {
    addCheck(
      checks,
      "supabase_env",
      "warn",
      "Supabase environment variables are optional in memory mode.",
    );
  }

  if (accountDocumentsBucket.trim()) {
    addCheck(
      checks,
      "document_bucket",
      "pass",
      "Account document bucket name is configured.",
    );
  } else {
    addCheck(
      checks,
      "document_bucket",
      isProduction ? "fail" : "warn",
      "Account document bucket name is missing.",
    );
  }

  if (businessProfileConfigured) {
    addCheck(
      checks,
      "business_profile",
      "pass",
      "Business legal profile is configured for account documents.",
    );
  } else {
    addCheck(
      checks,
      "business_profile",
      isProduction ? "fail" : "warn",
      "Business legal name, ABN, and accounts email should be configured before live account documents are issued.",
    );
  }

  const siteUrlReady = isProduction
    ? siteUrl === "https://drivemateparts.com.au"
    : !isHosted || Boolean(siteUrl?.startsWith("https://"));
  addCheck(
    checks,
    "site_url",
    siteUrlReady ? "pass" : "fail",
    siteUrlReady
      ? isProduction
        ? "Production domain is configured."
        : "Hosted preview site URL uses HTTPS."
      : isProduction
        ? "Production requires https://drivemateparts.com.au."
        : "Hosted preview requires a real HTTPS site URL.",
  );
  addCheck(
    checks,
    "staff_mfa",
    !isHosted || staffMfaRequired ? "pass" : "fail",
    staffMfaRequired
      ? "Admin and warehouse MFA enforcement is enabled."
      : "Hosted environments require DRIVEMATE_REQUIRE_STAFF_MFA=true.",
  );
  if (isProduction && turnstileTestMode) {
    addCheck(
      checks,
      "turnstile",
      "fail",
      "Production cannot use Cloudflare Turnstile test credentials.",
    );
  } else if (isHosted && !turnstileReady) {
    addCheck(
      checks,
      "turnstile",
      "fail",
      "Hosted environments require Turnstile keys and enforcement.",
    );
  } else if (turnstileTestMode) {
    addCheck(
      checks,
      "turnstile",
      "warn",
      "Official Turnstile test credentials are enabled for protected preview testing.",
    );
  } else {
    addCheck(
      checks,
      "turnstile",
      "pass",
      turnstileReady
        ? "Trade account bot protection is configured."
        : "Turnstile is optional for local testing.",
    );
  }
  addCheck(
    checks,
    "import_signing",
    !isHosted || importSigningReady ? "pass" : "fail",
    importSigningReady
      ? "Import preview tokens have a dedicated signing secret."
      : "Hosted environments require a 32+ character import signing secret.",
  );
  addCheck(
    checks,
    "data_isolation",
    isolatedData ? "pass" : "fail",
    isolatedData
      ? expectedDataEnvironment
        ? `${expectedDataEnvironment} app and Supabase environments are explicitly selected.`
        : "Local data environment does not require a hosted marker."
      : `${runtimeEnvironment} requires DRIVEMATE_ENVIRONMENT and DRIVEMATE_SUPABASE_ENVIRONMENT to be ${expectedDataEnvironment}.`,
  );

  const hasFailures = checks.some((check) => check.status === "fail");

  return {
    app: "DriveMate Parts",
    environment: runtimeEnvironment,
    repository: {
      mode: repositoryMode,
    },
    auth: {
      demoRoleHeaderEnabled: demoAuthEnabled,
      supabaseConfigured:
        hasSupabaseUrl && hasSupabaseAnonKey && hasSupabaseServiceKey,
    },
    publicNavigation: {
      internalLinksVisible: internalNavVisible,
    },
    storage: {
      accountDocumentsBucket,
    },
    businessProfile: {
      configured: businessProfileConfigured,
    },
    ready: !hasFailures,
    checks,
  };
}
