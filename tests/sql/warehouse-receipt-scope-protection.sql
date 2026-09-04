-- Run only in a disposable local database. All test records are rolled back.
begin;
do $$
declare
  supplier uuid; import_run uuid; po uuid; shipment uuid; shipment_v2 uuid; shipment_v1 uuid; product uuid;
  first_session uuid; second_session uuid; other_session uuid;
  scope jsonb; full_scope jsonb; other_scope jsonb; lines jsonb; received integer;
  rejected boolean; payload jsonb; actor uuid := gen_random_uuid(); preserved_revision uuid; changed_revision uuid;
  pending_job uuid; stale_revision uuid;
begin
  insert into auth.users(id) values(actor);
  insert into public.suppliers(legal_name) values('LOCAL QA supplier '||gen_random_uuid()::text) returning id into supplier;
  insert into public.data_import_runs(import_type,source_file_name,source_sha256)
    values('qa','LOCAL QA','local-qa-'||gen_random_uuid()::text) returning id into import_run;
  insert into public.purchase_orders(contract_number,supplier_id,subtotal_minor,final_total_minor,source_import_run_id)
    values('LOCAL-QA-'||gen_random_uuid()::text,supplier,0,0,import_run) returning id into po;
  insert into public.shipments(purchase_order_id,shipment_reference)
    values(po,'LOCAL-QA-'||gen_random_uuid()::text) returning id into shipment;
  insert into public.shipments(purchase_order_id,shipment_reference)
    values(po,'LOCAL-QA-V2-'||gen_random_uuid()::text) returning id into shipment_v2;
  insert into public.shipments(purchase_order_id,shipment_reference)
    values(po,'LOCAL-QA-V1-'||gen_random_uuid()::text) returning id into shipment_v1;
  insert into public.products(sku,brand,part_name,category,barcode)
    values('LOCAL-QA-OVERLAP','QA','Disposable overlap fixture','QA','LOCALQAOVERLAP') returning id into product;
  insert into public.purchase_order_lines(
    purchase_order_id,product_id,source_row_number,supplier_part_number,quantity,unit,
    unit_price_incl_vat_minor,original_amount_minor,allocated_discount_minor,cash_purchase_cost_minor
  ) values(po,product,1,'LOCAL-QA-OVERLAP',20,'each',0,0,0,0);
  payload := jsonb_build_object('schemaVersion',3,'shipmentId',shipment,'cartons',jsonb_build_array(
    jsonb_build_object('sourceCartonNumber','7#8#9#','kind','carton_group','physicalCartonCount',3,'memberCartonNumbers',jsonb_build_array('7#','8#','9#'),'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-QA-OVERLAP','expectedQuantity',10))),
    jsonb_build_object('sourceCartonNumber','10#11#','kind','carton_group','physicalCartonCount',2,'memberCartonNumbers',jsonb_build_array('10#','11#'),'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-QA-OVERLAP','expectedQuantity',10)))
  ));
  insert into public.shipment_packing_list_versions(shipment_id,version,status,payload_snapshot,confirmed_at,confirmed_by)
    values(shipment,1,'confirmed',payload,now(),actor);
  insert into public.shipment_packing_list_versions(shipment_id,version,status,payload_snapshot,confirmed_at,confirmed_by)
    values(shipment_v2,1,'confirmed',jsonb_build_object('schemaVersion',2,'shipmentId',shipment_v2,'cartons',jsonb_build_array(
      jsonb_build_object('sourceCartonNumber','V2-C1','lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-QA-OVERLAP','expectedQuantity',1))))),now(),actor);
  insert into public.shipment_packing_list_versions(shipment_id,version,status,payload_snapshot,confirmed_at,confirmed_by)
    values(shipment_v1,1,'confirmed',jsonb_build_object('shipmentId',shipment_v1,'pallets',jsonb_build_array(
      jsonb_build_object('sourcePalletNumber','P1','cartons',jsonb_build_array(jsonb_build_object('sourceCartonNumber','V1-C1','lines',jsonb_build_array(
        jsonb_build_object('sku','LOCAL-QA-OVERLAP','expectedQuantity',1))))))),now(),actor);
  perform public.dm_assert_warehouse_receipt_scope(shipment_v2,jsonb_build_object('shipmentId',shipment_v2,'cartonNumbers',jsonb_build_array('V2-C1'),
    'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-QA-OVERLAP','expectedQuantity',1,'productBarcode','LOCALQAOVERLAP'))));
  perform public.dm_assert_warehouse_receipt_scope(shipment_v1,jsonb_build_object('shipmentId',shipment_v1,'cartonNumbers',jsonb_build_array('V1-C1'),
    'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-QA-OVERLAP','expectedQuantity',1,'productBarcode','LOCALQAOVERLAP'))));
  pending_job:=public.dm_create_warehouse_label_print_job_with_items(
    'unit_product',jsonb_build_object('shipmentId',shipment_v2,'cartonNumbers',jsonb_build_array('V2-C1'),
      'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-QA-OVERLAP','expectedQuantity',1,'productBarcode','LOCALQAOVERLAP'))),
    1,jsonb_build_array(jsonb_build_object('sku','LOCAL-QA-OVERLAP')),actor
  );
  insert into public.shipment_packing_list_versions(shipment_id,version,status,payload_snapshot)
    values(shipment_v2,2,'draft',jsonb_build_object('schemaVersion',2,'shipmentId',shipment_v2,'cartons',jsonb_build_array(
      jsonb_build_object('sourceCartonNumber','V2-C2','lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-QA-OVERLAP','expectedQuantity',1))))))
    returning id into stale_revision;
  perform public.dm_confirm_packing_list_revision(stale_revision,actor);
  rejected:=false;
  begin perform public.dm_record_warehouse_label_print_outcome(pending_job,'printed');
  exception when others then
    if sqlerrm not like '%source scope%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'Stale pending label job was marked printed'; end if;
  if (select status from public.warehouse_label_print_jobs where id=pending_job)<>'pending' then
    raise exception 'Rejected stale label job did not remain pending'; end if;
  scope:=jsonb_build_object('shipmentId',shipment,'cartonNumbers',jsonb_build_array('7#8#9#'),
    'lines',jsonb_build_array(jsonb_build_object('sku','LOCAL-QA-OVERLAP','expectedQuantity',10,'productBarcode','LOCALQAOVERLAP')));
  lines:=jsonb_build_array(jsonb_build_object('sku','LOCAL-QA-OVERLAP','expectedQuantity',10,'actualQuantity',10,'productBarcode','LOCALQAOVERLAP'));
  full_scope:=jsonb_set(jsonb_set(scope,'{cartonNumbers}',jsonb_build_array('7#8#9#','10#11#')),'{lines,0,expectedQuantity}','20');
  other_scope:=jsonb_set(scope,'{cartonNumbers}',jsonb_build_array('10#11#'));
  insert into public.warehouse_label_print_jobs(template_id,payload_snapshot,requested_quantity,status,printed_at)
    values('unit_product',scope,10,'printed',now()),('unit_product',full_scope,20,'printed',now()),('unit_product',other_scope,10,'printed',now());
  first_session:=public.dm_create_warehouse_receipt_session(shipment,scope,'counted_quantity',lines,'LOCAL-QA-KEY-1');
  second_session:=public.dm_create_warehouse_receipt_session(shipment,full_scope,'counted_quantity',jsonb_set(jsonb_set(lines,'{0,expectedQuantity}','20'),'{0,actualQuantity}','20'),'LOCAL-QA-KEY-2');
  perform public.dm_confirm_warehouse_receipt_session(first_session);
  insert into public.shipment_packing_list_versions(shipment_id,version,status,payload_snapshot)
    values(shipment,2,'draft',jsonb_set(payload,'{cartons,0,sourcePalletNumber}','"PALLET-A"')) returning id into preserved_revision;
  perform public.dm_assert_used_packing_scopes_preserved(preserved_revision);
  insert into public.shipment_packing_list_versions(shipment_id,version,status,payload_snapshot)
    values(shipment,3,'draft',jsonb_set(payload,'{cartons,0,sourceCartonNumber}','"RENAMED"')) returning id into changed_revision;
  rejected:=false;
  begin perform public.dm_assert_used_packing_scopes_preserved(changed_revision);
  exception when others then
    if sqlerrm not like '%used source scope%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'Used source scope identity was changed'; end if;
  rejected:=false;
  begin perform public.dm_confirm_warehouse_receipt_session(second_session);
  exception when others then
    if sqlerrm not like '%overlaps an already confirmed receipt%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'Overlapping existing session was confirmed twice'; end if;
  rejected:=false;
  begin perform public.dm_create_warehouse_receipt_session(shipment,scope,'counted_quantity',lines,'LOCAL-QA-KEY-3');
  exception when others then
    if sqlerrm not like '%overlaps an already confirmed receipt%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'Different-key replay created duplicate receipt'; end if;
  if public.dm_create_warehouse_receipt_session(shipment,scope,'counted_quantity',lines,'LOCAL-QA-KEY-1')<>first_session then
    raise exception 'Same-key replay changed receipt identity'; end if;
  perform public.dm_confirm_warehouse_receipt_session(first_session);
  rejected:=false;
  begin perform public.dm_create_warehouse_receipt_session(shipment,scope,'counted_quantity',jsonb_set(lines,'{0,actualQuantity}','8'),'LOCAL-QA-KEY-1');
  exception when others then
    if sqlerrm not like '%Idempotency key%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'Changed payload was accepted for existing idempotency key'; end if;
  rejected:=false;
  begin perform public.dm_create_warehouse_receipt_session(shipment,jsonb_set(scope,'{cartonNumbers}',jsonb_build_array('8#')),'counted_quantity',lines,'LOCAL-QA-CHILD');
  exception when others then
    if sqlerrm not like '%source scope%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'Member carton accepted as independently receivable'; end if;
  other_session:=public.dm_create_warehouse_receipt_session(shipment,other_scope,'scan_each',lines,'LOCAL-QA-OTHER');
  perform public.dm_confirm_warehouse_receipt_session(other_session);
  select coalesce(sum(on_hand),0) into received from public.inventory_balances where product_id=product;
  if received<>20 then raise exception 'Expected two disjoint groups = 20 units, got %',received; end if;
  select count(*) into received from public.stock_movements where product_id=product and movement_type='inbound';
  if received<>2 then raise exception 'Expected exactly two inbound movements, got %',received; end if;
  raise notice 'PASS: group selection, stale print guard, overlap, idempotency, disjoint receipts, exact stock and movement totals';
end $$;
rollback;
