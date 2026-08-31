import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../lib/auth";
import { sensitiveOperationAccessError } from "../../../../lib/apiAuthResponses";
import { mutationRequestAllowed } from "../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../lib/serverAuth";
import { createStaffAccount, listStaffAccounts } from "../../../../lib/staffAdminService";

const createStaffSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320),
  role: z.enum(["warehouse_staff", "partner"]),
}).strict();

export async function GET(request: Request) {
  const auth = await getRequestContext(request);
  if (!can(auth.role, "staff_read")) {
    return NextResponse.json({ ok: false, code: "forbidden", message: "Staff directory access is required." }, { status: 403 });
  }
  const canManage = can(auth.role, "staff_manage");
  const result = await listStaffAccounts({ includeAudit: canManage });
  return NextResponse.json(
    result.ok ? { ...result, canManage } : result,
    { status: result.ok ? 200 : 422 },
  );
}

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const auth = await getRequestContext(request);
  const accessError = sensitiveOperationAccessError(
    auth,
    can(auth.role, "staff_manage"),
    "Administrator access is required to create staff accounts.",
  );
  if (accessError) return accessError;
  if (!auth.userId) return NextResponse.json({ ok: false, message: "Administrator session is required." }, { status: 401 });

  const parsed = createStaffSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  const result = await createStaffAccount({ ...parsed.data, actorId: auth.userId });
  return NextResponse.json(result, { status: result.ok ? 201 : 422 });
}
