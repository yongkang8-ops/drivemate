-- Run only in a disposable local database. The containing Docker instance is discarded after QA.
insert into auth.users(id) values('f1000000-0000-4000-8000-000000000001');
insert into public.suppliers(id,legal_name) values('f2000000-0000-4000-8000-000000000002','LOCAL QA supplier');
insert into public.data_import_runs(id,import_type,source_file_name,source_sha256)
values('f3000000-0000-4000-8000-000000000003','qa','LOCAL QA','local-concurrency');
insert into public.purchase_orders(id,contract_number,supplier_id,subtotal_minor,final_total_minor,source_import_run_id)
values('f4000000-0000-4000-8000-000000000004','LOCAL-CONCURRENCY','f2000000-0000-4000-8000-000000000002',0,0,'f3000000-0000-4000-8000-000000000003');
insert into public.shipments(id,purchase_order_id,shipment_reference)
values('f5000000-0000-4000-8000-000000000005','f4000000-0000-4000-8000-000000000004','LOCAL-CONCURRENCY');
insert into public.shipments(id,purchase_order_id,shipment_reference)
values('f5000000-0000-4000-8000-000000000007','f4000000-0000-4000-8000-000000000004','LOCAL-PRINT-PACKING-CONCURRENCY');
insert into public.products(id,sku,brand,part_name,category,barcode)
values('f6000000-0000-4000-8000-000000000006','LOCAL-QA-RACE','QA','Disposable race fixture','QA','LOCALQARACE');
insert into public.purchase_order_lines(
  id,purchase_order_id,product_id,source_row_number,supplier_part_number,quantity,unit,
  unit_price_incl_vat_minor,original_amount_minor,allocated_discount_minor,cash_purchase_cost_minor
) values('fa000000-0000-4000-8000-000000000011','f4000000-0000-4000-8000-000000000004',
  'f6000000-0000-4000-8000-000000000006',1,'LOCAL-QA-RACE',20,'each',0,0,0,0);
insert into public.shipment_packing_list_versions(shipment_id,version,status,payload_snapshot,confirmed_at,confirmed_by)
values('f5000000-0000-4000-8000-000000000005',1,'confirmed',
  '{"schemaVersion":3,"shipmentId":"f5000000-0000-4000-8000-000000000005","cartons":[{"sourceCartonNumber":"G1","kind":"carton_group","physicalCartonCount":2,"memberCartonNumbers":["C1","C2"],"lines":[{"sku":"LOCAL-QA-RACE","expectedQuantity":10}]},{"sourceCartonNumber":"G2","kind":"carton_group","physicalCartonCount":2,"memberCartonNumbers":["C3","C4"],"lines":[{"sku":"LOCAL-QA-RACE","expectedQuantity":10}]}]}'::jsonb,
  now(),'f1000000-0000-4000-8000-000000000001');
insert into public.shipment_packing_list_versions(id,shipment_id,version,status,payload_snapshot,confirmed_at,confirmed_by)
values('fb000000-0000-4000-8000-000000000012','f5000000-0000-4000-8000-000000000007',1,'confirmed',
  '{"schemaVersion":2,"shipmentId":"f5000000-0000-4000-8000-000000000007","cartons":[{"sourceCartonNumber":"OLD","lines":[{"sku":"LOCAL-QA-RACE","expectedQuantity":1}]}]}'::jsonb,
  now(),'f1000000-0000-4000-8000-000000000001');
insert into public.shipment_packing_list_versions(id,shipment_id,version,status,payload_snapshot)
values('fc000000-0000-4000-8000-000000000013','f5000000-0000-4000-8000-000000000007',2,'draft',
  '{"schemaVersion":2,"shipmentId":"f5000000-0000-4000-8000-000000000007","cartons":[{"sourceCartonNumber":"NEW","lines":[{"sku":"LOCAL-QA-RACE","expectedQuantity":1}]}]}'::jsonb);
insert into public.warehouse_label_print_jobs(id,template_id,payload_snapshot,requested_quantity,status)
values('f8000000-0000-4000-8000-000000000009','unit_product',
  '{"shipmentId":"f5000000-0000-4000-8000-000000000007","cartonNumbers":["OLD"],"lines":[{"sku":"LOCAL-QA-RACE","expectedQuantity":1,"productBarcode":"LOCALQARACE"}]}'::jsonb,1,'pending');
insert into public.warehouse_label_print_items(id,job_id,sequence,payload_snapshot)
values('f9000000-0000-4000-8000-000000000010','f8000000-0000-4000-8000-000000000009',1,'{"sku":"LOCAL-QA-RACE"}'::jsonb);
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
