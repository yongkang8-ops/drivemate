import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const roleConfigs = [
  {
    role: "trade",
    emailKey: "DRIVEMATE_SEED_TRADE_EMAIL",
    passwordKey: "DRIVEMATE_SEED_TRADE_PASSWORD",
    displayName: "Demo Trade Workshop",
  },
  {
    role: "warehouse",
    emailKey: "DRIVEMATE_SEED_WAREHOUSE_EMAIL",
    passwordKey: "DRIVEMATE_SEED_WAREHOUSE_PASSWORD",
    displayName: "Demo Warehouse User",
  },
  {
    role: "admin",
    emailKey: "DRIVEMATE_SEED_ADMIN_EMAIL",
    passwordKey: "DRIVEMATE_SEED_ADMIN_PASSWORD",
    displayName: "Demo Admin User",
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

async function findUserByEmail(supabase, email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === target);
    if (user) return user;
    if (data.users.length < 1000) break;
  }

  return null;
}

async function getOrCreateAuthUser(supabase, { email, password, displayName, role }) {
  const existingUser = await findUserByEmail(supabase, email);
  if (existingUser) {
    console.log(`SKIP auth user exists: ${email}`);
    return existingUser;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      drivemate_role: role,
    },
  });

  if (error) throw error;
  console.log(`PASS auth user created: ${email}`);
  return data.user;
}

async function getOrCreateTradeAccount(supabase) {
  const accountName = process.env.DRIVEMATE_SEED_TRADE_ACCOUNT_NAME?.trim() || "DriveMate Demo Workshop";
  const abn = process.env.DRIVEMATE_SEED_TRADE_ACCOUNT_ABN?.trim() || null;

  const { data: existing, error: existingError } = await supabase
    .from("trade_accounts")
    .select("id")
    .eq("account_name", accountName)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    console.log(`SKIP trade account exists: ${accountName}`);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("trade_accounts")
    .insert({ account_name: accountName, abn, status: "approved" })
    .select("id")
    .single();

  if (error) throw error;
  console.log(`PASS trade account created: ${accountName}`);
  return data.id;
}

async function upsertProfile(supabase, { userId, role, displayName, tradeAccountId }) {
  const { error } = await supabase.from("user_profiles").upsert(
    {
      id: userId,
      role,
      display_name: displayName,
      trade_account_id: role === "trade" ? tradeAccountId : null,
    },
    { onConflict: "id" },
  );

  if (error) throw error;
  console.log(`PASS profile upserted: ${displayName} (${role})`);
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const missingKeys = roleConfigs.flatMap((config) =>
  [config.emailKey, config.passwordKey].filter((key) => !process.env[key]?.trim()),
);

if (missingKeys.length) {
  throw new Error(`Missing staging user environment variable(s): ${missingKeys.join(", ")}`);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

console.log("DriveMate Supabase staging user creation");
console.log(`Project URL: ${url}`);
console.log("");

const tradeAccountId = await getOrCreateTradeAccount(supabase);

for (const config of roleConfigs) {
  const email = requireEnv(config.emailKey);
  const password = requireEnv(config.passwordKey);
  const user = await getOrCreateAuthUser(supabase, {
    email,
    password,
    displayName: config.displayName,
    role: config.role,
  });

  await upsertProfile(supabase, {
    userId: user.id,
    role: config.role,
    displayName: config.displayName,
    tradeAccountId,
  });
}

console.log("");
console.log("Done. Run `npm run verify:supabase` with REQUIRE_SUPABASE_USERS=true before live login testing.");
