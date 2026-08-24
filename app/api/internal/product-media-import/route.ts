import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "../../../../lib/supabaseClient";

type MediaMetadata = {
  pn: string;
  mediaType: "main_image" | "label_evidence";
  sourceRow: number;
  originalFilename: string;
  sourceSha256?: string;
  sha256: string;
  byteSize: number;
  width: number;
  height: number;
};

function validToken(actual: string | undefined, provided: string | null) {
  if (!actual || !provided) return false;
  const expected = Buffer.from(actual);
  const received = Buffer.from(provided);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function parseMetadata(value: string | null): MediaMetadata | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!/^[A-Z0-9-]+$/.test(parsed.pn ?? "")) return null;
    if (!['main_image', 'label_evidence'].includes(parsed.mediaType)) return null;
    if (![parsed.sourceRow, parsed.byteSize, parsed.width, parsed.height].every((item) => Number.isInteger(item) && item > 0)) return null;
    if (!/^[a-f0-9]{64}$/i.test(parsed.sha256 ?? "")) return null;
    if (parsed.sourceSha256 !== undefined && !/^[a-f0-9]{64}$/i.test(parsed.sourceSha256)) return null;
    if (typeof parsed.originalFilename !== "string" || !/\.(png|jpe?g)$/i.test(parsed.originalFilename)) return null;
    return parsed as MediaMetadata;
  } catch {
    return null;
  }
}

async function ensureBucket(bucketId: "product-images" | "product-evidence") {
  const supabase = createServiceSupabaseClient();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;
  if ((buckets ?? []).some((bucket) => bucket.id === bucketId)) return;
  const { error } = await supabase.storage.createBucket(bucketId, bucketId === "product-images"
    ? { public: true, fileSizeLimit: 5242880, allowedMimeTypes: ["image/webp"] }
    : { public: false, fileSizeLimit: 10485760, allowedMimeTypes: ["image/png"] });
  if (error) throw error;
}

export async function POST(request: Request) {
  if (!validToken(process.env.DRIVEMATE_MEDIA_IMPORT_TOKEN, request.headers.get("x-drivemate-media-import-token"))) {
    return new NextResponse(null, { status: 404 });
  }
  const metadata = parseMetadata(request.headers.get("x-drivemate-media-metadata"));
  if (!metadata) return NextResponse.json({ ok: false, message: "Invalid media metadata." }, { status: 400 });
  const expectedContentType = metadata.mediaType === "main_image" ? "image/webp" : "image/png";
  if (request.headers.get("content-type") !== expectedContentType) return NextResponse.json({ ok: false, message: "Unexpected media content type." }, { status: 415 });
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length !== metadata.byteSize || body.length > 4_000_000) return NextResponse.json({ ok: false, message: "Unexpected media payload size." }, { status: 400 });

  try {
    const supabase = createServiceSupabaseClient();
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, sku, oem_part_number, source_evidence")
      .eq("oem_part_number", metadata.pn)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) return NextResponse.json({ ok: false, message: "Part Number does not exist in Production products." }, { status: 404 });

    const bucketId = metadata.mediaType === "main_image" ? "product-images" : "product-evidence";
    await ensureBucket(bucketId);
    const extension = metadata.mediaType === "main_image" ? "webp" : "png";
    const storagePath = `gwm/${product.sku}/${metadata.mediaType === "main_image" ? "main" : "label"}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(bucketId).upload(storagePath, body, {
      contentType: expectedContentType,
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const existingEvidence = Array.isArray(product.source_evidence) ? product.source_evidence : [];
    const retainedEvidence = existingEvidence.filter((entry) => entry?.type !== metadata.mediaType);
    const sourceEvidence = [...retainedEvidence, {
      type: metadata.mediaType,
      visibility: metadata.mediaType === "main_image" ? "public" : "internal",
      bucket_id: bucketId,
      storage_path: storagePath,
      content_type: expectedContentType,
      byte_size: metadata.byteSize,
      width: metadata.width,
      height: metadata.height,
      sha256: metadata.sha256,
      source_sha256: metadata.sourceSha256 ?? metadata.sha256,
      original_filename: metadata.originalFilename,
      source_row: metadata.sourceRow,
      part_number: metadata.pn,
    }];
    const publicUrl = metadata.mediaType === "main_image"
      ? supabase.storage.from("product-images").getPublicUrl(storagePath).data.publicUrl
      : undefined;
    const update = metadata.mediaType === "main_image"
      ? { image_url: publicUrl, source_evidence: sourceEvidence }
      : { source_evidence: sourceEvidence };
    const { error: updateError } = await supabase.from("products").update(update).eq("id", product.id);
    if (updateError) throw updateError;
    return NextResponse.json({ ok: true, sku: product.sku, pn: metadata.pn, mediaType: metadata.mediaType, storagePath, publicUrl });
  } catch {
    return NextResponse.json({ ok: false, message: "Media import failed." }, { status: 503 });
  }
}
