/** Local SQL artifacts only. Does not connect to any database or read credentials. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd();
const output=process.argv[2];
if(!output)throw new Error('Local output directory required');
const sourceFile='docs/operations/product-master/2026-09-07-product-label-backfill-draft.json';
const raw=fs.readFileSync(path.join(root,sourceFile));
const sourceHash=crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
if(sourceHash!=='CF8929C1B840E9E0E5497A90C1E7142FE1757F4BAAEC9B2F316F2CFA6DA40CE4')throw new Error('Authorized draft fingerprint differs');
const draft=JSON.parse(raw);
if(draft.projectRef!=='gajrgqiwvgjrrbildwme'||draft.rows.length!==119||draft.rows.reduce((n,r)=>n+r.expectedQuantity,0)!==706)throw new Error('Scope mismatch');
const actor='aa3642ef-4369-4ac9-9d5f-e60fc0e9f66e';
const identity='e3986b5139763f10e53cff3349d4c345';
const migration=fs.readFileSync('supabase/migrations/20260908_v23_product_label_profiles.sql','utf8');
const ddl=migration.slice(migration.indexOf('alter table'),migration.lastIndexOf('commit;')).trim();
const q=s=>"'"+s.replaceAll("'","''")+"'";
const begin="begin;\nset local lock_timeout = '5s';\nset local statement_timeout = '30s';\n";
const target="sku between 'DM-GWM-0001' and 'DM-GWM-0119'";
const actorCheck=`if (select count(*) from public.user_profiles where id='${actor}' and role='admin' and account_status='active')<>1 then raise exception 'Authorized admin actor is not active'; end if;`;
const backup=`-- Authorized snapshot of target products and relevant audit rows, not auth.users.
${begin}
lock table public.products in share mode;
do $guard$ begin
${actorCheck}
if to_regnamespace('dm_pre_v23_backup') is not null then raise exception 'Backup already exists; do not overwrite'; end if;
if exists(select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='label_profile') then raise exception 'Unexpected existing label column'; end if;
if (select count(*) from public.products where ${target})<>119 or
 (select md5(string_agg(sku||'|'||coalesce(barcode,'<NULL>')||'|'||coalesce(oem_part_number,'<NULL>'),E'\\n' order by sku)) from public.products where ${target})<>'${identity}' then raise exception 'Product identity changed'; end if;
end $guard$;
create schema dm_pre_v23_backup;
revoke all on schema dm_pre_v23_backup from public, anon, authenticated, service_role;
create table dm_pre_v23_backup.products as select * from public.products where ${target};
create table dm_pre_v23_backup.audit_events as select a.* from public.audit_events a
where a.entity_type='product' and (a.entity_id in(select id::text from dm_pre_v23_backup.products) or a.entity_id in(select sku from dm_pre_v23_backup.products));
create table dm_pre_v23_backup.column_definitions as select table_schema,table_name,column_name,ordinal_position,column_default,is_nullable,data_type,udt_name
from information_schema.columns where table_schema='public' and table_name in('products','audit_events');
create table dm_pre_v23_backup.constraint_definitions as select conrelid::regclass::text as table_name,conname,pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in('public.products'::regclass,'public.audit_events'::regclass);
create table dm_pre_v23_backup.index_definitions as select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename in('products','audit_events');
create table dm_pre_v23_backup.trigger_definitions as select tgrelid::regclass::text as table_name,tgname,pg_get_triggerdef(oid) as definition,pg_get_functiondef(tgfoid) as function_definition
from pg_trigger where tgrelid in('public.products'::regclass,'public.audit_events'::regclass) and not tgisinternal;
create table dm_pre_v23_backup.policy_definitions as select * from pg_policies where schemaname='public' and tablename in('products','audit_events');
create table dm_pre_v23_backup.migration_registry as select * from supabase_migrations.schema_migrations;
create table dm_pre_v23_backup.manifest as select now() as backed_up_at, '${actor}'::uuid as authorized_by,
 '${sourceHash}'::text as source_sha256, false as had_label_profile,
 (select count(*) from dm_pre_v23_backup.products) as product_count,
 (select count(*) from dm_pre_v23_backup.audit_events) as audit_count,
 (select md5(string_agg(to_jsonb(p)::text,E'\\n' order by p.sku)) from dm_pre_v23_backup.products p) as products_full_md5;
revoke all on all tables in schema dm_pre_v23_backup from public, anon, authenticated, service_role;
do $check$ begin
if (select product_count from dm_pre_v23_backup.manifest)<>119 or exists(select 1 from public.products p join dm_pre_v23_backup.products b using(id) where to_jsonb(p)<>to_jsonb(b)) then raise exception 'Backup verification failed'; end if;
end $check$;
commit;
select 'backup_complete' as result, product_count,audit_count,products_full_md5,backed_up_at from dm_pre_v23_backup.manifest;
`;
const migrationSql=`-- Original approved v23 DDL plus atomic registry entry.
${begin}
do $guard$ begin
if (select product_count from dm_pre_v23_backup.manifest)<>119 then raise exception 'Verified backup required'; end if;
if exists(select 1 from supabase_migrations.schema_migrations where version='20260908' or name='v23_product_label_profiles') then raise exception 'v23 registry already exists'; end if;
if not exists(select 1 from supabase_migrations.schema_migrations where version='20260907' and name='v22_source_carton_group_projection') then raise exception 'Expected v22 predecessor missing'; end if;
end $guard$;
${ddl}
insert into supabase_migrations.schema_migrations(version,name,statements) values('20260908','v23_product_label_profiles',array[${q(ddl)}]);
commit;
select version,name from supabase_migrations.schema_migrations where version='20260908';
`;
const payload=JSON.stringify(draft.rows.map(r=>({sku:r.sku,barcode:r.expectedBarcode,pn:r.expectedOriginalPn,profile:r.labelProfile,source_row:r.sourceRow0902})));
const staging=`create temporary table dm_label_stage(sku text primary key,barcode text not null unique,pn text not null,profile jsonb not null,source_row int) on commit drop;
insert into dm_label_stage select * from jsonb_to_recordset(${q(payload)}::jsonb) as r(sku text,barcode text,pn text,profile jsonb,source_row int);`;
const verifyPayload=`if (select count(*) from dm_label_stage)<>119 then raise exception 'Expected 119 label rows'; end if;
if exists(select 1 from dm_label_stage s left join public.products p on p.sku=s.sku where p.id is null or p.barcode is distinct from s.barcode or p.oem_part_number is distinct from s.pn) then raise exception 'SKU/PN/barcode changed'; end if;
if exists(select 1 from public.products p join dm_label_stage s on p.barcode=s.barcode where p.sku<>s.sku) then raise exception 'External barcode collision'; end if;`;
const backfill=`-- Scoped, atomic 119-row label update with per-product audit. No stock or PN mutations.
${begin}
${staging}
lock table public.products in share row exclusive mode;
do $guard$ begin
${actorCheck}
${verifyPayload}
if (select source_sha256 from dm_pre_v23_backup.manifest)<>'${sourceHash}' then raise exception 'Backup source fingerprint mismatch'; end if;
if (select count(*) from dm_pre_v23_backup.products)<>119 then raise exception 'Backup row count mismatch'; end if;
if exists(select 1 from public.audit_events where idempotency_key like 'label-v23-20260907:%') then raise exception 'Operation already has audit records; inspect, do not rerun'; end if;
if exists(select 1 from public.products p join dm_label_stage s on p.sku=s.sku left join dm_pre_v23_backup.products b on b.id=p.id where b.id is null or p.label_profile is not null or to_jsonb(p)-'label_profile'<>to_jsonb(b)) then raise exception 'Product changed since backup or label already populated'; end if;
end $guard$;
create temporary table dm_label_changed on commit drop as
with changed as (
 update public.products p set label_profile=s.profile, updated_at=now() from dm_label_stage s where p.sku=s.sku and p.barcode=s.barcode and p.oem_part_number=s.pn and p.label_profile is null returning p.id,p.sku,p.label_profile,p.updated_at
) select * from changed;
insert into public.audit_events(entity_type,entity_id,action,actor_id,before_value,after_value,source_file,source_hash,source_row_number,idempotency_key)
select 'product',c.id::text,'product_label_profile_backfilled','${actor}'::uuid,
jsonb_build_object('label_profile',null,'updated_at',b.updated_at),
jsonb_build_object('label_profile',c.label_profile,'updated_at',c.updated_at,'reason','Owner approved final label draft after Chris PN confirmation; identifiers and stock preserved'),
${q(sourceFile)},'${sourceHash}',s.source_row,'label-v23-20260907:'||c.sku
from dm_label_changed c join dm_label_stage s using(sku) join dm_pre_v23_backup.products b using(id);
do $check$ begin
if (select count(*) from dm_label_changed)<>119 then raise exception 'Update count not 119'; end if;
if (select count(*) from public.audit_events where idempotency_key like 'label-v23-20260907:%')<>119 then raise exception 'Audit count not 119'; end if;
if exists(select 1 from public.products p join dm_label_stage s on s.sku=p.sku where p.label_profile is distinct from s.profile) then raise exception 'Profile mismatch'; end if;
if exists(select 1 from public.products p join dm_pre_v23_backup.products b using(id) where to_jsonb(p)-array['label_profile','updated_at']<>to_jsonb(b)-'updated_at') then raise exception 'Unrelated product field changed'; end if;
end $check$;
commit;
select 'backfill_complete' as result,count(*) as profiles_written from public.audit_events where idempotency_key like 'label-v23-20260907:%';
`;
const verify=`-- Read-only independent final verification, no staging tables or write statements.
with planned as(select * from jsonb_to_recordset(${q(payload)}::jsonb) as r(sku text,barcode text,pn text,profile jsonb,source_row int))
select count(*) as planned_rows,
count(p.id) as matched_rows,
count(*) filter(where p.label_profile=s.profile) as exact_profile_matches,
count(*) filter(where p.barcode=s.barcode and p.oem_part_number=s.pn) as unchanged_identities,
count(distinct p.barcode) as unique_barcodes,
count(*) filter(where p.label_profile->'position'->>'status'='specified') as specified_positions,
count(*) filter(where p.label_profile->'position'->>'status'='not_applicable') as omitted_positions,
(select count(*) from public.audit_events where idempotency_key like 'label-v23-20260907:%' and action='product_label_profile_backfilled' and actor_id='${actor}' and source_hash='${sourceHash}') as valid_audit_rows,
(select count(*) from public.products p join dm_pre_v23_backup.products b using(id) where to_jsonb(p)-array['label_profile','updated_at']<>to_jsonb(b)-'updated_at') as unrelated_product_differences,
(select count(*) from dm_pre_v23_backup.audit_events b left join public.audit_events a using(id) where a.id is null or to_jsonb(a)<>to_jsonb(b)) as modified_prior_audit_rows,
(select count(*) from supabase_migrations.schema_migrations where version='20260908' and name='v23_product_label_profiles') as registered_v23,
(select products_full_md5=(select md5(string_agg(to_jsonb(b)::text,E'\\n' order by b.sku)) from dm_pre_v23_backup.products b) from dm_pre_v23_backup.manifest) as backup_hash_intact,
has_schema_privilege('anon','dm_pre_v23_backup','USAGE') as anon_backup_access,
has_schema_privilege('authenticated','dm_pre_v23_backup','USAGE') as authenticated_backup_access,
current_timestamp as checked_at
from planned s left join public.products p using(sku);
`;
fs.mkdirSync(output,{recursive:true});
for(const [file,sql] of Object.entries({'01-backup.sql':backup,'02-migration.sql':migrationSql,'03-backfill.sql':backfill,'04-verify.sql':verify}))fs.writeFileSync(path.join(output,file),sql);
fs.writeFileSync(path.join(output,'artifact-manifest.json'),JSON.stringify({projectRef:draft.projectRef,sourceFile,sourceHash,actorId:actor,migrationVersion:'20260908',migrationName:'v23_product_label_profiles',backupSchema:'dm_pre_v23_backup',sqlFiles:['01-backup.sql','02-migration.sql','03-backfill.sql','04-verify.sql'].map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(output,file))).digest('hex')}))},null,2));
console.log('Generated four local SQL artifacts; no database connection made.');
