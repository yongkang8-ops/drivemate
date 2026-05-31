insert into public.products (sku, brand, part_name, category, oem_part_number, barcode, reorder_point, reorder_quantity, status)
values
  ('DM-GWM-OF-001', 'GWM', 'Genuine Engine Oil Filter', 'Service Filter', null, 'DMPGWMOF001', 12, 48, 'active'),
  ('DM-GWM-AF-002', 'GWM', 'Genuine Air Filter', 'Service Filter', null, 'DMPGWMAF002', 12, 48, 'active'),
  ('DM-GWM-CF-003', 'GWM', 'Genuine Cabin Filter', 'Service Filter', null, 'DMPGWMCF003', 12, 48, 'active'),
  ('DM-GWM-FF-004', 'GWM', 'Genuine Diesel Fuel Filter', 'Service Filter', null, 'DMPGWMFF004', 12, 36, 'active'),
  ('DM-BYD-CF-007', 'BYD', 'Cabin Filter', 'Service Filter', null, 'DMPBYDCF007', 10, 40, 'active'),
  ('DM-MG-CF-008', 'MG', 'Cabin Filter', 'Service Filter', null, 'DMPMGCF008', 10, 40, 'active')
on conflict (sku) do update
set brand = excluded.brand,
    part_name = excluded.part_name,
    category = excluded.category,
    oem_part_number = excluded.oem_part_number,
    barcode = excluded.barcode,
    reorder_point = excluded.reorder_point,
    reorder_quantity = excluded.reorder_quantity,
    status = excluded.status;

insert into public.inventory_locations (warehouse, zone, bin_code)
values
  ('Brisbane', 'A01', '03'),
  ('Brisbane', 'B02', '01'),
  ('Brisbane', 'DISPATCH', 'LANE')
on conflict (warehouse, zone, bin_code) do nothing;

insert into public.fitment_rules (product_id, make, model, year_from, year_to, engine, variant, confidence)
select id, 'GWM', 'Cannon Alpha', 2024, null, 'GW4D24', '2.4D', 'confirm_vin'
from public.products
where sku in ('DM-GWM-OF-001', 'DM-GWM-AF-002', 'DM-GWM-CF-003', 'DM-GWM-FF-004')
on conflict do nothing;

insert into public.fitment_rules (product_id, make, model, year_from, year_to, engine, variant, confidence)
select id, 'BYD', 'Atto 3', 2023, null, null, null, 'likely'
from public.products
where sku = 'DM-BYD-CF-007'
on conflict do nothing;

insert into public.fitment_rules (product_id, make, model, year_from, year_to, engine, variant, confidence)
select id, 'MG', 'MG4', 2023, null, null, null, 'likely'
from public.products
where sku = 'DM-MG-CF-008'
on conflict do nothing;

insert into public.inventory_batches (product_id, batch_no, supplier_name, purchase_ref, received_date)
select id, 'BNE-2026-06-PILOT', 'DriveMate pilot supplier', 'PILOT-001', current_date
from public.products
where sku in ('DM-GWM-OF-001', 'DM-GWM-AF-002', 'DM-GWM-CF-003', 'DM-GWM-FF-004', 'DM-BYD-CF-007', 'DM-MG-CF-008')
on conflict (product_id, batch_no) do nothing;

insert into public.inventory_balances (product_id, location_id, batch_id, on_hand, reserved, quarantine)
select
  products.id,
  locations.id,
  batches.id,
  case products.sku
    when 'DM-GWM-OF-001' then 42
    when 'DM-GWM-AF-002' then 38
    when 'DM-GWM-CF-003' then 35
    when 'DM-GWM-FF-004' then 16
    when 'DM-BYD-CF-007' then 8
    when 'DM-MG-CF-008' then 0
    else 0
  end,
  case products.sku
    when 'DM-GWM-OF-001' then 1
    when 'DM-GWM-AF-002' then 1
    else 0
  end,
  0
from public.products
join public.inventory_batches batches on batches.product_id = products.id and batches.batch_no = 'BNE-2026-06-PILOT'
join public.inventory_locations locations on locations.warehouse = 'Brisbane' and locations.zone = 'A01' and locations.bin_code = '03'
where products.sku in ('DM-GWM-OF-001', 'DM-GWM-AF-002', 'DM-GWM-CF-003', 'DM-GWM-FF-004', 'DM-BYD-CF-007', 'DM-MG-CF-008')
on conflict (product_id, location_id, batch_id) do nothing;

insert into public.pricing_rules (id, sku, channel, price_mode, unit_price_ex_gst_cents, status)
values
  ('PRICE-GWM-SERVICE-FILTERS', 'DM-GWM-OF-001', 'Trade account', 'Login visible', 2595, 'active'),
  ('PRICE-GWM-AF-002', 'DM-GWM-AF-002', 'Trade account', 'Login visible', 3449, 'active'),
  ('PRICE-GWM-CF-003', 'DM-GWM-CF-003', 'Trade account', 'Login visible', 4499, 'active'),
  ('PRICE-GWM-FF-004', 'DM-GWM-FF-004', 'Trade account', 'Login visible', 4313, 'active'),
  ('PRICE-BYD-CF-007', 'DM-BYD-CF-007', 'Trade account', 'Login visible', 3850, 'active'),
  ('PRICE-MG-CF-008', 'DM-MG-CF-008', 'Trade account', 'Login visible', 3200, 'active')
on conflict (id) do update
set unit_price_ex_gst_cents = excluded.unit_price_ex_gst_cents,
    status = excluded.status;

insert into public.rfq_reviews (id, brand, vehicle, requested_part, priority, status)
values
  ('RFQ-GWM-ALPHA-FUEL-FILTER', 'GWM', 'Cannon Alpha 2.4D 2024-on', 'Diesel fuel filter', 'high', 'needs supplier confirmation'),
  ('RFQ-BYD-SHARK-SERVICE', 'BYD', 'Shark 6 / Sealion 6', 'Service filter pack', 'medium', 'monitor')
on conflict (id) do nothing;
