import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260905_v20_optional_pallet_mapping.sql",
);

describe("optional pallet mapping migration contract", () => {
  it("stores a positive optional physical pallet count", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("add column if not exists physical_pallet_count integer");
    expect(migration).toContain("physical_pallet_count is null or physical_pallet_count > 0");
  });

  it("supports v2 carton-first payloads with nullable pallet links", () => {
    const migration = readFileSync(migrationPath, "utf8");
    const confirmFunction = migration.slice(
      migration.indexOf("create or replace function public.dm_confirm_packing_list_revision"),
    );
    expect(confirmFunction).toContain("payload_snapshot ->> 'schemaVersion'");
    expect(confirmFunction).toContain("payload_snapshot -> 'cartons'");
    expect(confirmFunction).toContain("nullif(trim(v_carton ->> 'sourcePalletNumber'), '')");
    expect(confirmFunction).toContain("v_pallet_id := null");
    expect(confirmFunction).toContain("pallet_id, carton_number");
    expect(confirmFunction).toContain("Mapped pallet count cannot exceed the physical pallet count");
    expect(confirmFunction).toContain("Complete pallet mapping must match the physical pallet count");
  });

  it("retains the legacy pallet-first branch and never inserts synthetic pallets", () => {
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("payload_snapshot -> 'pallets'");
    expect(migration).not.toMatch(/UNASSIGNED|UNMAPPED|P001/);
  });
});
