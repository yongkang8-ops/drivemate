import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = join(process.cwd(), "supabase", "migrations");

describe("Supabase migration chain", () => {
  it("uses unique ordered versions and includes a clean-environment baseline", () => {
    const files = readdirSync(migrationDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const versions = files.map((file) => file.split("_", 1)[0]);

    expect(new Set(versions).size).toBe(versions.length);
    expect(files[0]).toBe("20260529_initial_schema.sql");
    expect(files).toContain("20260908_v23_product_label_profiles.sql");
    expect(files).toContain("20261101091923_warehouse_test_print_jobs.sql");
    expect(files.at(-1)).toBe("20261102025958_warehouse_test_print_job_privileges.sql");

    const baseline = readFileSync(join(migrationDirectory, files[0]), "utf8");
    expect(baseline).toContain("create table public.products");
    expect(baseline).toContain(
      "alter table public.products enable row level security",
    );
  });
});
