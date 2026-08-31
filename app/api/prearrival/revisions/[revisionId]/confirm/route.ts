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
  if (!can(auth.role, "prearrival_manage")) {
    return NextResponse.json(
      { ok: false, message: "Pre-arrival revision management access is required." },
      { status: 403 },
    );
  }

  const { revisionId } = await context.params;
  const result = await getRepository().confirmPackingListRevision(revisionId, {
    actorId: auth.userId,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
