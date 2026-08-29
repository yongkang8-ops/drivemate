import { NextResponse } from "next/server";
import { can } from "../../../../../../lib/auth";
import { mutationRequestAllowed } from "../../../../../../lib/requestSecurity";
import { getRepository } from "../../../../../../lib/repository";
import { getRequestContext } from "../../../../../../lib/serverAuth";

export async function POST(
  request: Request,
  context: { params: Promise<{ revisionId: string }> },
) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json(
      { ok: false, message: "Request security validation failed." },
      { status: 403 },
    );
  }
  const auth = await getRequestContext(request);
  if (auth.mfaRequired || !can(auth.role, "inventory_write")) {
    return NextResponse.json(
      { ok: false, message: "Pre-arrival confirmation requires Partner access with the required assurance level." },
      { status: 403 },
    );
  }

  const { revisionId } = await context.params;
  const result = await getRepository().confirmPackingListRevision(revisionId, {
    actorId: auth.userId,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
