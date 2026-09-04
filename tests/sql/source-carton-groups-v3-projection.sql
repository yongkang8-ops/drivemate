-- Run only in a disposable local database. All fixture records are rolled back.
begin;
create function public.dm_local_qa_force_member_failure()
returns trigger language plpgsql as $$
begin
  if regexp_replace(upper(trim(new.member_identifier)),'\s+',' ','g')='FORCE-ROLLBACK' then
    raise exception 'LOCAL QA forced late projection failure';
  end if;
  return new;
end;
$$;
create trigger dm_local_qa_force_member_failure
before insert on public.shipment_carton_members
for each row execute function public.dm_local_qa_force_member_failure();

do $$
declare
  actor uuid:=gen_random_uuid();
  supplier uuid; import_run uuid; po uuid; product_a uuid; product_b uuid;
  shipment_v3 uuid; shipment_v3_open uuid; shipment_v3_pallet uuid; shipment_invalid uuid; shipment_v2 uuid; shipment_v1 uuid;
  revision_v3 uuid; revision_v3_open uuid; revision_v3_pallet uuid; revision_v2 uuid; revision_v1 uuid; invalid_revision uuid;
  payload_v3 jsonb; before_movements bigint; rejected boolean:=false; group_parent_rejected boolean:=false;
  late_failure_rejected boolean:=false;
  invalid_case record; invalid_payload jsonb;
begin
  insert into auth.users(id) values(actor);
  insert into public.suppliers(legal_name) values('LOCAL QA generic supplier '||gen_random_uuid()) returning id into supplier;
  insert into public.data_import_runs(import_type,source_file_name,source_sha256)
    values('qa','LOCAL QA generic source','local-v22-'||gen_random_uuid()) returning id into import_run;
  insert into public.purchase_orders(contract_number,supplier_id,subtotal_minor,final_total_minor,source_import_run_id)
    values('LOCAL-V22-'||gen_random_uuid(),supplier,0,0,import_run) returning id into po;
  insert into public.products(sku,brand,part_name,category,barcode)
    values('LOCAL-V22-A','QA','Generic source item A','QA','LOCALV22A') returning id into product_a;
  insert into public.products(sku,brand,part_name,category,barcode)
    values('LOCAL-V22-B','QA','Generic source item B','QA','LOCALV22B') returning id into product_b;
  insert into public.purchase_order_lines(
    purchase_order_id,product_id,source_row_number,supplier_part_number,quantity,unit,
    unit_price_incl_vat_minor,original_amount_minor,allocated_discount_minor,cash_purchase_cost_minor
  ) values
    (po,product_a,1,'LOCAL-V22-A',14,'each',0,0,0,0),
    (po,product_b,2,'LOCAL-V22-B',10,'each',0,0,0,0);
  insert into public.shipments(purchase_order_id,shipment_reference)
    values(po,'LOCAL-V22-V3-'||gen_random_uuid()) returning id into shipment_v3;
  insert into public.shipments(purchase_order_id,shipment_reference)
    values(po,'LOCAL-V22-V3-OPEN-'||gen_random_uuid()) returning id into shipment_v3_open;
  insert into public.shipments(purchase_order_id,shipment_reference)
    values(po,'LOCAL-V22-V3-PALLET-'||gen_random_uuid()) returning id into shipment_v3_pallet;
  insert into public.shipments(purchase_order_id,shipment_reference)
    values(po,'LOCAL-V22-V2-'||gen_random_uuid()) returning id into shipment_v2;
  insert into public.shipments(purchase_order_id,shipment_reference)
    values(po,'LOCAL-V22-V1-'||gen_random_uuid()) returning id into shipment_v1;

  payload_v3:=jsonb_build_object(
    'schemaVersion',3,
    'shipmentId',shipment_v3,
    'physicalPalletCount',4,
    'cartons',jsonb_build_array(
      jsonb_build_object(
        'sourceCartonNumber','SINGLE-ALPHA','kind','carton','physicalCartonCount',1,
        'memberCartonNumbers',jsonb_build_array('SINGLE-ALPHA'),'sourcePalletNumber',null,
        'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-V22-A','expectedQuantity',4))
      ),
      jsonb_build_object(
        'sourceCartonNumber','BATCH-A','kind','carton_group','physicalCartonCount',3,
        'memberCartonNumbers',jsonb_build_array('CASE-ALPHA','CASE-BETA','CASE-GAMMA'),
        'sourcePalletNumber','PALLET-GENERIC-A',
        'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-V22-A','expectedQuantity',10))
      ),
      jsonb_build_object(
        'sourceCartonNumber','ZONE-02','kind','carton_group','physicalCartonCount',2,
        'memberCartonNumbers',jsonb_build_array('UNIT-RED','UNIT-BLUE'),'sourcePalletNumber',null,
        'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-V22-B','expectedQuantity',10))
      )
    )
  );
  select count(*) into before_movements from public.stock_movements;
  insert into public.shipment_packing_list_versions(
    shipment_id,version,status,payload_snapshot,created_by
  ) values(shipment_v3,1,'draft',payload_v3,actor) returning id into revision_v3;
  perform public.dm_confirm_packing_list_revision(revision_v3,actor);

  if (select count(*) from public.shipment_cartons where shipment_id=shipment_v3)<>3 then
    raise exception 'Expected 3 stable source scopes';
  end if;
  if (select sum(carton_count) from public.shipment_cartons where shipment_id=shipment_v3)<>6 then
    raise exception 'Expected 6 physical cartons';
  end if;
  if (select count(*) from public.shipment_cartons where shipment_id=shipment_v3 and scope_kind='carton_group')<>2 then
    raise exception 'Expected 2 carton groups';
  end if;
  if (select count(*) from public.shipment_carton_members where shipment_id=shipment_v3)<>6 then
    raise exception 'Expected 6 normalized member identifiers';
  end if;
  if (select sum(line.quantity) from public.shipment_carton_lines line
      join public.shipment_cartons carton on carton.id=line.carton_id
      where carton.shipment_id=shipment_v3)<>24 then
    raise exception 'Expected exactly 24 product units without physical-carton multiplication';
  end if;
  if (select physical_pallet_count from public.shipments where id=shipment_v3)<>4 then
    raise exception 'Expected 4 physical pallets';
  end if;
  if (select count(*) from public.shipment_pallets where shipment_id=shipment_v3)<>1 then
    raise exception 'Expected one optional recorded pallet mapping';
  end if;
  if (select count(*) from public.stock_movements)<>before_movements then
    raise exception 'Packing projection changed stock movements';
  end if;

  insert into public.shipment_packing_list_versions(shipment_id,version,status,payload_snapshot,created_by)
  values(shipment_v3_open,1,'draft',jsonb_build_object(
    'schemaVersion',3,'shipmentId',shipment_v3_open,'physicalPalletCount',null,
    'cartons',jsonb_build_array(jsonb_build_object(
      'sourceCartonNumber','OPEN-SCOPE','kind','carton','physicalCartonCount',1,
      'memberCartonNumbers',jsonb_build_array('OPEN-SCOPE'),'sourcePalletNumber','KNOWN-PALLET',
      'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-V22-A','expectedQuantity',1))
    ))
  ),actor) returning id into revision_v3_open;
  perform public.dm_confirm_packing_list_revision(revision_v3_open,actor);
  if (select physical_pallet_count from public.shipments where id=shipment_v3_open) is not null
    or (select count(*) from public.shipment_pallets where shipment_id=shipment_v3_open)<>1 then
    raise exception 'Optional physical pallet total incorrectly blocked a known pallet mapping';
  end if;

  insert into public.shipment_packing_list_versions(shipment_id,version,status,payload_snapshot,created_by)
  values(shipment_v3_pallet,1,'draft',jsonb_build_object(
    'schemaVersion',3,'shipmentId',shipment_v3_pallet,'physicalPalletCount',1,
    'cartons',jsonb_build_array(
      jsonb_build_object(
        'sourceCartonNumber','PALLET-SCOPE-A','kind','carton','physicalCartonCount',1,
        'memberCartonNumbers',jsonb_build_array('PALLET-SCOPE-A'),'sourcePalletNumber',' Pallet  A ',
        'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-V22-A','expectedQuantity',1))
      ),
      jsonb_build_object(
        'sourceCartonNumber','PALLET-SCOPE-B','kind','carton','physicalCartonCount',1,
        'memberCartonNumbers',jsonb_build_array('PALLET-SCOPE-B'),'sourcePalletNumber','pallet   a',
        'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-V22-B','expectedQuantity',1))
      )
    )
  ),actor) returning id into revision_v3_pallet;
  perform public.dm_confirm_packing_list_revision(revision_v3_pallet,actor);
  if (select count(*) from public.shipment_pallets where shipment_id=shipment_v3_pallet)<>1
    or (select count(distinct pallet_id) from public.shipment_cartons where shipment_id=shipment_v3_pallet)<>1 then
    raise exception 'Equivalent pallet identifiers did not project to one canonical pallet';
  end if;

  for invalid_case in
    select value from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('name','shipment_mismatch','payload',jsonb_build_object(
        'schemaVersion',3,'shipmentId',gen_random_uuid(),'cartons',jsonb_build_array(jsonb_build_object(
          'sourceCartonNumber','INVALID-SCOPE','kind','carton','physicalCartonCount',1,
          'memberCartonNumbers',jsonb_build_array('INVALID-SCOPE'),
          'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-V22-A','expectedQuantity',1)))))),
      jsonb_build_object('name','missing_kind','payload',jsonb_build_object(
        'schemaVersion',3,'cartons',jsonb_build_array(jsonb_build_object(
          'sourceCartonNumber','INVALID-SCOPE','physicalCartonCount',1,
          'memberCartonNumbers',jsonb_build_array('INVALID-SCOPE'),
          'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-V22-A','expectedQuantity',1)))))),
      jsonb_build_object('name','missing_physical_count','payload',jsonb_build_object(
        'schemaVersion',3,'cartons',jsonb_build_array(jsonb_build_object(
          'sourceCartonNumber','INVALID-SCOPE','kind','carton',
          'memberCartonNumbers',jsonb_build_array('INVALID-SCOPE'),
          'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-V22-A','expectedQuantity',1)))))),
      jsonb_build_object('name','non_string_member','payload',jsonb_build_object(
        'schemaVersion',3,'cartons',jsonb_build_array(jsonb_build_object(
          'sourceCartonNumber','INVALID-SCOPE','kind','carton','physicalCartonCount',1,
          'memberCartonNumbers',jsonb_build_array(123),
          'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-V22-A','expectedQuantity',1))))))
    ))
  loop
    insert into public.shipments(purchase_order_id,shipment_reference)
      values(po,'LOCAL-V22-INVALID-'||(invalid_case.value->>'name')||'-'||gen_random_uuid())
      returning id into shipment_invalid;
    invalid_payload:=invalid_case.value->'payload';
    if invalid_case.value->>'name'<>'shipment_mismatch' then
      invalid_payload:=jsonb_set(invalid_payload,'{shipmentId}',to_jsonb(shipment_invalid));
    end if;
    insert into public.shipment_packing_list_versions(shipment_id,version,status,payload_snapshot,created_by)
      values(shipment_invalid,1,'draft',invalid_payload,actor) returning id into invalid_revision;
    rejected:=false;
    begin
      perform public.dm_confirm_packing_list_revision(invalid_revision,actor);
    exception when others then rejected:=true;
    end;
    if not rejected then
      raise exception 'Invalid explicit v3 contract was accepted: %',invalid_case.value->>'name';
    end if;
  end loop;

  insert into public.shipment_packing_list_versions(
    shipment_id,version,status,payload_snapshot,created_by
  ) values(
    shipment_v3,2,'draft',
    jsonb_set(payload_v3,'{cartons,2,memberCartonNumbers}',jsonb_build_array('CASE-BETA','UNIT-BLUE')),
    actor
  ) returning id into invalid_revision;
  begin
    perform public.dm_confirm_packing_list_revision(invalid_revision,actor);
  exception when others then
    if sqlerrm not like '%belongs to more than one source scope%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'Duplicate cross-scope member was accepted'; end if;
  if (select status from public.shipment_packing_list_versions where id=revision_v3)<>'confirmed'
    or (select status from public.shipment_packing_list_versions where id=invalid_revision)<>'draft' then
    raise exception 'Rejected v3 revision changed confirmation state';
  end if;
  if (select count(*) from public.shipment_carton_members where shipment_id=shipment_v3)<>6 then
    raise exception 'Rejected v3 revision changed the existing projection';
  end if;
  insert into public.shipment_packing_list_versions(
    shipment_id,version,status,payload_snapshot,created_by
  ) values(
    shipment_v3,3,'draft',
    jsonb_set(payload_v3,'{cartons,1,memberCartonNumbers}',jsonb_build_array('BATCH-A','CASE-BETA','CASE-GAMMA')),
    actor
  ) returning id into invalid_revision;
  begin
    perform public.dm_confirm_packing_list_revision(invalid_revision,actor);
  exception when others then
    if sqlerrm not like '%cannot also be a source scope%' then raise; end if;
    group_parent_rejected:=true;
  end;
  if not group_parent_rejected then raise exception 'Group parent was accepted as its own physical member'; end if;
  insert into public.shipment_packing_list_versions(
    shipment_id,version,status,payload_snapshot,created_by
  ) values(
    shipment_v3,4,'draft',
    jsonb_set(
      jsonb_set(payload_v3,'{cartons,0,sourceCartonNumber}','"FORCE-ROLLBACK"'),
      '{cartons,0,memberCartonNumbers}',jsonb_build_array('FORCE-ROLLBACK')
    ),
    actor
  ) returning id into invalid_revision;
  begin
    perform public.dm_confirm_packing_list_revision(invalid_revision,actor);
  exception when others then
    if sqlerrm not like '%forced late projection failure%' then raise; end if;
    late_failure_rejected:=true;
  end;
  if not late_failure_rejected then raise exception 'Late projection failure was not triggered'; end if;
  if (select status from public.shipment_packing_list_versions where id=revision_v3)<>'confirmed'
    or (select status from public.shipment_packing_list_versions where id=invalid_revision)<>'draft'
    or (select count(*) from public.shipment_carton_members where shipment_id=shipment_v3)<>6 then
    raise exception 'Late projection failure did not fully restore prior confirmation and projection';
  end if;

  insert into public.shipment_packing_list_versions(shipment_id,version,status,payload_snapshot,created_by)
  values(shipment_v2,1,'draft',jsonb_build_object(
    'schemaVersion',2,'shipmentId',shipment_v2,'cartons',jsonb_build_array(jsonb_build_object(
      'sourceCartonNumber','LEGACY-V2','sourcePalletNumber',null,
      'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-V22-A','expectedQuantity',2))
    ))
  ),actor) returning id into revision_v2;
  perform public.dm_confirm_packing_list_revision(revision_v2,actor);
  if (select count(*) from public.shipment_cartons where shipment_id=shipment_v2 and scope_kind='carton')<>1 then
    raise exception 'Schema v2 delegation failed';
  end if;

  insert into public.shipment_packing_list_versions(shipment_id,version,status,payload_snapshot,created_by)
  values(shipment_v1,1,'draft',jsonb_build_object(
    'shipmentId',shipment_v1,'pallets',jsonb_build_array(jsonb_build_object(
      'sourcePalletNumber','LEGACY-PALLET','cartons',jsonb_build_array(jsonb_build_object(
        'sourceCartonNumber','LEGACY-V1','lines',jsonb_build_array(jsonb_build_object(
          'sku','LOCAL-V22-B','expectedQuantity',1
        ))
      ))
    ))
  ),actor) returning id into revision_v1;
  perform public.dm_confirm_packing_list_revision(revision_v1,actor);
  if (select count(*) from public.shipment_cartons where shipment_id=shipment_v1 and scope_kind='carton')<>1 then
    raise exception 'Schema v1 delegation failed';
  end if;

  raise notice 'PASS: generic v3 scope/member projection, optional pallet mapping, rollback safety, stock isolation and v1/v2 compatibility';
end;
$$;
rollback;
