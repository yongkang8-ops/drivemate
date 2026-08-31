import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../../lib/auth";
import { sensitiveOperationAccessError } from "../../../../../lib/apiAuthResponses";
import { mutationRequestAllowed } from "../../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../../lib/serverAuth";
import { getStaffAccount, updateStaffAccount } from "../../../../../lib/staffAdminService";

const reason = z.string().trim().min(3).max(1000);
const updateStaffSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("disable"), reason }).strict(),
  z.object({ action: z.literal("reenable") }).strict(),
  z.object({ action: z.literal("change_role"), role: z.enum(["warehouse_staff", "partner"]), reason }).strict(),
  z.object({ action: z.literal("reset_password"), reason }).strict(),
  z.object({ action: z.literal("reset_mfa"), reason }).strict(),
]);

type Context = { params: Promise<{ userId: string }> };

export async function GET(request: Request, context: Context) {
  const auth = await getRequestContext(request);
  if (!can(auth.role, "staff_read")) {
    return NextResponse.json({ ok: false, code: "forbidden", message: "Staff directory access is required." }, { status: 403 });
  }
  const { userId } = await context.params;
  const canManage = can(auth.role, "staff_manage");
  const result = await getStaffAccount(userId, { includeAudit: canManage });
  return NextResponse.json(
    result.ok ? { ...result, canManage: canManage && result.account.role !== "admin" } : result,
    { status: result.ok ? 200 : "notFound" in result ? 404 : 422 },
  );
}

export async function PATCH(request: Request, context: Context) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const auth = await getRequestContext(request);
  const accessError = sensitiveOperationAccessError(
    auth,
    can(auth.role, "staff_manage"),
    "Administrator access is required to manage staff accounts.",
  );
  if (accessError) return accessError;
  if (!auth.userId) return NextResponse.json({ ok: false, message: "Administrator session is required." }, { status: 401 });

  const parsed = updateStaffSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  const { userId } = await context.params;
  const result = await updateStaffAccount({ userId, actorId: auth.userId, ...parsed.data });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
