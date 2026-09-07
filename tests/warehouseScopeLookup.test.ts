import { expect, it } from "vitest";
import { resolveWarehouseScopeLookup } from "../lib/warehouseScopeLookup";
const cartons = [{ sourceCartonNumber: "7#8#9#", memberCartonNumbers: ["7#", "8#", "9#"] }, { sourceCartonNumber: "SUPPLIER-X" }];
it("distinguishes empty, unknown carton and an explicitly known product identifier", () => {
  expect(resolveWarehouseScopeLookup(" ", cartons, [])).toMatchObject({ status: "empty" });
  expect(resolveWarehouseScopeLookup("999#", cartons, [])).toMatchObject({ status: "not_found" });
  expect(resolveWarehouseScopeLookup("dm-gwm-0106", cartons, ["DM-GWM-0106"])).toMatchObject({ status: "wrong_kind" });
});
it("resolves members, honours arbitrary supplier identifiers and never mutates the source", () => {
  expect(resolveWarehouseScopeLookup(" 8# ", cartons, [])).toMatchObject({ status: "matched", carton: cartons[0], isMember: true });
  expect(resolveWarehouseScopeLookup("supplier-x", cartons, ["SUPPLIER-X"])).toMatchObject({ status: "matched", carton: cartons[1], isMember: false });
  expect(cartons).toHaveLength(2);
});
