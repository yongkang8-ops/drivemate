import { NextResponse } from "next/server";
import { getRepository } from "../../../lib/repository";
import { requestCan } from "../../../lib/serverAuth";

export async function GET(request: Request) {
  if (!(await requestCan(request, "admin_read"))) {
    return NextResponse.json({ ok: false, message: "Admin state requires an admin role." }, { status: 403 });
  }

  return NextResponse.json(await getRepository().getAdminState());
}
