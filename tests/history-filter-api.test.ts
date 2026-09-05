import { beforeEach, describe, expect, it, vi } from "vitest";
const listWarehouseHistory = vi.hoisted(() => vi.fn());
vi.mock("../lib/serverAuth", () => ({ requestCan: async () => true }));
vi.mock("../lib/repository", () => ({ getRepository: () => ({ listWarehouseHistory }) }));
import { GET } from "../app/api/warehouse/history/route";

const events = [
  { id: "one", cartonNumbers: ["C001"] },
  { id: "two", cartonNumbers: ["C002"] },
  { id: "both", cartonNumbers: ["C001", "C002"] },
  { id: "outside", cartonNumbers: ["C003"] },
].map(event => ({ ...event, shipmentId: "s1", createdAt: "2026-09-04T13:45:00Z", action: "print_cancelled", reference: event.id, outcome: "Print cancelled" }));
describe("read-only history source context", () => {
  beforeEach(() => { listWarehouseHistory.mockReset(); listWarehouseHistory.mockResolvedValue({ ok: true, events }); });
  it("returns the union of selected scopes once and excludes unrelated sources", async () => {
    const response = await GET(new Request("http://localhost/api/warehouse/history?shipmentId=s1&sourceScope=C001&sourceScope=C002"));
    expect(response.status).toBe(200);
    expect((await response.json()).rows.map((row: any) => row.id)).toEqual(["one", "two", "both"]);
  });
  it("rejects a narrower filter outside the selected context before reading", async () => {
    const response = await GET(new Request("http://localhost/api/warehouse/history?shipmentId=s1&sourceScope=C001&cartonNumber=C003"));
    expect(response.status).toBe(400);
    expect(listWarehouseHistory).not.toHaveBeenCalled();
  });
  it("keeps legacy single-scope queries compatible and timezone display unchanged", async () => {
    listWarehouseHistory.mockResolvedValue({ ok: true, events: [events[1]] });
    const response = await GET(new Request("http://localhost/api/warehouse/history?shipmentId=s1&cartonNumber=C002&timeZone=Asia%2FShanghai"));
    expect((await response.json()).rows[0]).toMatchObject({ id: "two", time: "21:45", createdAt: "2026-09-04T13:45:00Z" });
    expect(listWarehouseHistory).toHaveBeenCalledWith(expect.objectContaining({ shipmentId: "s1", cartonNumber: "C002" }));
  });
});
