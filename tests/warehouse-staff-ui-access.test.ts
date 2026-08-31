import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("warehouse staff workspace access", () => {
  it("allows warehouse staff to enter the warehouse workspace", () => {
    expect(read("app/warehouse/page.tsx")).toContain(
      '<RoleGate expectedRole="warehouse_staff">',
    );
  });

  it("treats partner and admin as inheriting warehouse staff access", () => {
    const source = read("components/AuthPanel.tsx");
    expect(source).toContain('expectedRole === "warehouse_staff"');
    expect(source).toContain(
      'role === "warehouse_staff" || role === "partner" || role === "admin"',
    );
  });

  it("uses the least-privileged demo role for routine warehouse requests", () => {
    for (const file of [
      "components/PartnerInboundWorkspace.tsx",
      "components/WarehousePutawayPanel.tsx",
      "components/ReceiptHistoryPanel.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain('buildApiHeaders("warehouse_staff"');
      expect(source).not.toContain('buildApiHeaders("partner"');
    }
  });
});
