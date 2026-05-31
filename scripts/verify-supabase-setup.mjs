import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const requiredSeedSkus = [
  "DM-GWM-OF-001",
  "DM-GWM-AF-002",
  "DM-GWM-CF-003",
  "DM-GWM-FF-004",
  "DM-BYD-CF-007",
  "DM-MG-CF-008",
];
const requiredRoles = ["trade", "warehouse", "admin"];
const requiredFitments = [
  { sku: "DM-GWM-FF-004", make: "GWM", model: "Cannon Alpha" },
  { sku: "DM-BYD-CF-007", make: "BYD", model: "Atto 3" },
  { sku: "DM-MG-CF-008", make: "MG", model: "MG4" },
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

function createResultTracker() {
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
    fail(message, details) {
      const line = details ? `${message}: ${details}` : message;
      failures.push(line);
      console.error(`FAIL ${line}`);
    },
    finish() {
      console.log("");
      console.log(`Summary: ${failures.length} failure(s), ${warnings.length} warning(s)`);
      if (failures.length) process.exitCode = 1;
    },
  };
}

async function requireRows(label, query, tracker) {
  const { data, error } = await query;
  if (error) {
    tracker.fail(`${label} query failed`, error.message);
    return [];
  }

  if (!data?.length) {
    tracker.fail(`${label} has no rows`);
    return [];
  }

  tracker.pass(`${label} returned ${data.length} row(s)`);
  return data;
}

async function requireQueryable(label, query, tracker) {
  const { data, error } = await query;
  if (error) {
    tracker.fail(`${label} query failed`, error.message);
    return [];
  }

  tracker.pass(`${label} query succeeded${Array.isArray(data) ? ` (${data.length} row(s))` : ""}`);
  return data ?? [];
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const tracker = createResultTracker();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const requireUsers = process.env.REQUIRE_SUPABASE_USERS === "true";
const requireStorage = process.env.REQUIRE_SUPABASE_STORAGE === "true";
const accountDocumentsBucket = process.env.SUPABASE_ACCOUNT_DOCUMENTS_BUCKET ?? "account-documents";

if (!url) tracker.fail("NEXT_PUBLIC_SUPABASE_URL is missing");
if (!serviceRoleKey) tracker.fail("SUPABASE_SERVICE_ROLE_KEY is missing");

if (!url || !serviceRoleKey) {
  tracker.finish();
  process.exit();
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

console.log("DriveMate Supabase staging verification");
console.log(`Project URL: ${url}`);
console.log("");

const products = await requireRows(
  "products",
  supabase.from("products").select("sku, brand, part_name, status, reorder_point, reorder_quantity").order("sku", { ascending: true }),
  tracker,
);

const foundSkus = new Set(products.map((product) => product.sku));
for (const sku of requiredSeedSkus) {
  if (foundSkus.has(sku)) tracker.pass(`seed SKU exists: ${sku}`);
  else tracker.fail(`seed SKU missing: ${sku}`);
}

await requireRows(
  "fitment_rules",
  supabase.from("fitment_rules").select("id, make, model, confidence, products(sku)").limit(20),
  tracker,
);

const { data: fitments, error: fitmentCoverageError } = await supabase
  .from("fitment_rules")
  .select("make, model, products(sku)");
if (fitmentCoverageError) {
  tracker.fail("fitment coverage query failed", fitmentCoverageError.message);
} else {
  for (const expected of requiredFitments) {
    const exists = (fitments ?? []).some((rule) => {
      const product = Array.isArray(rule.products) ? rule.products[0] : rule.products;
      return product?.sku === expected.sku && rule.make === expected.make && rule.model === expected.model;
    });
    if (exists) tracker.pass(`fitment exists: ${expected.sku} ${expected.make} ${expected.model}`);
    else tracker.fail(`fitment missing: ${expected.sku} ${expected.make} ${expected.model}`);
  }
}

const { data: indexes, error: indexError } = await supabase
  .from("pg_indexes")
  .select("indexname")
  .eq("schemaname", "public")
  .eq("tablename", "fitment_rules")
  .eq("indexname", "fitment_rules_unique_vehicle");
if (indexError) {
  tracker.warn("fitment unique index check could not query pg_indexes; verify manually in Supabase SQL editor");
} else if (indexes?.length) {
  tracker.pass("fitment duplicate-prevention index exists");
} else {
  tracker.fail("fitment duplicate-prevention index missing: fitment_rules_unique_vehicle");
}

await requireRows(
  "inventory_locations",
  supabase.from("inventory_locations").select("id, warehouse, zone, bin_code").limit(5),
  tracker,
);

await requireRows(
  "inventory_batches",
  supabase.from("inventory_batches").select("id, batch_no, supplier_name").limit(5),
  tracker,
);

await requireRows(
  "inventory_balances",
  supabase.from("inventory_balances").select("id, on_hand, reserved, quarantine").limit(5),
  tracker,
);

await requireQueryable(
  "stock_movements operational columns",
  supabase
    .from("stock_movements")
    .select(
      "id, product_id, batch_id, movement_type, quantity, from_location_id, to_location_id, reference_type, reference_id, created_by, created_at",
    )
    .limit(1),
  tracker,
);

await requireQueryable(
  "sales_orders operational columns",
  supabase
    .from("sales_orders")
    .select("id, trade_account_id, status, po_number, vehicle_rego, vehicle_vin, subtotal_ex_gst_cents, gst_cents, total_inc_gst_cents, created_by, created_at")
    .limit(1),
  tracker,
);

await requireQueryable(
  "sales_order_lines operational columns",
  supabase
    .from("sales_order_lines")
    .select("id, sales_order_id, product_id, quantity, unit_price_ex_gst_cents, line_total_ex_gst_cents, gst_cents, line_total_inc_gst_cents, status")
    .limit(1),
  tracker,
);

await requireQueryable(
  "account_documents operational columns",
  supabase
    .from("account_documents")
    .select("id, trade_account_id, document_type, document_ref, storage_path, created_at")
    .limit(1),
  tracker,
);

await requireRows(
  "pricing_rules",
  supabase.from("pricing_rules").select("id, sku, channel, price_mode, unit_price_ex_gst_cents, status").limit(5),
  tracker,
);

await requireRows(
  "rfq_reviews",
  supabase.from("rfq_reviews").select("id, brand, vehicle, requested_part, priority, status").limit(5),
  tracker,
);

await requireQueryable(
  "vehicle_lookup_requests operational columns",
  supabase
    .from("vehicle_lookup_requests")
    .select("id, trade_account_id, rego, vin, query, vehicle, match_count, confidence, created_by, created_at")
    .limit(1),
  tracker,
);

await requireQueryable(
  "trade_accounts application columns",
  supabase
    .from("trade_accounts")
    .select("id, account_name, abn, contact_name, contact_email, contact_phone, postcode, notes, status, created_at")
    .limit(1),
  tracker,
);

const { data: profiles, error: profilesError } = await supabase.from("user_profiles").select("id, role");
if (profilesError) {
  tracker.fail("user_profiles query failed", profilesError.message);
} else {
  const roles = new Set((profiles ?? []).map((profile) => profile.role));
  for (const role of requiredRoles) {
    if (roles.has(role)) {
      tracker.pass(`user role exists: ${role}`);
    } else if (requireUsers) {
      tracker.fail(`user role missing: ${role}`);
    } else {
      tracker.warn(`user role missing: ${role}; create before live testing`);
    }
  }
}

const { data: bucket, error: bucketError } = await supabase.storage.getBucket(accountDocumentsBucket);
if (bucketError || !bucket) {
  const message = `storage bucket missing: ${accountDocumentsBucket}`;
  if (requireStorage) tracker.fail(message, bucketError?.message);
  else tracker.warn(`${message}; create before document download testing`);
} else {
  tracker.pass(`storage bucket exists: ${accountDocumentsBucket}`);
}

tracker.finish();
