import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const npmCommand = process.platform === "win32" ? "npm" : "npm";

const requiredEnv = [
  "DRIVEMATE_BASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "DRIVEMATE_LEGAL_NAME",
  "DRIVEMATE_ABN",
  "DRIVEMATE_ACCOUNTS_EMAIL",
  "DRIVEMATE_GST_REGISTERED",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DRIVEMATE_IMPORT_SIGNING_SECRET",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "DRIVEMATE_SMOKE_TRADE_TOKEN",
  "DRIVEMATE_SMOKE_WAREHOUSE_TOKEN",
  "DRIVEMATE_SMOKE_ADMIN_TOKEN",
];

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function quoteWindowsArg(value) {
  if (/^[A-Za-z0-9_./:\\=-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function createSpawnInput(command, args) {
  if (process.platform !== "win32") return { command, args };
  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", [command, ...args].map(quoteWindowsArg).join(" ")],
  };
}

function run(command, args, env) {
  return new Promise((resolveRun, reject) => {
    const input = createSpawnInput(command, args);
    const child = spawn(input.command, input.args, {
      cwd: process.cwd(),
      env,
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function envValue(key) {
  return process.env[key]?.trim() ?? "";
}

function looksPlaceholder(value) {
  return !value || /<|>|pending|placeholder|todo|tbd|example/i.test(value);
}

function checkEnvironment() {
  const missing = requiredEnv.filter((key) => !process.env[key]?.trim());
  for (const key of missing)
    fail(`${key} is required for release readiness verification.`);

  const baseUrl = envValue("DRIVEMATE_BASE_URL");
  const siteUrl = envValue("NEXT_PUBLIC_SITE_URL");
  const legalName = envValue("DRIVEMATE_LEGAL_NAME");
  const abn = envValue("DRIVEMATE_ABN");
  const accountsEmail = envValue("DRIVEMATE_ACCOUNTS_EMAIL");
  const importSigningSecret = envValue("DRIVEMATE_IMPORT_SIGNING_SECRET");
  const turnstileSiteKey = envValue("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
  const turnstileSecretKey = envValue("TURNSTILE_SECRET_KEY");

  if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) {
    fail("DRIVEMATE_BASE_URL must be a deployed staging URL, not localhost.");
  }
  if (baseUrl && !baseUrl.startsWith("https://")) {
    fail("DRIVEMATE_BASE_URL must use https.");
  }
  if (
    siteUrl.includes("localhost") ||
    siteUrl.includes("127.0.0.1") ||
    siteUrl.includes("<")
  ) {
    fail(
      "NEXT_PUBLIC_SITE_URL must be a real public site URL, not localhost or a placeholder.",
    );
  }
  if (process.env.DRIVEMATE_GST_REGISTERED !== "true") {
    fail(
      "DRIVEMATE_GST_REGISTERED must be true after the effective GST registration is confirmed on the ABR.",
    );
  }
  if (siteUrl && !siteUrl.startsWith("https://")) {
    fail("NEXT_PUBLIC_SITE_URL must use https.");
  }
  if (looksPlaceholder(legalName)) {
    fail(
      "DRIVEMATE_LEGAL_NAME must be the registered company name, not a placeholder.",
    );
  }
  if (!/^\d{11}$/.test(abn.replace(/\s/g, ""))) {
    fail("DRIVEMATE_ABN must be a real 11-digit Australian Business Number.");
  }
  if (
    looksPlaceholder(accountsEmail) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountsEmail)
  ) {
    fail(
      "DRIVEMATE_ACCOUNTS_EMAIL must be a real monitored accounts email address.",
    );
  }

  if (process.env.DRIVEMATE_REPOSITORY !== "supabase") {
    fail("DRIVEMATE_REPOSITORY must be set to supabase.");
  }
  if (process.env.DRIVEMATE_ENABLE_DEMO_AUTH !== "false") {
    fail("DRIVEMATE_ENABLE_DEMO_AUTH must be false.");
  }
  if (process.env.NEXT_PUBLIC_SHOW_INTERNAL_NAV !== "false") {
    fail("NEXT_PUBLIC_SHOW_INTERNAL_NAV must be false.");
  }
  if (process.env.DRIVEMATE_SMOKE_USE_DEMO_HEADERS === "true") {
    fail(
      "DRIVEMATE_SMOKE_USE_DEMO_HEADERS must not be true for release readiness.",
    );
  }
  if (importSigningSecret.length < 32)
    fail("DRIVEMATE_IMPORT_SIGNING_SECRET must be at least 32 characters.");
  if (process.env.DRIVEMATE_REQUIRE_STAFF_MFA !== "true")
    fail("DRIVEMATE_REQUIRE_STAFF_MFA must be true.");
  if (process.env.DRIVEMATE_TURNSTILE_REQUIRED !== "true")
    fail("DRIVEMATE_TURNSTILE_REQUIRED must be true.");
  if (
    turnstileSiteKey === "1x00000000000000000000AA" ||
    turnstileSecretKey === "1x0000000000000000000000000000000AA"
  ) {
    fail("Production release cannot use Cloudflare Turnstile test credentials.");
  }
  if (
    process.env.DRIVEMATE_ENVIRONMENT !== "production" ||
    process.env.DRIVEMATE_SUPABASE_ENVIRONMENT !== "production"
  ) {
    fail(
      "Production release requires explicit production app and Supabase environment markers.",
    );
  }

  if (process.exitCode) process.exit();
}

const explicitReleaseEnvFile = process.env.DRIVEMATE_RELEASE_ENV_FILE?.trim();
if (explicitReleaseEnvFile) {
  loadEnvFile(explicitReleaseEnvFile);
} else {
  loadEnvFile(".env.release.local");
  loadEnvFile(".env.local");
  loadEnvFile(".env");
}

console.log("DriveMate release readiness verification");
console.log("");

checkEnvironment();

const strictEnv = {
  ...process.env,
  REQUIRE_SUPABASE_USERS: "true",
  REQUIRE_SUPABASE_STORAGE: "true",
  DRIVEMATE_SMOKE_USE_DEMO_HEADERS: "false",
  DRIVEMATE_SMOKE_WRITE_CHECK: "true",
  DRIVEMATE_SMOKE_E2E_CHECK: "true",
  DRIVEMATE_SMOKE_MASTERDATA_CHECK: "true",
  DRIVEMATE_SMOKE_ACCOUNT_PROVISION_CHECK: "true",
};

console.log("== Supabase strict readiness ==");
await run(npmCommand, ["run", "verify:supabase"], strictEnv);

console.log("");
console.log("== Deployed staging application readiness ==");
await run(npmCommand, ["run", "verify:staging"], strictEnv);

console.log("");
console.log("PASS release readiness verification completed");
