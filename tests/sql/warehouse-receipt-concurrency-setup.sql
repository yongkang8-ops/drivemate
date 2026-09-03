-- Run only in a disposable local database. The containing Docker instance is discarded after QA.
insert into auth.users(id) values('f1000000-0000-4000-8000-000000000001');
insert into public.suppliers(id,legal_name) values('f2000000-0000-4000-8000-000000000002','LOCAL QA supplier');
insert into public.data_import_runs(id,import_type,source_file_name,source_sha256)
values('f3000000-0000-4000-8000-000000000003','qa','LOCAL QA','local-concurrency');
insert into public.purchase_orders(id,contract_number,supplier_id,subtotal_minor,final_total_minor,source_import_run_id)
values('f4000000-0000-4000-8000-000000000004','LOCAL-CONCURRENCY','f2000000-0000-4000-8000-000000000002',0,0,'f3000000-0000-4000-8000-000000000003');
insert into public.shipments(id,purchase_order_id,shipment_reference)
values('f5000000-0000-4000-8000-000000000005','f4000000-0000-4000-8000-000000000004','LOCAL-CONCURRENCY');
insert into public.products(id,sku,brand,part_name,category,barcode)
values('f6000000-0000-4000-8000-000000000006','LOCAL-QA-RACE','QA','Disposable race fixture','QA','LOCALQARACE');
insert into public.shipment_packing_list_versions(shipment_id,version,status,payload_snapshot,confirmed_at,confirmed_by)
values('f5000000-0000-4000-8000-000000000005',1,'confirmed',
  '{"schemaVersion":3,"shipmentId":"f5000000-0000-4000-8000-000000000005","cartons":[{"sourceCartonNumber":"G1","kind":"carton_group","physicalCartonCount":2,"memberCartonNumbers":["C1","C2"],"lines":[{"sku":"LOCAL-QA-RACE","expectedQuantity":10}]},{"sourceCartonNumber":"G2","kind":"carton_group","physicalCartonCount":2,"memberCartonNumbers":["C3","C4"],"lines":[{"sku":"LOCAL-QA-RACE","expectedQuantity":10}]}]}'::jsonb,
  now(),'f1000000-0000-4000-8000-000000000001');
insert into public.warehouse_label_print_jobs(template_id,payload_snapshot,requested_quantity,status,printed_at)
values('unit_product','{"shipmentId":"f5000000-0000-4000-8000-000000000005","cartonNumbers":["G1"],"lines":[{"sku":"LOCAL-QA-RACE","expectedQuantity":10,"productBarcode":"LOCALQARACE"}]}'::jsonb,10,'printed',now()),
('unit_product','{"shipmentId":"f5000000-0000-4000-8000-000000000005","cartonNumbers":["G1","G2"],"lines":[{"sku":"LOCAL-QA-RACE","expectedQuantity":20,"productBarcode":"LOCALQARACE"}]}'::jsonb,20,'printed',now());
select public.dm_create_warehouse_receipt_session(
  'f5000000-0000-4000-8000-000000000005',
  '{"shipmentId":"f5000000-0000-4000-8000-000000000005","cartonNumbers":["G1"],"lines":[{"sku":"LOCAL-QA-RACE","expectedQuantity":10,"productBarcode":"LOCALQARACE"}]}'::jsonb,
  'counted_quantity','[{"sku":"LOCAL-QA-RACE","expectedQuantity":10,"actualQuantity":10,"productBarcode":"LOCALQARACE"}]'::jsonb,'LOCAL-RACE-A');
select public.dm_create_warehouse_receipt_session(
  'f5000000-0000-4000-8000-000000000005',
  '{"shipmentId":"f5000000-0000-4000-8000-000000000005","cartonNumbers":["G1","G2"],"lines":[{"sku":"LOCAL-QA-RACE","expectedQuantity":20,"productBarcode":"LOCALQARACE"}]}'::jsonb,
  'counted_quantity','[{"sku":"LOCAL-QA-RACE","expectedQuantity":20,"actualQuantity":20,"productBarcode":"LOCALQARACE"}]'::jsonb,'LOCAL-RACE-B');
