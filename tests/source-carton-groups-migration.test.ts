import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260907_v22_source_carton_group_projection.sql",
);

describe("source carton group database projection", () => {
  it("stores generic source scopes and normalized member identifiers", () => {
    const sql = readFileSync(migrationPath, "utf8").replace(/\s+/g, " ");

    expect(sql).toContain("add column if not exists scope_kind text not null default 'carton'");
    expect(sql).toContain("create table if not exists public.shipment_carton_members");
    expect(sql).toContain("unique (shipment_id, normalized_member_identifier)");
    expect(sql).toContain("foreign key (carton_id, shipment_id)");
    expect(sql).toContain("add column if not exists normalized_pallet_number text generated always as");
    expect(sql).toContain("shipment_pallets_normalized_number_unique");
  });

  it("adds v3 confirmation while retaining the v1 and v2 implementation", () => {
    const sql = readFileSync(migrationPath, "utf8").replace(/\s+/g, " ");

    expect(sql).toContain("rename to dm_confirm_packing_list_revision_v21");
    expect(sql).toContain("rename to dm_assert_warehouse_receipt_scope_v21");
    expect(sql).toContain("perform public.dm_assert_warehouse_receipt_scope_v21(p_shipment_id,v_canonical_scope)");
    expect(sql).toContain("if v_schema_version in (1,2) then");
    expect(sql).toContain("return public.dm_confirm_packing_list_revision_v21(p_revision_id,p_actor_id)");
    expect(sql).toContain("if v_schema_version<>3 then");
    expect(sql).toContain("insert into public.shipment_carton_members");
  });

  it("keeps the v3 projection independent from supplier and freight-provider formats", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    expect(sql).not.toContain("7#8#9#");
    expect(sql).not.toContain("supplier_name");
    expect(sql).not.toContain("freight_forwarder");
    expect(sql).not.toContain("excel");
  });
});
