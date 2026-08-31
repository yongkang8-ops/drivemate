import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createStaffAccount,
  getRequestContext,
  getStaffAccount,
  listStaffAccounts,
  updateStaffAccount,
} = vi.hoisted(() => ({
  createStaffAccount: vi.fn(),
  getRequestContext: vi.fn(),
  getStaffAccount: vi.fn(),
  listStaffAccounts: vi.fn(),
  updateStaffAccount: vi.fn(),
}));

vi.mock("../lib/requestSecurity", () => ({ mutationRequestAllowed: () => true }));
vi.mock("../lib/serverAuth", () => ({ getRequestContext }));
vi.mock("../lib/staffAdminService", () => ({
  createStaffAccount,
  getStaffAccount,
  listStaffAccounts,
  updateStaffAccount,
}));

const collectionPath = join(process.cwd(), "app/api/admin/staff/route.ts");
const itemPath = join(process.cwd(), "app/api/admin/staff/[userId]/route.ts");

async function collectionRoute() {
  return import("../app/api/admin/staff/route");
}

async function itemRoute() {
  return import("../app/api/admin/staff/[userId]/route");
}

describe("admin staff API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listStaffAccounts.mockResolvedValue({ ok: true, accounts: [] });
    getStaffAccount.mockResolvedValue({ ok: true, account: null, audit: [] });
  });

  it("provides private collection and item routes", () => {
    expect(existsSync(collectionPath)).toBe(true);
    expect(existsSync(itemPath)).toBe(true);
  });

  it("allows partners to read sanitized staff status without audit", async () => {
    if (!existsSync(collectionPath)) return;
    getRequestContext.mockResolvedValue({ role: "partner", userId: "partner-user", assuranceLevel: "aal1" });
    const { GET } = await collectionRoute();

    const response = await GET(new Request("https://drivemateparts.com.au/api/admin/staff"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, canManage: false });
    expect(listStaffAccounts).toHaveBeenCalledWith({ includeAudit: false });
  });

  it("prevents warehouse staff from reading the Staff directory", async () => {
    if (!existsSync(collectionPath)) return;
    getRequestContext.mockResolvedValue({ role: "warehouse_staff", userId: "warehouse-user", assuranceLevel: "aal1" });
    const { GET } = await collectionRoute();
    const response = await GET(new Request("https://drivemateparts.com.au/api/admin/staff"));
    expect(response.status).toBe(403);
    expect(listStaffAccounts).not.toHaveBeenCalled();
  });

  it("uses dedicated Staff read and management capabilities", () => {
    const collection = readFileSync(collectionPath, "utf8");
    const item = readFileSync(itemPath, "utf8");
    expect(collection).toContain('can(auth.role, "staff_read")');
    expect(collection).toContain('can(auth.role, "staff_manage")');
    expect(item).toContain('can(auth.role, "staff_read")');
    expect(item).toContain('can(auth.role, "staff_manage")');
  });

  it("requires AAL2 admin access before creating a staff account", async () => {
    if (!existsSync(collectionPath)) return;
    getRequestContext.mockResolvedValue({
      role: "admin",
      userId: "admin-user",
      assuranceLevel: "aal1",
      mfaRequired: true,
    });
    const { POST } = await collectionRoute();

    const response = await POST(new Request("https://drivemateparts.com.au/api/admin/staff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Warehouse One", email: "worker@example.com", role: "warehouse_staff" }),
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "mfa_required" });
    expect(createStaffAccount).not.toHaveBeenCalled();
  });

  it("creates only warehouse_staff or partner accounts and returns the one-time password once", async () => {
    if (!existsSync(collectionPath)) return;
    getRequestContext.mockResolvedValue({ role: "admin", userId: "admin-user", assuranceLevel: "aal2", mfaRequired: false });
    createStaffAccount.mockResolvedValue({
      ok: true,
      account: { userId: "new-user", email: "worker@example.com", role: "warehouse_staff", accountStatus: "pending_first_login" },
      temporaryPassword: "Generated-Password-123!",
      temporaryPasswordExpiresAt: "2026-09-06T00:00:00.000Z",
    });
    const { POST } = await collectionRoute();

    const response = await POST(new Request("https://drivemateparts.com.au/api/admin/staff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Warehouse One", email: "worker@example.com", role: "warehouse_staff" }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      temporaryPassword: "Generated-Password-123!",
    });
    expect(createStaffAccount).toHaveBeenCalledWith({
      displayName: "Warehouse One",
      email: "worker@example.com",
      role: "warehouse_staff",
      actorId: "admin-user",
    });

    const rejected = await POST(new Request("https://drivemateparts.com.au/api/admin/staff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Second Admin", email: "admin2@example.com", role: "admin" }),
    }));
    expect(rejected.status).toBe(400);
  });

  it("prevents partners from changing staff accounts", async () => {
    if (!existsSync(itemPath)) return;
    getRequestContext.mockResolvedValue({ role: "partner", userId: "partner-user", assuranceLevel: "aal1" });
    const { PATCH } = await itemRoute();

    const response = await PATCH(
      new Request("https://drivemateparts.com.au/api/admin/staff/target-user", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "disable", reason: "Employment ended." }),
      }),
      { params: Promise.resolve({ userId: "target-user" }) },
    );

    expect(response.status).toBe(403);
    expect(updateStaffAccount).not.toHaveBeenCalled();
  });

  it("dispatches a validated admin lifecycle action", async () => {
    if (!existsSync(itemPath)) return;
    getRequestContext.mockResolvedValue({ role: "admin", userId: "admin-user", assuranceLevel: "aal2", mfaRequired: false });
    updateStaffAccount.mockResolvedValue({ ok: true, account: { userId: "target-user", accountStatus: "disabled" } });
    const { PATCH } = await itemRoute();

    const response = await PATCH(
      new Request("https://drivemateparts.com.au/api/admin/staff/target-user", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "disable", reason: "Employment ended." }),
      }),
      { params: Promise.resolve({ userId: "target-user" }) },
    );

    expect(response.status).toBe(200);
    expect(updateStaffAccount).toHaveBeenCalledWith({
      userId: "target-user",
      actorId: "admin-user",
      action: "disable",
      reason: "Employment ended.",
    });
  });
});
