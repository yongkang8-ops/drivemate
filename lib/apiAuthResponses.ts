import { NextResponse } from "next/server";
import type { AuthContext } from "./serverAuth";

export function sensitiveOperationAccessError(
  auth: AuthContext,
  roleAllowed: boolean,
  forbiddenMessage: string,
) {
  if (!roleAllowed) {
    return NextResponse.json(
      { ok: false, code: "forbidden", message: forbiddenMessage },
      { status: 403 },
    );
  }
  if (auth.mfaRequired) {
    return NextResponse.json(
      {
        ok: false,
        code: "mfa_required",
        message: "Verify your identity to continue this sensitive operation.",
      },
      { status: 403 },
    );
  }
  return null;
}
