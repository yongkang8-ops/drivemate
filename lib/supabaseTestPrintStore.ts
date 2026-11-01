import { createServiceSupabaseClient } from "./supabaseClient";
import {
  existingTestOutcome,
  testPrintConflict,
  testPrintMissing,
  type TestPrintStore,
  type TestPrintCreateInput,
  type TestPrintJob,
  type TestPrintOutcome,
  type TestPrintResult,
} from "./warehouseTestPrint";
type Row = {
  id: string;
  request_id: string;
  request_key: string;
  shipment_id: string;
  labels: TestPrintJob["labels"];
  status: TestPrintJob["status"];
  created_by: string;
  created_at: string;
  outcome_by: string | null;
  outcome_at: string | null;
  reason: string | null;
};
function job(row: Row): TestPrintJob {
  return {
    id: row.id,
    requestId: row.request_id,
    requestKey: row.request_key,
    shipmentId: row.shipment_id,
    labels: row.labels,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    ...(row.outcome_by ? { outcomeBy: row.outcome_by } : {}),
    ...(row.outcome_at ? { outcomeAt: row.outcome_at } : {}),
    ...(row.reason !== null ? { reason: row.reason } : {}),
  };
}
export class SupabaseTestPrintStore implements TestPrintStore {
  private table() {
    return createServiceSupabaseClient().from("warehouse_test_print_jobs");
  }
  async create(
    input: TestPrintCreateInput,
    actor: string,
  ): Promise<TestPrintResult> {
    const { data, error } = await this.table()
      .insert({
        request_id: input.requestId,
        request_key: input.requestKey,
        shipment_id: input.shipmentId,
        labels: input.labels,
        created_by: actor,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code !== "23505") throw error;
      const existing = await this.findByRequest(input.requestId, actor);
      return existing?.requestKey === input.requestKey
        ? { ok: true, job: existing }
        : testPrintConflict();
    }
    return { ok: true, job: job(data as Row) };
  }
  async get(id: string) {
    const { data, error } = await this.table()
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? job(data as Row) : null;
  }
  async findByRequest(requestId: string, actor: string) {
    const { data, error } = await this.table()
      .select("*")
      .eq("request_id", requestId)
      .eq("created_by", actor)
      .maybeSingle();
    if (error) throw error;
    return data ? job(data as Row) : null;
  }
  async list(shipmentId: string, page: number) {
    const { data, error, count } = await this.table()
      .select("*", { count: "exact" })
      .eq("shipment_id", shipmentId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((page - 1) * 25, page * 25 - 1);
    if (error) throw error;
    return { jobs: (data ?? []).map((r) => job(r as Row)), total: count ?? 0 };
  }
  async recordOutcome(
    id: string,
    outcome: TestPrintOutcome,
    reason: string,
    actor: string,
  ): Promise<TestPrintResult> {
    const { data, error } = await this.table()
      .update({
        status: outcome,
        reason,
        outcome_by: actor,
        outcome_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (data) return { ok: true, job: job(data as Row) };
    const existing = await this.get(id);
    return existing
      ? existingTestOutcome(existing, outcome, reason)
      : testPrintMissing();
  }
}
