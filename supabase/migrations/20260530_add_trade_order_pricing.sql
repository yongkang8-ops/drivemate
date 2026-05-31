alter table public.pricing_rules
add column if not exists unit_price_ex_gst_cents int not null default 0 check (unit_price_ex_gst_cents >= 0);

alter table public.sales_orders
add column if not exists subtotal_ex_gst_cents int not null default 0 check (subtotal_ex_gst_cents >= 0),
add column if not exists gst_cents int not null default 0 check (gst_cents >= 0),
add column if not exists total_inc_gst_cents int not null default 0 check (total_inc_gst_cents >= 0);

alter table public.sales_order_lines
add column if not exists unit_price_ex_gst_cents int not null default 0 check (unit_price_ex_gst_cents >= 0),
add column if not exists line_total_ex_gst_cents int not null default 0 check (line_total_ex_gst_cents >= 0),
add column if not exists gst_cents int not null default 0 check (gst_cents >= 0),
add column if not exists line_total_inc_gst_cents int not null default 0 check (line_total_inc_gst_cents >= 0);

update public.pricing_rules
set unit_price_ex_gst_cents = case sku
  when 'DM-GWM-OF-001' then 2595
  when 'DM-GWM-AF-002' then 3449
  when 'DM-GWM-CF-003' then 4499
  when 'DM-GWM-FF-004' then 4313
  when 'DM-BYD-CF-007' then 3850
  when 'DM-MG-CF-008' then 3200
  else unit_price_ex_gst_cents
end
where sku in (
  'DM-GWM-OF-001',
  'DM-GWM-AF-002',
  'DM-GWM-CF-003',
  'DM-GWM-FF-004',
  'DM-BYD-CF-007',
  'DM-MG-CF-008'
);
