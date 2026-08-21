import { NextResponse } from "next/server";
import { getRuntimeReadiness } from "../../../lib/runtimeReadiness";
import { createServiceSupabaseClient } from "../../../lib/supabaseClient";

type HealthCheck = { name: string; status: "pass" | "warn" | "fail"; message: string };

async function databaseChecks(readiness: ReturnType<typeof getRuntimeReadiness>): Promise<HealthCheck[]> {
  if (readiness.repository.mode !== "supabase" || !readiness.auth.supabaseConfigured) return [];

  const { data, error } = await createServiceSupabaseClient().rpc("dm_v11_readiness_snapshot");
  if (error || !data) {
    return [
      {
        name: "database_migration",
        status: "fail",
        message: "V1.1 database migration and readiness snapshot are required.",
      },
    ];
  }

  const schema = data.schema ?? {};
  const purchase = data.purchase_import ?? {};
  const schemaReady =
    schema.missing_rls_count === 0 &&
    schema.missing_function_count === 0 &&
    schema.direct_client_write_grant_count === 0;
  const purchasePresent = purchase.purchase_order_count === 1;
  const purchaseReady =
    purchasePresent &&
    purchase.line_count === 119 &&
    purchase.unique_part_number_count === 119 &&
    purchase.quantity === 706 &&
    purchase.subtotal_minor === 6313780 &&
    purchase.discount_minor === 13780 &&
    purchase.cash_cost_minor === 6300000 &&
    purchase.final_total_minor === 6300000 &&
    purchase.gate_mismatch_count === 0 &&
    purchase.public_product_count === 0 &&
    purchase.available_stock === 0;

  const checks: HealthCheck[] = [
    {
      name: "database_migration",
      status: schemaReady ? "pass" : "fail",
      message: schemaReady
        ? "V1.1 schema, RLS, transaction functions and client grant boundaries are verified."
        : "V1.1 database security or transaction controls are incomplete.",
    },
  ];
  if (!purchasePresent) {
    checks.push({
      name: "purchase_import",
      status: readiness.environment === "production" ? "fail" : "warn",
      message: "The authoritative purchase order has not been committed to this environment.",
    });
  } else {
    checks.push({
      name: "purchase_import",
      status: purchaseReady ? "pass" : "fail",
      message: purchaseReady
        ? "Authoritative purchase controls and initial inventory gates are verified."
        : "Authoritative purchase data or initial inventory gates do not reconcile.",
    });
  }
  return checks;
}

export async function GET() {
  const readiness = getRuntimeReadiness();
  const checks = [...readiness.checks, ...(await databaseChecks(readiness))];
  const ready = !checks.some((check) => check.status === "fail");
  return NextResponse.json({ ...readiness, ready, checks }, { status: ready ? 200 : 503 });
}
