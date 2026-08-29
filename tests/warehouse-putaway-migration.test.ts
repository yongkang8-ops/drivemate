import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260902_v17_inventory_location_master.sql"),
  "utf8",
);

describe("warehouse putaway migration contract", () => {
  it("replaces automatic destination creation with an active master-location lookup", () => {
    const putawayFunction = migration.slice(migration.indexOf("drop function if exists public.dm_putaway_warehouse_receipt"));

    expect(putawayFunction).toContain("p_destination_location_code text");
    expect(putawayFunction).toContain("where location_code = upper(trim(p_destination_location_code))");
    expect(putawayFunction).toContain("and status = 'active'");
    expect(putawayFunction).toContain("and is_putaway_destination = true");
    expect(putawayFunction).not.toContain("insert into public.inventory_locations(warehouse, zone, bin_code)");
    expect(putawayFunction).toContain("grant execute on function public.dm_putaway_warehouse_receipt(");
  });
});
