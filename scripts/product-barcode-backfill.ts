import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CANONICAL_GWM_SKU = /^DM-GWM-(\d{4})$/;
const EXPECTED_PRODUCT_COUNT = 119;
const DEFAULT_ACTOR_EMAIL = "lee@drivemateparts.com.au";
const DEFAULT_INPUT = "docs/operations/inbound/2026-09-03-gwm-706-unit-inbound-master-data-v3.json";
const CSV_OUTPUT = "docs/operations/product-master/2026-09-04-gwm-product-barcode-backfill.csv";
const SQL_OUTPUT = "supabase/operations/20260904_p0_product_barcode_backfill.sql";
const ROLLBACK_OUTPUT = "supabase/operations/20260904_p0_product_barcode_backfill_rollback.sql";

export type AuthoritativeProductRow = {
  lineNumber: number;
  sku: string;
  partNumber: string;
};

export type ProductBarcodeManifestRow = {
  sourceLineNumber: number;
  sku: string;
  partNumber: string;
  barcode: string;
};

export type BackfillMetadata = {
  actorEmail: string;
  sourceFile: string;
  sourceHash: string;
};

export function deriveInternalProductBarcode(sku: string): string {
  const match = sku.match(CANONICAL_GWM_SKU);
  if (!match) {
    throw new Error(`Unsupported product SKU for the GWM barcode backfill: ${sku}`);
  }
  return `DMPGWM${match[1]}`;
}

export function buildProductBarcodeManifest(
  rows: AuthoritativeProductRow[],
): ProductBarcodeManifestRow[] {
  if (rows.length !== EXPECTED_PRODUCT_COUNT) {
    throw new Error(
      `Expected exactly ${EXPECTED_PRODUCT_COUNT} authoritative product rows; received ${rows.length}.`,
    );
  }

  const seenSkus = new Set<string>();
  const seenBarcodes = new Set<string>();
  const manifest = rows.map((row) => {
    const sku = row.sku.trim().toUpperCase();
    if (seenSkus.has(sku)) {
      throw new Error(`Duplicate authoritative SKU: ${sku}`);
    }
    seenSkus.add(sku);

    const barcode = deriveInternalProductBarcode(sku);
    if (seenBarcodes.has(barcode)) {
      throw new Error(`Duplicate generated product barcode: ${barcode}`);
    }
    seenBarcodes.add(barcode);

    if (!Number.isInteger(row.lineNumber) || row.lineNumber <= 0) {
      throw new Error(`Invalid authoritative source line number for ${sku}.`);
    }
    const partNumber = row.partNumber.trim().toUpperCase();
    if (!partNumber) {
      throw new Error(`Missing Part Number for ${sku}.`);
    }

    return {
      sourceLineNumber: row.lineNumber,
      sku,
      partNumber,
      barcode,
    };
  });

  return manifest.sort((left, right) => left.sku.localeCompare(right.sku, "en"));
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function validateMetadata(metadata: BackfillMetadata): void {
  if (!/^[A-F0-9]{64}$/i.test(metadata.sourceHash)) {
    throw new Error("Backfill source hash must be a 64-character SHA-256 value.");
  }
  if (!metadata.sourceFile.trim()) {
    throw new Error("Backfill source file is required.");
  }
  if (!metadata.actorEmail.includes("@")) {
    throw new Error("Backfill actor email is invalid.");
  }
}

function stagingSql(rows: ProductBarcodeManifestRow[]): string {
  const values = rows.map((row) => [
    row.sourceLineNumber,
    sqlLiteral(row.sku),
    sqlLiteral(row.partNumber),
    sqlLiteral(row.barcode),
  ].join(", "));
  return values.map((value) => `  (${value})`).join(",\n");
}

export function buildBackfillSql(
  rows: ProductBarcodeManifestRow[],
  metadata: BackfillMetadata,
): string {
  validateMetadata(metadata);
  if (rows.length !== EXPECTED_PRODUCT_COUNT) {
    throw new Error(`Expected exactly ${EXPECTED_PRODUCT_COUNT} manifest rows.`);
  }
  const actorEmail = sqlLiteral(metadata.actorEmail.toLowerCase());
  const sourceFile = sqlLiteral(metadata.sourceFile);
  const sourceHash = sqlLiteral(metadata.sourceHash.toUpperCase());

  return `-- DriveMate P0 product barcode master backfill.
-- Production execution requires separate explicit authorization and a logical backup.
begin;

create temporary table dm_product_barcode_backfill (
  source_row_number integer primary key,
  sku text not null unique,
  part_number text not null unique,
  barcode text not null unique
) on commit drop;

insert into dm_product_barcode_backfill (source_row_number, sku, part_number, barcode)
values
${stagingSql(rows)};

lock table public.products in share row exclusive mode;

do $$
declare
  v_actor_count integer;
begin
  if (select count(*) from dm_product_barcode_backfill) <> ${EXPECTED_PRODUCT_COUNT} then
    raise exception 'Expected exactly 119 staged product barcodes';
  end if;

  select count(*) into v_actor_count
  from auth.users as auth_user
  join public.user_profiles as profile on profile.id = auth_user.id
  where lower(auth_user.email) = ${actorEmail}
    and profile.role = 'admin'
    and profile.account_status = 'active';
  if v_actor_count <> 1 then
    raise exception 'Exactly one active admin actor is required for product barcode backfill';
  end if;

  if exists (
    select 1
    from dm_product_barcode_backfill as staged
    where (
      select count(*)
      from public.products as product
      where regexp_replace(upper(trim(product.sku)), '\\s+', ' ', 'g') = staged.sku
    ) <> 1
  ) then
    raise exception 'Production SKU matching is incomplete or ambiguous';
  end if;

  if exists (
    select 1
    from dm_product_barcode_backfill as staged
    join public.products as product
      on regexp_replace(upper(trim(product.sku)), '\\s+', ' ', 'g') = staged.sku
    where nullif(trim(product.barcode), '') is not null
      and regexp_replace(upper(trim(product.barcode)), '\\s+', ' ', 'g') <> staged.barcode
  ) then
    raise exception 'Existing product barcode would be overwritten';
  end if;

  if exists (
    select 1
    from dm_product_barcode_backfill as staged
    join public.products as product
      on regexp_replace(upper(trim(product.barcode)), '\\s+', ' ', 'g') = staged.barcode
    where regexp_replace(upper(trim(product.sku)), '\\s+', ' ', 'g') <> staged.sku
  ) then
    raise exception 'Generated barcode collides with another product';
  end if;
end;
$$;

create temporary table dm_product_barcode_targets on commit drop as
select
  product.id as product_id,
  product.sku,
  product.barcode as old_barcode,
  staged.barcode,
  staged.source_row_number
from dm_product_barcode_backfill as staged
join public.products as product
  on regexp_replace(upper(trim(product.sku)), '\\s+', ' ', 'g') = staged.sku;

update public.products as product
set barcode = target.barcode,
    updated_at = now()
from dm_product_barcode_targets as target
where product.id = target.product_id
  and nullif(trim(product.barcode), '') is null;

insert into public.audit_events (
  entity_type, entity_id, action, actor_id, before_value, after_value,
  source_file, source_hash, source_row_number, idempotency_key
)
select
  'product',
  target.product_id::text,
  'product_barcode_backfilled',
  (
    select auth_user.id
    from auth.users as auth_user
    join public.user_profiles as profile on profile.id = auth_user.id
    where lower(auth_user.email) = ${actorEmail}
      and profile.role = 'admin'
      and profile.account_status = 'active'
    limit 1
  ),
  jsonb_build_object('barcode', target.old_barcode),
  jsonb_build_object('barcode', target.barcode, 'scheme', 'DriveMate internal Code 128'),
  ${sourceFile},
  ${sourceHash},
  target.source_row_number,
  'p0-product-barcode-backfill-20260904:' || lower(target.sku)
from dm_product_barcode_targets as target
where nullif(trim(target.old_barcode), '') is null;

do $$
begin
  if exists (
    select 1
    from dm_product_barcode_backfill as staged
    join public.products as product
      on regexp_replace(upper(trim(product.sku)), '\\s+', ' ', 'g') = staged.sku
    where regexp_replace(upper(trim(product.barcode)), '\\s+', ' ', 'g') <> staged.barcode
  ) then
    raise exception 'Product barcode backfill post-check failed';
  end if;
end;
$$;

commit;
`;
}

export function buildRollbackSql(
  rows: ProductBarcodeManifestRow[],
  metadata: BackfillMetadata,
): string {
  validateMetadata(metadata);
  if (rows.length !== EXPECTED_PRODUCT_COUNT) {
    throw new Error(`Expected exactly ${EXPECTED_PRODUCT_COUNT} manifest rows.`);
  }
  const actorEmail = sqlLiteral(metadata.actorEmail.toLowerCase());
  const sourceFile = sqlLiteral(metadata.sourceFile);
  const sourceHash = sqlLiteral(metadata.sourceHash.toUpperCase());

  return `-- ROLLBACK REFERENCE ONLY. Do not execute without separate explicit authorization.
-- This script stays locked unless the authorized operator sets the transaction-local flag first.
begin;

do $$
begin
  if current_setting('drivemate.product_barcode_rollback_authorized', true) is distinct from 'approved' then
    raise exception 'Product barcode rollback is locked pending separate authorization';
  end if;
end;
$$;

create temporary table dm_product_barcode_rollback (
  source_row_number integer primary key,
  sku text not null unique,
  part_number text not null unique,
  barcode text not null unique
) on commit drop;

insert into dm_product_barcode_rollback (source_row_number, sku, part_number, barcode)
values
${stagingSql(rows)};

lock table public.products in share row exclusive mode;

do $$
declare
  v_actor_count integer;
begin
  select count(*) into v_actor_count
  from auth.users as auth_user
  join public.user_profiles as profile on profile.id = auth_user.id
  where lower(auth_user.email) = ${actorEmail}
    and profile.role = 'admin'
    and profile.account_status = 'active';
  if v_actor_count <> 1 then
    raise exception 'Exactly one active admin actor is required for product barcode rollback';
  end if;

  if exists (
    select 1
    from dm_product_barcode_rollback as staged
    where (
      select count(*) from public.products as product
      where regexp_replace(upper(trim(product.sku)), '\\s+', ' ', 'g') = staged.sku
    ) <> 1
  ) then
    raise exception 'Production SKU matching is incomplete or ambiguous';
  end if;

  if exists (
    select 1
    from dm_product_barcode_rollback as staged
    join public.products as product
      on regexp_replace(upper(trim(product.sku)), '\\s+', ' ', 'g') = staged.sku
    where regexp_replace(upper(trim(product.barcode)), '\\s+', ' ', 'g') <> staged.barcode
  ) then
    raise exception 'Product barcode changed after this backfill';
  end if;

  if exists (
    select 1
    from dm_product_barcode_rollback as staged
    join public.warehouse_receipt_session_lines as receipt_line
      on regexp_replace(upper(trim(receipt_line.product_barcode)), '\\s+', ' ', 'g') = staged.barcode
  ) then
    raise exception 'Warehouse receipt history already references a generated barcode';
  end if;

  if exists (
    select 1
    from public.warehouse_label_print_jobs as print_job
    where exists (
      select 1
      from dm_product_barcode_rollback as staged
      where lower(print_job.payload_snapshot::text) like '%' || lower(staged.barcode) || '%'
    )
  ) then
    raise exception 'Warehouse label history already references a generated barcode';
  end if;
end;
$$;

create temporary table dm_product_barcode_rollback_targets on commit drop as
select
  product.id as product_id,
  product.sku,
  product.barcode,
  staged.source_row_number
from dm_product_barcode_rollback as staged
join public.products as product
  on regexp_replace(upper(trim(product.sku)), '\\s+', ' ', 'g') = staged.sku;

update public.products as product
set barcode = null,
    updated_at = now()
from dm_product_barcode_rollback_targets as target
where product.id = target.product_id
  and regexp_replace(upper(trim(product.barcode)), '\\s+', ' ', 'g') = target.barcode;

insert into public.audit_events (
  entity_type, entity_id, action, actor_id, before_value, after_value,
  source_file, source_hash, source_row_number, idempotency_key
)
select
  'product',
  target.product_id::text,
  'product_barcode_backfill_rolled_back',
  (
    select auth_user.id
    from auth.users as auth_user
    join public.user_profiles as profile on profile.id = auth_user.id
    where lower(auth_user.email) = ${actorEmail}
      and profile.role = 'admin'
      and profile.account_status = 'active'
    limit 1
  ),
  jsonb_build_object('barcode', target.barcode),
  jsonb_build_object('barcode', null),
  ${sourceFile},
  ${sourceHash},
  target.source_row_number,
  'p0-product-barcode-backfill-rollback-20260904:' || lower(target.sku)
from dm_product_barcode_rollback_targets as target;

commit;
`;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function generateProductBarcodeArtifacts(options: {
  inputPath: string;
  outputRoot: string;
  actorEmail?: string;
}): Promise<{
  rowCount: number;
  sourceHash: string;
  csvPath: string;
  backfillSqlPath: string;
  rollbackSqlPath: string;
}> {
  const input = await readFile(options.inputPath);
  const draft = JSON.parse(input.toString("utf8")) as {
    masterDataLines?: AuthoritativeProductRow[];
  };
  if (!Array.isArray(draft.masterDataLines)) {
    throw new Error("Inbound master-data draft does not contain masterDataLines.");
  }
  const rows = buildProductBarcodeManifest(draft.masterDataLines);
  const sourceHash = createHash("sha256").update(input).digest("hex").toUpperCase();
  const metadata: BackfillMetadata = {
    actorEmail: options.actorEmail ?? DEFAULT_ACTOR_EMAIL,
    sourceFile: basename(options.inputPath),
    sourceHash,
  };
  const csvPath = resolve(options.outputRoot, CSV_OUTPUT);
  const backfillSqlPath = resolve(options.outputRoot, SQL_OUTPUT);
  const rollbackSqlPath = resolve(options.outputRoot, ROLLBACK_OUTPUT);
  await Promise.all([
    mkdir(dirname(csvPath), { recursive: true }),
    mkdir(dirname(backfillSqlPath), { recursive: true }),
  ]);
  const csv = [
    "source_line_number,sku,part_number,barcode",
    ...rows.map((row) => [
      row.sourceLineNumber,
      row.sku,
      row.partNumber,
      row.barcode,
    ].map(csvCell).join(",")),
  ].join("\n");
  await Promise.all([
    writeFile(csvPath, `${csv}\n`, "utf8"),
    writeFile(backfillSqlPath, buildBackfillSql(rows, metadata), "utf8"),
    writeFile(rollbackSqlPath, buildRollbackSql(rows, metadata), "utf8"),
  ]);
  return {
    rowCount: rows.length,
    sourceHash,
    csvPath,
    backfillSqlPath,
    rollbackSqlPath,
  };
}

async function main(): Promise<void> {
  const result = await generateProductBarcodeArtifacts({
    inputPath: resolve(process.cwd(), DEFAULT_INPUT),
    outputRoot: process.cwd(),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
