import { NextResponse } from "next/server";
import { can } from "../../../../../../lib/auth";
import { verifyImportPreviewToken } from "../../../../../../lib/importTokens";
import { AUTHORITATIVE_PI, previewPurchaseImport } from "../../../../../../lib/purchaseImport";
import { mutationRequestAllowed } from "../../../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../../../lib/serverAuth";
import { createServiceSupabaseClient } from "../../../../../../lib/supabaseClient";

export const runtime = "nodejs";

async function readFile(value: FormDataEntryValue | null, required: boolean) {
  if (!(value instanceof File)) {
    if (required) throw new Error("The authoritative PI file is required.");
    return undefined;
  }
  if (value.size > 10 * 1024 * 1024) throw new Error("Import files must be 10 MB or smaller.");
  return Buffer.from(await value.arrayBuffer());
}

export async function POST(request: Request) {
  const auth = await getRequestContext(request);
  if (auth.mfaRequired || !can(auth.role, "admin_write")) {
    return NextResponse.json({ ok: false, message: "Admin access with the required assurance level is required." }, { status: 403 });
  }
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request origin or CSRF validation failed." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const previewToken = verifyImportPreviewToken(String(form.get("previewToken") ?? ""));
    const idempotencyKey = String(form.get("idempotencyKey") ?? "").trim();
    if (!idempotencyKey) throw new Error("Idempotency key is required.");
    const pi = await readFile(form.get("pi"), true);
    const supplemental = await readFile(form.get("supplemental"), false);
    const preview = await previewPurchaseImport(pi!, supplemental);
    if (
      preview.sourceSha256 !== previewToken.sourceSha256 ||
      (preview.supplementalSha256 ?? "") !== (previewToken.supplementalSha256 ?? "")
    ) {
      throw new Error("Committed files do not match the approved preview.");
    }

    const payload = {
      sourceFileName: AUTHORITATIVE_PI.fileName,
      sourceVersion: "2026-08-20",
      sourceSha256: preview.sourceSha256,
      supplementalSha256: preview.supplementalSha256 ?? "",
      contractNumber: AUTHORITATIVE_PI.contractNumber,
      supplierName: preview.supplierName,
      summary: preview.summary,
      lines: preview.lines,
      cartons: preview.cartons,
      pallets: preview.pallets,
    };
    const { data, error } = await createServiceSupabaseClient().rpc("dm_commit_purchase_import", {
      p_payload: payload,
      p_actor_id: auth.userId ?? null,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, importRunId: data, summary: preview.summary });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Purchase import commit failed." },
      { status: 400 },
    );
  }
}
