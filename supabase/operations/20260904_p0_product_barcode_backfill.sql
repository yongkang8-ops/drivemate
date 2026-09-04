-- DriveMate P0 product barcode master backfill.
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
  (46, 'DM-GWM-0001', '1117100XKW09A', 'DMPGWM0001'),
  (67, 'DM-GWM-0002', '8104400XKZ96A', 'DMPGWM0002'),
  (47, 'DM-GWM-0003', '1111402XED96', 'DMPGWM0003'),
  (48, 'DM-GWM-0004', '1017110XEN01', 'DMPGWM0004'),
  (68, 'DM-GWM-0005', '1109103XKM01A', 'DMPGWM0005'),
  (5, 'DM-GWM-0006', '3701200XED61', 'DMPGWM0006'),
  (6, 'DM-GWM-0007', '1025100XEC06', 'DMPGWM0007'),
  (54, 'DM-GWM-0008', '3701011XEG71', 'DMPGWM0008'),
  (49, 'DM-GWM-0009', '1017100EG01', 'DMPGWM0009'),
  (69, 'DM-GWM-0010', '1109104XGW02A', 'DMPGWM0010'),
  (55, 'DM-GWM-0011', '3701011XED95', 'DMPGWM0011'),
  (70, 'DM-GWM-0012', '8104300XKR02A', 'DMPGWM0012'),
  (71, 'DM-GWM-0013', '8100422XNZ01A', 'DMPGWM0013'),
  (56, 'DM-GWM-0014', '1025011XEN01', 'DMPGWM0014'),
  (91, 'DM-GWM-0015', '1025200XEB55', 'DMPGWM0015'),
  (74, 'DM-GWM-0016', '1017100XEB02', 'DMPGWM0016'),
  (92, 'DM-GWM-0017', '1025011XEB55', 'DMPGWM0017'),
  (72, 'DM-GWM-0018', '1109101AGW01A', 'DMPGWM0018'),
  (57, 'DM-GWM-0019', '1021013XED61', 'DMPGWM0019'),
  (58, 'DM-GWM-0020', '1021801XED10', 'DMPGWM0020'),
  (50, 'DM-GWM-0021', '1017100-EG01', 'DMPGWM0021'),
  (89, 'DM-GWM-0022', '1109107XGW02A', 'DMPGWM0022'),
  (90, 'DM-GWM-0023', '1109132XGW01A', 'DMPGWM0023'),
  (59, 'DM-GWM-0024', '1025014XEDA8', 'DMPGWM0024'),
  (60, 'DM-GWM-0025', '1025011XEC06', 'DMPGWM0025'),
  (93, 'DM-GWM-0026', '1025100XEDA8', 'DMPGWM0026'),
  (51, 'DM-GWM-0027', '1017100XEC01', 'DMPGWM0027'),
  (52, 'DM-GWM-0028', '1017110XED95', 'DMPGWM0028'),
  (53, 'DM-GWM-0029', '1017100XED95', 'DMPGWM0029'),
  (94, 'DM-GWM-0030', '1109110XP6EXA', 'DMPGWM0030'),
  (95, 'DM-GWM-0031', '1109110XPE6EXA', 'DMPGWM0031'),
  (73, 'DM-GWM-0032', '8104430XKV3AA', 'DMPGWM0032'),
  (112, 'DM-GWM-0033', '3502108XPW01A', 'DMPGWM0033'),
  (113, 'DM-GWM-0034', '3501104XPW01A', 'DMPGWM0034'),
  (114, 'DM-GWM-0035', '3502102XGW02A', 'DMPGWM0035'),
  (115, 'DM-GWM-0036', '3501112XGW01A', 'DMPGWM0036'),
  (116, 'DM-GWM-0037', '3501107XGW02A', 'DMPGWM0037'),
  (117, 'DM-GWM-0038', '3502105XGW01A', 'DMPGWM0038'),
  (118, 'DM-GWM-0039', '3501100XGW02A', 'DMPGWM0039'),
  (119, 'DM-GWM-0040', '3501302XGW04A', 'DMPGWM0040'),
  (75, 'DM-GWM-0041', '151100002', 'DMPGWM0041'),
  (25, 'DM-GWM-0042', '1001115AGW01A', 'DMPGWM0042'),
  (34, 'DM-GWM-0043', '1001116AGW01A', 'DMPGWM0043'),
  (15, 'DM-GWM-0044', 'ZF1500101', 'DMPGWM0044'),
  (35, 'DM-GWM-0045', '1001100XGW02A', 'DMPGWM0045'),
  (96, 'DM-GWM-0046', '151100057', 'DMPGWM0046'),
  (36, 'DM-GWM-0047', '1001103XGW02A', 'DMPGWM0047'),
  (76, 'DM-GWM-0048', '151100008', 'DMPGWM0048'),
  (37, 'DM-GWM-0049', '2905127XGW01A', 'DMPGWM0049'),
  (38, 'DM-GWM-0050', '2905137XGW01A', 'DMPGWM0050'),
  (39, 'DM-GWM-0051', '2905108XPW01A', 'DMPGWM0051'),
  (82, 'DM-GWM-0052', '2905121XPW01A', 'DMPGWM0052'),
  (83, 'DM-GWM-0053', '2905120XPW01A', 'DMPGWM0053'),
  (40, 'DM-GWM-0054', '2905377XGW02A', 'DMPGWM0054'),
  (7, 'DM-GWM-0055', 'AQAC000357', 'DMPGWM0055'),
  (8, 'DM-GWM-0056', '3401102XGW02A', 'DMPGWM0056'),
  (9, 'DM-GWM-0057', '3401103XGW02A', 'DMPGWM0057'),
  (10, 'DM-GWM-0058', '2906102XGW02A', 'DMPGWM0058'),
  (26, 'DM-GWM-0059', '2905101XPW01B', 'DMPGWM0059'),
  (77, 'DM-GWM-0060', '2905102XGW01A', 'DMPGWM0060'),
  (78, 'DM-GWM-0061', '2905103XGW01A', 'DMPGWM0061'),
  (79, 'DM-GWM-0062', '2905401XGW02A', 'DMPGWM0062'),
  (80, 'DM-GWM-0063', '2905402XGW02A', 'DMPGWM0063'),
  (18, 'DM-GWM-0064', '2904103XGW01A', 'DMPGWM0064'),
  (19, 'DM-GWM-0065', '2904104XGW01A', 'DMPGWM0065'),
  (17, 'DM-GWM-0066', '2904100XGW02A', 'DMPGWM0066'),
  (16, 'DM-GWM-0067', '2904101XGW02A', 'DMPGWM0067'),
  (110, 'DM-GWM-0068', '2915102XGW01A', 'DMPGWM0068'),
  (111, 'DM-GWM-0069', '2915103XGW04A', 'DMPGWM0069'),
  (65, 'DM-GWM-0070', '2904101XPW01A', 'DMPGWM0070'),
  (11, 'DM-GWM-0071', '3401108XGW01A', 'DMPGWM0071'),
  (12, 'DM-GWM-0072', '2906101XGW01A', 'DMPGWM0072'),
  (27, 'DM-GWM-0073', '2905136XGW01A', 'DMPGWM0073'),
  (13, 'DM-GWM-0074', '3401101XPW01A', 'DMPGWM0074'),
  (28, 'DM-GWM-0075', '2905117XPW01A', 'DMPGWM0075'),
  (29, 'DM-GWM-0076', '2905108XKM01A', 'DMPGWM0076'),
  (84, 'DM-GWM-0077', '2905104XGW02A', 'DMPGWM0077'),
  (85, 'DM-GWM-0078', '2905105XGW02A', 'DMPGWM0078'),
  (64, 'DM-GWM-0079', '2904103XKV1BA', 'DMPGWM0079'),
  (63, 'DM-GWM-0080', '2904104XKV1BA', 'DMPGWM0080'),
  (62, 'DM-GWM-0081', '2904103XPW01A', 'DMPGWM0081'),
  (61, 'DM-GWM-0082', '2904104XPW01A', 'DMPGWM0082'),
  (86, 'DM-GWM-0083', '2905100XPW04A', 'DMPGWM0083'),
  (81, 'DM-GWM-0084', '2905101XPW04A', 'DMPGWM0084'),
  (87, 'DM-GWM-0085', '2905550XGW04A', 'DMPGWM0085'),
  (88, 'DM-GWM-0086', '2905553XGW04A', 'DMPGWM0086'),
  (30, 'DM-GWM-0087', '1001119XGW04A', 'DMPGWM0087'),
  (20, 'DM-GWM-0088', '1001120XGW04A', 'DMPGWM0088'),
  (21, 'DM-GWM-0089', '1001100XKM01A', 'DMPGWM0089'),
  (22, 'DM-GWM-0090', '1001101XKM01A', 'DMPGWM0090'),
  (23, 'DM-GWM-0091', '1001123XGW04A', 'DMPGWM0091'),
  (24, 'DM-GWM-0092', '1001122XGW04A', 'DMPGWM0092'),
  (66, 'DM-GWM-0093', '2904102XPW01A', 'DMPGWM0093'),
  (108, 'DM-GWM-0094', '2915101XGW02A', 'DMPGWM0094'),
  (105, 'DM-GWM-0095', '2915370XGW02A', 'DMPGWM0095'),
  (106, 'DM-GWM-0096', '2915105XGW02A', 'DMPGWM0096'),
  (43, 'DM-GWM-0097', '2904201XKV1BB', 'DMPGWM0097'),
  (44, 'DM-GWM-0098', '2904202XKV1BA', 'DMPGWM0098'),
  (109, 'DM-GWM-0099', '2915507XGW04A', 'DMPGWM0099'),
  (104, 'DM-GWM-0100', '2915100XPW04A', 'DMPGWM0100'),
  (107, 'DM-GWM-0101', '2915101XPW01A', 'DMPGWM0101'),
  (14, 'DM-GWM-0102', '3401101XKV3AA', 'DMPGWM0102'),
  (31, 'DM-GWM-0103', '2905302XGW04A', 'DMPGWM0103'),
  (32, 'DM-GWM-0104', '2904500XKV08A', 'DMPGWM0104'),
  (33, 'DM-GWM-0105', '2905107XPW01A', 'DMPGWM0105'),
  (1, 'DM-GWM-0106', '2803106XKN01A', 'DMPGWM0106'),
  (2, 'DM-GWM-0107', '2803107XKN01A', 'DMPGWM0107'),
  (3, 'DM-GWM-0108', '2803101XST01A', 'DMPGWM0108'),
  (4, 'DM-GWM-0109', '2803102XST01A', 'DMPGWM0109'),
  (45, 'DM-GWM-0110', '1001117AGW01A', 'DMPGWM0110'),
  (101, 'DM-GWM-0111', '1306100-ED01', 'DMPGWM0111'),
  (97, 'DM-GWM-0112', '3103100XPW01A', 'DMPGWM0112'),
  (41, 'DM-GWM-0113', '1307100XED95', 'DMPGWM0113'),
  (98, 'DM-GWM-0114', '3103100XGW02A', 'DMPGWM0114'),
  (42, 'DM-GWM-0115', '1307100-EG01B', 'DMPGWM0115'),
  (102, 'DM-GWM-0116', '1306100-EG01', 'DMPGWM0116'),
  (99, 'DM-GWM-0117', '3103100XGW01A', 'DMPGWM0117'),
  (100, 'DM-GWM-0118', '3103100XGW04A', 'DMPGWM0118'),
  (103, 'DM-GWM-0119', '1307100XEC71', 'DMPGWM0119');

lock table public.products in share row exclusive mode;

do $$
declare
  v_actor_count integer;
begin
  if (select count(*) from dm_product_barcode_backfill) <> 119 then
    raise exception 'Expected exactly 119 staged product barcodes';
  end if;

  select count(*) into v_actor_count
  from auth.users as auth_user
  join public.user_profiles as profile on profile.id = auth_user.id
  where lower(auth_user.email) = 'lee@drivemateparts.com.au'
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
      where regexp_replace(upper(trim(product.sku)), '\s+', ' ', 'g') = staged.sku
    ) <> 1
  ) then
    raise exception 'Production SKU matching is incomplete or ambiguous';
  end if;

  if exists (
    select 1
    from dm_product_barcode_backfill as staged
    join public.products as product
      on regexp_replace(upper(trim(product.sku)), '\s+', ' ', 'g') = staged.sku
    where nullif(trim(product.barcode), '') is not null
      and regexp_replace(upper(trim(product.barcode)), '\s+', ' ', 'g') <> staged.barcode
  ) then
    raise exception 'Existing product barcode would be overwritten';
  end if;

  if exists (
    select 1
    from dm_product_barcode_backfill as staged
    join public.products as product
      on regexp_replace(upper(trim(product.barcode)), '\s+', ' ', 'g') = staged.barcode
    where regexp_replace(upper(trim(product.sku)), '\s+', ' ', 'g') <> staged.sku
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
  on regexp_replace(upper(trim(product.sku)), '\s+', ' ', 'g') = staged.sku;

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
    where lower(auth_user.email) = 'lee@drivemateparts.com.au'
      and profile.role = 'admin'
      and profile.account_status = 'active'
    limit 1
  ),
  jsonb_build_object('barcode', target.old_barcode),
  jsonb_build_object('barcode', target.barcode, 'scheme', 'DriveMate internal Code 128'),
  '2026-09-03-gwm-706-unit-inbound-master-data-v3.json',
  '88BE3FEBC029BD4B575504BBEC691EE84A198FEFF52D1181390D2B2B93E255F0',
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
      on regexp_replace(upper(trim(product.sku)), '\s+', ' ', 'g') = staged.sku
    where regexp_replace(upper(trim(product.barcode)), '\s+', ' ', 'g') <> staged.barcode
  ) then
    raise exception 'Product barcode backfill post-check failed';
  end if;
end;
$$;

commit;
