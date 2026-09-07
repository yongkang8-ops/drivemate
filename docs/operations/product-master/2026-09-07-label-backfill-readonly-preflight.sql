-- Read-only label backfill preflight. No business data writes.
with target as (
 select p.sku, p.barcode, p.oem_part_number, to_jsonb(p)->'label_profile' as profile
 from public.products p
 where p.sku between 'DM-GWM-0001' and 'DM-GWM-0119'
)
select
 count(*) as product_count,
 count(distinct sku) as unique_skus,
 count(distinct barcode) as unique_barcodes,
 count(*) filter(where coalesce(btrim(barcode),'')='') as empty_barcodes,
 md5(string_agg(sku||'|'||coalesce(barcode,'<NULL>')||'|'||coalesce(oem_part_number,'<NULL>'),E'\n' order by sku)) as identity_md5,
 count(*) filter(where profile is not null and profile <> 'null'::jsonb) as populated_label_profiles,
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='label_profile') as label_profile_column_exists,
 (select count(*) from supabase_migrations.schema_migrations where name like '%v23%') as registered_v23,
 (select count(*) from public.products x where x.sku not between 'DM-GWM-0001' and 'DM-GWM-0119' and x.barcode in(select barcode from target)) as outside_barcode_collisions,
 current_timestamp as checked_at
from target;
