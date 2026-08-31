import { NextResponse } from "next/server";
import { can } from "../../../../../../lib/auth";
import { sensitiveOperationAccessError } from "../../../../../../lib/apiAuthResponses";
import { createImportPreviewToken } from "../../../../../../lib/importTokens";
import { previewPurchaseImport } from "../../../../../../lib/purchaseImport";
import { mutationRequestAllowed } from "../../../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../../../lib/serverAuth";

export const runtime = "nodejs";

function fileBuffer(value: FormDataEntryValue | null, required: boolean) {
  if (!(value instanceof File)) {
    if (required) throw new Error("The authoritative PI file is required.");
    return null;
  }
  if (value.size > 10 * 1024 * 1024) throw new Error("Import files must be 10 MB or smaller.");
  return value.arrayBuffer().then((buffer) => Buffer.from(buffer));
}

export async function POST(request: Request) {
  const auth = await getRequestContext(request);
  const accessError = sensitiveOperationAccessError(auth, can(auth.role, "admin_write"), "Admin access is required.");
  if (accessError) return accessError;
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request origin or CSRF validation failed." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const pi = await fileBuffer(form.get("pi"), true);
    const supplemental = await fileBuffer(form.get("supplemental"), false);
    const preview = await previewPurchaseImport(pi!, supplemental ?? undefined);
    const previewToken = createImportPreviewToken({
      sourceSha256: preview.sourceSha256,
      supplementalSha256: preview.supplementalSha256,
    });
    return NextResponse.json({ ok: true, previewToken, preview });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Purchase import preview failed." },
      { status: 400 },
    );
  }
}
