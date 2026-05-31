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

function addCheck(checks: ReadinessCheck[], name: string, status: ReadinessStatus, message: string) {
  checks.push({ name, status, message });
}

export function getRuntimeReadiness() {
  const isProduction = process.env.NODE_ENV === "production";
  const repositoryMode = process.env.DRIVEMATE_REPOSITORY ?? "memory";
  const demoAuthEnabled = isDemoRoleHeaderEnabled();
  const internalNavVisible =
    process.env.NEXT_PUBLIC_SHOW_INTERNAL_NAV === "true" || process.env.NODE_ENV !== "production";
  const hasSupabaseUrl = hasValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasSupabaseAnonKey = hasValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const hasSupabaseServiceKey = hasValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const accountDocumentsBucket = process.env.SUPABASE_ACCOUNT_DOCUMENTS_BUCKET ?? "account-documents";
  const businessProfileConfigured = hasConfiguredBusinessProfile();
  const checks: ReadinessCheck[] = [];

  if (isProduction && repositoryMode !== "supabase") {
    addCheck(checks, "repository", "fail", "Production must use DRIVEMATE_REPOSITORY=supabase.");
  } else if (repositoryMode === "supabase") {
    addCheck(checks, "repository", "pass", "Supabase repository mode is selected.");
  } else {
    addCheck(checks, "repository", "warn", "Memory repository is suitable only for local prototype checks.");
  }

  if (isProduction && demoAuthEnabled) {
    addCheck(checks, "auth", "fail", "Production must disable demo role headers.");
  } else if (demoAuthEnabled) {
    addCheck(checks, "auth", "warn", "Demo role headers are enabled for local testing.");
  } else {
    addCheck(checks, "auth", "pass", "Demo role headers are disabled.");
  }

  if (isProduction && internalNavVisible) {
    addCheck(checks, "navigation", "fail", "Production public navigation must hide warehouse and admin links.");
  } else if (internalNavVisible) {
    addCheck(checks, "navigation", "warn", "Internal navigation is visible for local testing.");
  } else {
    addCheck(checks, "navigation", "pass", "Internal navigation is hidden from public navigation.");
  }

  if (repositoryMode === "supabase" || isProduction) {
    if (hasSupabaseUrl && hasSupabaseAnonKey && hasSupabaseServiceKey) {
      addCheck(checks, "supabase_env", "pass", "Supabase URL, anon key, and service key are configured.");
    } else {
      addCheck(checks, "supabase_env", "fail", "Supabase URL, anon key, and service key are required.");
    }
  } else {
    addCheck(checks, "supabase_env", "warn", "Supabase environment variables are optional in memory mode.");
  }

  if (accountDocumentsBucket.trim()) {
    addCheck(checks, "document_bucket", "pass", "Account document bucket name is configured.");
  } else {
    addCheck(checks, "document_bucket", isProduction ? "fail" : "warn", "Account document bucket name is missing.");
  }

  if (businessProfileConfigured) {
    addCheck(checks, "business_profile", "pass", "Business legal profile is configured for account documents.");
  } else {
    addCheck(
      checks,
      "business_profile",
      isProduction ? "fail" : "warn",
      "Business legal name, ABN, and accounts email should be configured before live account documents are issued.",
    );
  }

  const hasFailures = checks.some((check) => check.status === "fail");

  return {
    app: "DriveMate Parts",
    environment: process.env.NODE_ENV ?? "development",
    repository: {
      mode: repositoryMode,
    },
    auth: {
      demoRoleHeaderEnabled: demoAuthEnabled,
      supabaseConfigured: hasSupabaseUrl && hasSupabaseAnonKey && hasSupabaseServiceKey,
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
