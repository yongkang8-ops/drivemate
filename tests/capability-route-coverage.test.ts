import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function routeSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeSources(path);
    return entry.name === "route.ts" ? [readFileSync(path, "utf8")] : [];
  });
}

describe("warehouse capability route coverage", () => {
  const sources = routeSources(join(process.cwd(), "app/api"));
  const combined = sources.join("\n");

  it("does not retain the retired broad inventory_write capability", () => {
    expect(combined).not.toContain("inventory_write");
  });

  it("enforces every approved warehouse and staff capability in an API route", () => {
    for (const capability of [
      "warehouse_label_print",
      "warehouse_receive",
      "warehouse_putaway",
      "warehouse_history_read",
      "inventory_adjust",
      "location_manage",
      "staff_read",
      "staff_manage",
      "prearrival_manage",
      "order_dispatch",
      "warehouse_rma_receive",
    ]) {
      expect(combined, `${capability} is not enforced by an API route`).toContain(
        `"${capability}"`,
      );
    }
  });
});
