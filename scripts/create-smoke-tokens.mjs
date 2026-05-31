import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const roleConfigs = [
  {
    role: "trade",
    tokenKey: "DRIVEMATE_SMOKE_TRADE_TOKEN",
    emailKey: "DRIVEMATE_SEED_TRADE_EMAIL",
    passwordKey: "DRIVEMATE_SEED_TRADE_PASSWORD",
  },
  {
    role: "warehouse",
    tokenKey: "DRIVEMATE_SMOKE_WAREHOUSE_TOKEN",
    emailKey: "DRIVEMATE_SEED_WAREHOUSE_EMAIL",
    passwordKey: "DRIVEMATE_SEED_WAREHOUSE_PASSWORD",
  },
  {
    role: "admin",
    tokenKey: "DRIVEMATE_SMOKE_ADMIN_TOKEN",
    emailKey: "DRIVEMATE_SEED_ADMIN_EMAIL",
    passwordKey: "DRIVEMATE_SEED_ADMIN_PASSWORD",
  },
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

function requireEnv(key) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function optionalEnv(key) {
  return process.env[key]?.trim() || undefined;
}

function maskToken(token) {
  if (token.length <= 16) return "<short-token>";
  return `${token.slice(0, 8)}...${token.slice(-8)}`;
}

function powershellQuote(value) {
  return value.replace(/'/g, "''");
}

function expiryLabel(expiresAt) {
  if (!expiresAt) return "unknown expiry";
  return new Date(expiresAt * 1000).toISOString();
}

function createAuthClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function signInRole(url, anonKey, config) {
  const authClient = createAuthClient(url, anonKey);
  const email = requireEnv(config.emailKey);
  const password = requireEnv(config.passwordKey);
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    throw new Error(`Could not sign in ${config.role} user ${email}: ${error?.message ?? "missing session"}`);
  }

  return {
    role: config.role,
    tokenKey: config.tokenKey,
    email,
    userId: data.user.id,
    accessToken: data.session.access_token,
    expiresAt: data.session.expires_at,
  };
}

async function verifyProfile(serviceClient, token) {
  if (!serviceClient) return { ok: true, skipped: true };

  const { data, error } = await serviceClient
    .from("user_profiles")
    .select("role, trade_account_id")
    .eq("id", token.userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, message: "profile row missing" };
  if (data.role !== token.role) return { ok: false, message: `expected ${token.role}, got ${data.role}` };
  if (token.role === "trade" && !data.trade_account_id) {
    return { ok: false, message: "trade profile missing trade_account_id" };
  }

  return { ok: true };
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceRoleKey = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");

const serviceClient = serviceRoleKey
  ? createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

console.log("DriveMate staging smoke token generation");
console.log(`Project URL: ${url}`);
console.log("");

const tokens = [];
for (const config of roleConfigs) {
  const token = await signInRole(url, anonKey, config);
  const profile = await verifyProfile(serviceClient, token);

  if (!profile.ok) {
    throw new Error(`${config.role} profile check failed: ${profile.message}`);
  }

  const suffix = profile.skipped ? "profile check skipped" : "profile checked";
  console.log(`PASS ${config.role} token created for ${token.email} (${suffix}, expires ${expiryLabel(token.expiresAt)})`);
  tokens.push(token);
}

console.log("");
console.log("Sensitive output follows. Use these only in your local shell or CI secret store.");
console.log("");
for (const token of tokens) {
  console.log(`# ${token.role}: ${token.email}, ${maskToken(token.accessToken)}, expires ${expiryLabel(token.expiresAt)}`);
  console.log(`$env:${token.tokenKey}='${powershellQuote(token.accessToken)}'`);
}

console.log("");
console.log("Then run:");
console.log("$env:DRIVEMATE_BASE_URL='https://<vercel-staging-url>'");
console.log("npm run verify:staging");
