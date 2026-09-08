import { expect, it } from "vitest";
import { safeViewportContext } from "../lib/viewportContext";
import { safeWorkspaceNext } from "../lib/workspaceRouting";

it("allows only public catalogue search/paging without changing login destinations", () => {
  const route = "/catalogue?q=Oil+filter&cataloguePage=2&catalogueSize=50";
  expect(safeViewportContext(route)).toBe(route);
  expect(safeWorkspaceNext(route)).toBeNull();
});
it("does not persist unknown secret query keys or recovery fragments", () => {
  for (const route of ["/catalogue?access_token=secret", "/inventory?password=secret", "/catalogue#access_token=secret", "/catalogue?catalogueSize=999", "//evil.example/catalogue"]) expect(safeViewportContext(route)).toBeNull();
});
it("retains the existing supported internal scope context", () => {
  expect(safeViewportContext("/warehouse?shipmentId=QA&cartonNumber=20%23")).toBe("/warehouse?shipmentId=QA&cartonNumber=20%23");
});
