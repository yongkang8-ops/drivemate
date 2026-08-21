import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../../lib/auth";
import { createImportPreviewToken, verifyImportPreviewToken } from "../../../../../lib/importTokens";
import { mutationRequestAllowed } from "../../../../../lib/requestSecurity";
import { getRequestContext } from "../../../../../lib/serverAuth";
import { createServiceSupabaseClient } from "../../../../../lib/supabaseClient";

const vinRow = z.object({ vin: z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{17}$/), make: z.string().trim().min(2), model: z.string().trim().min(1), year: z.number().int().min(1980).max(2100), engine: z.string().trim().default(""), variant: z.string().trim().default(""), market: z.string().trim().min(2).default("AU"), source: z.string().trim().min(1), notes: z.string().trim().default("") });
const requestSchema = z.object({ mode: z.enum(["preview", "commit"]), rows: z.array(vinRow).min(1).max(5000), previewToken: z.string().optional(), idempotencyKey: z.string().min(8).max(120).optional() });
function sourceHash(rows: z.infer<typeof vinRow>[]) { return createHash("sha256").update(JSON.stringify(rows)).digest("hex").toUpperCase(); }

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request)) return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  const auth = await getRequestContext(request);
  if (auth.mfaRequired || !can(auth.role, "admin_write")) return NextResponse.json({ ok: false, message: "Admin access with the required assurance level is required." }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  const rows = parsed.data.rows; const hash = sourceHash(rows); const vins = rows.map((row) => row.vin);
  if (new Set(vins).size !== vins.length) return NextResponse.json({ ok: false, message: "VIN import contains duplicate VINs." }, { status: 400 });
  if (parsed.data.mode === "preview") return NextResponse.json({ ok: true, previewToken: createImportPreviewToken({ sourceSha256: hash }), preview: { sourceSha256: hash, rowCount: rows.length, configurations: new Set(rows.map((row) => [row.make,row.model,row.year,row.engine,row.variant,row.market].join("|").toLowerCase())).size, status: "pending_review" } });
  if (!parsed.data.previewToken || !parsed.data.idempotencyKey) return NextResponse.json({ ok: false, message: "Preview token and idempotency key are required." }, { status: 400 });
  const token = verifyImportPreviewToken(parsed.data.previewToken); if (token.sourceSha256 !== hash) return NextResponse.json({ ok: false, message: "VIN rows do not match the approved preview." }, { status: 400 });
  const { data, error } = await createServiceSupabaseClient().rpc("dm_commit_vin_import", { p_source_sha256: hash, p_rows: rows, p_idempotency_key: parsed.data.idempotencyKey, p_actor_id: auth.userId ?? null });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 422 });
  return NextResponse.json({ ok: true, importRunId: data, importedVehicles: rows.length, status: "pending_review" });
}
