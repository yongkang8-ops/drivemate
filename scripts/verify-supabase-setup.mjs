import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function createTracker() {
  const failures = [];
  const warnings = [];
  return {
    pass(message) {
      console.log(`PASS ${message}`);
    },
    warn(message) {
      warnings.push(message);
      console.warn(`WARN ${message}`);
    },
    fail(message, detail) {
      const value = detail ? `${message}: ${detail}` : message;
      failures.push(value);
      console.error(`FAIL ${value}`);
    },
    finish() {
      console.log(`\nSummary: ${failures.length} failure(s), ${warnings.length} warning(s)`);
      if (failures.length) process.exitCode = 1;
    },
  };
}

async function requireQueryable(label, promise, result) {
  const { data, error } = await promise;
  if (error) result.fail(`${label} query failed`, error.message);
  else result.pass(`${label} is queryable${Array.isArray(data) ? ` (${data.length} row(s))` : ""}`);
  return data ?? [];
}

function expectEqual(result, label, actual, expected) {
  if (actual === expected) result.pass(label);
  else result.fail(label, `expected ${expected}, received ${actual}`);
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const result = createTracker();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const requirePiImport = process.env.REQUIRE_PI_IMPORT === "true";
const requireUsers = process.env.REQUIRE_SUPABASE_USERS === "true";
const requireStorage = process.env.REQUIRE_SUPABASE_STORAGE === "true";
const bucketName = process.env.SUPABASE_ACCOUNT_DOCUMENTS_BUCKET ?? "account-documents";

if (!url) result.fail("NEXT_PUBLIC_SUPABASE_URL is missing");
if (!serviceRoleKey) result.fail("SUPABASE_SERVICE_ROLE_KEY is missing");
if (!url || !serviceRoleKey) {
  result.finish();
  process.exit();
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log("DriveMate V1.1 Supabase verification");
console.log(`Project URL: ${url}\n`);

const { data: snapshot, error: snapshotError } = await supabase.rpc("dm_v11_readiness_snapshot");
if (snapshotError || !snapshot) {
  result.fail("V1.1 readiness snapshot is unavailable", snapshotError?.message);
} else {
  expectEqual(result, "all V1.1 business tables have RLS", snapshot.schema?.missing_rls_count, 0);
  expectEqual(result, "all required V1.1 transaction functions exist", snapshot.schema?.missing_function_count, 0);
  expectEqual(
    result,
    "anon/authenticated have no direct business-table write grants",
    snapshot.schema?.direct_client_write_grant_count,
    0,
  );

  const purchase = snapshot.purchase_import ?? {};
  if (!purchase.purchase_order_count) {
    const message = "authoritative PI has not been committed to this environment";
    if (requirePiImport) result.fail(message);
    else result.warn(`${message}; set REQUIRE_PI_IMPORT=true after commit`);
  } else {
    expectEqual(result, "authoritative PI created one purchase order", purchase.purchase_order_count, 1);
    expectEqual(result, "authoritative PI line count is 119", purchase.line_count, 119);
    expectEqual(result, "authoritative PI has 119 unique Part Numbers", purchase.unique_part_number_count, 119);
    expectEqual(result, "authoritative PI quantity is 706", purchase.quantity, 706);
    expectEqual(result, "authoritative PI subtotal is exact", purchase.subtotal_minor, 6313780);
    expectEqual(result, "authoritative PI discount allocation is exact", purchase.discount_minor, 13780);
    expectEqual(result, "authoritative PI cash cost is exact", purchase.cash_cost_minor, 6300000);
    expectEqual(result, "authoritative PI final total is exact", purchase.final_total_minor, 6300000);
    expectEqual(result, "all imported products remain at initial release gates", purchase.gate_mismatch_count, 0);
    expectEqual(result, "no imported product is publicly visible", purchase.public_product_count, 0);
    expectEqual(result, "imported purchase stock remains unavailable before receipt", purchase.available_stock, 0);
  }
}

await requireQueryable(
  "purchase and shipment model",
  supabase.from("purchase_orders").select("id, contract_number, status, source_import_run_id").limit(1),
  result,
);
await requireQueryable(
  "receipt and landed-cost model",
  supabase.from("goods_receipts").select("id, receipt_number, status").limit(1),
  result,
);
await requireQueryable(
  "compliance and VIN model",
  supabase.from("compliance_reviews").select("id, risk_tier, final_decision").limit(1),
  result,
);
await requireQueryable(
  "credit ledger and RMA model",
  supabase.from("account_ledger_entries").select("id, entry_type, amount_cents").limit(1),
  result,
);

const { data: profiles, error: profilesError } = await supabase.from("user_profiles").select("id, role");
if (profilesError) result.fail("user_profiles query failed", profilesError.message);
else {
  const roles = new Set((profiles ?? []).map((profile) => profile.role));
  for (const role of ["trade", "warehouse", "admin"]) {
    if (roles.has(role)) result.pass(`${role} test profile exists`);
    else if (requireUsers) result.fail(`${role} test profile is missing`);
    else result.warn(`${role} test profile is missing; create it before AAL2 staging smoke tests`);
  }
}

const { data: bucket, error: bucketError } = await supabase.storage.getBucket(bucketName);
if (bucketError || !bucket) {
  const message = `private storage bucket is missing: ${bucketName}`;
  if (requireStorage) result.fail(message, bucketError?.message);
  else result.warn(`${message}; create it before document testing`);
} else if (bucket.public) {
  result.fail(`${bucketName} must remain private`);
} else {
  result.pass(`${bucketName} exists and is private`);
}

result.finish();
