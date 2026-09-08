import { expect, it } from "vitest";
import { safeWorkspaceNext } from "../lib/workspaceRouting";
import { readWarehouseScope } from "../lib/warehouseScopeContext";

it("restores only valid canonical scope, distinguishing explicit full shipment", () => {
  const shipment = { cartons: [{ sourceCartonNumber: "10#" }], pallets: [{ sourcePalletNumber: "P#A" }] };
  expect(readWarehouseScope(new URLSearchParams("cartonNumber=10%23"), shipment)).toEqual({ ok: true, palletNumbers: [], cartonNumbers: ["10#"] });
  expect(readWarehouseScope(new URLSearchParams("scope=all"), shipment)).toEqual({ ok: true, palletNumbers: [], cartonNumbers: [] });
  expect(readWarehouseScope(new URLSearchParams(), shipment)).toEqual({ ok: true, palletNumbers: ["P#A"], cartonNumbers: [] });
  expect(readWarehouseScope(new URLSearchParams("cartonNumber=BAD"), shipment)).toEqual({ ok: false });
  expect(readWarehouseScope(new URLSearchParams("cartonNumber=10%23&palletNumber=P%23A"), shipment)).toEqual({ ok: false });
});

it("retains safe canonical supplier scope identifiers through login routing", () => {
  expect(safeWorkspaceNext("/warehouse?shipmentId=s1&cartonNumber=10%23&cartonNumber=20%23")).toBe("/warehouse?shipmentId=s1&cartonNumber=10%23&cartonNumber=20%23");
  expect(safeWorkspaceNext("/warehouse?shipmentId=s1&palletNumber=P%23A")).toBe("/warehouse?shipmentId=s1&palletNumber=P%23A");
  expect(safeWorkspaceNext("/warehouse?shipmentId=s1&scope=all")).toBe("/warehouse?shipmentId=s1&scope=all");
});

it("rejects scope controls, excessive values, and unrelated route keys", () => {
  expect(safeWorkspaceNext("/warehouse?cartonNumber=%0A")).toBeNull();
  expect(safeWorkspaceNext(`/warehouse?cartonNumber=${"x".repeat(201)}`)).toBeNull();
  expect(safeWorkspaceNext("/portal?cartonNumber=10%23")).toBeNull();
  expect(safeWorkspaceNext("/warehouse?scope=unknown")).toBeNull();
});
