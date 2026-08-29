-- Local review artifact only. Do not execute against Production without separate approval.
begin;

create table if not exists public.warehouse_receipt_sessions (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id),
  scope_snapshot jsonb not null check (jsonb_typeof(scope_snapshot) = 'object'),
  mode text not null check (mode in ('scan_each', 'counted_quantity')),
  status text not null default 'in_progress' check (status in ('in_progress', 'confirmed', 'cancelled')),
  staging_location text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  idempotency_key text not null unique,
  check (
    (status = 'in_progress' and confirmed_by is null and confirmed_at is null and staging_location is null)
    or (status = 'confirmed' and confirmed_at is not null and staging_location = 'BNE-RECEIVING-STAGING')
    or (status = 'cancelled' and confirmed_at is null and staging_location is null)
  )
);

create table if not exists public.warehouse_receipt_session_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_session_id uuid not null references public.warehouse_receipt_sessions(id) on delete restrict,
  product_id uuid not null references public.products(id),
  sku text not null,
  product_barcode text not null,
  expected_quantity integer not null check (expected_quantity > 0),
  actual_quantity integer not null check (actual_quantity >= 0),
  created_at timestamptz not null default now(),
  unique (receipt_session_id, product_id)
);

create table if not exists public.warehouse_receipt_discrepancies (
  id uuid primary key default gen_random_uuid(),
  receipt_session_line_id uuid not null references public.warehouse_receipt_session_lines(id) on delete restrict,
  discrepancy_type text not null check (discrepancy_type in ('short_pack', 'over_received', 'damaged', 'wrong_item', 'unknown_barcode')),
  reason text not null check (length(trim(reason)) >= 3),
  created_at timestamptz not null default now(),
  unique (receipt_session_line_id)
);

create index if not exists warehouse_receipt_sessions_shipment_created_idx
  on public.warehouse_receipt_sessions (shipment_id, created_at desc);
create index if not exists warehouse_receipt_sessions_created_by_idx
  on public.warehouse_receipt_sessions (created_by);
create index if not exists warehouse_receipt_sessions_confirmed_by_idx
  on public.warehouse_receipt_sessions (confirmed_by);
create index if not exists warehouse_receipt_session_lines_product_idx
  on public.warehouse_receipt_session_lines (product_id);

alter table public.warehouse_receipt_sessions enable row level security;
alter table public.warehouse_receipt_session_lines enable row level security;
alter table public.warehouse_receipt_discrepancies enable row level security;

create or replace function public.dm_create_warehouse_receipt_session(
  p_shipment_id uuid,
  p_scope_snapshot jsonb,
  p_mode text,
  p_lines jsonb,
  p_idempotency_key text,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_line jsonb;
  v_discrepancy jsonb;
  v_line_id uuid;
  v_product record;
  v_sku text;
  v_barcode text;
  v_expected integer;
  v_actual integer;
begin
  if p_mode not in ('scan_each', 'counted_quantity') then
    raise exception 'Unsupported warehouse receipt mode';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'Idempotency key is required';
  end if;
  if jsonb_typeof(p_scope_snapshot) <> 'object'
    or p_scope_snapshot->>'shipmentId' <> p_shipment_id::text
    or jsonb_typeof(p_scope_snapshot->'cartonNumbers') <> 'array'
    or jsonb_array_length(p_scope_snapshot->'cartonNumbers') = 0
    or jsonb_typeof(p_scope_snapshot->'lines') <> 'array'
    or jsonb_array_length(p_scope_snapshot->'lines') = 0 then
    raise exception 'Warehouse receipt scope is invalid';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Warehouse receipt lines are required';
  end if;
  if jsonb_array_length(p_lines) <> jsonb_array_length(p_scope_snapshot->'lines') then
    raise exception 'Warehouse receipt lines do not cover the expected scope';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  select id into v_session_id
    from public.warehouse_receipt_sessions
    where idempotency_key = p_idempotency_key;
  if v_session_id is not null then
    return v_session_id;
  end if;

  if not exists (select 1 from public.shipments where id = p_shipment_id) then
    raise exception 'Shipment was not found';
  end if;

  insert into public.warehouse_receipt_sessions(
    shipment_id, scope_snapshot, mode, status, created_by, idempotency_key
  ) values (
    p_shipment_id, p_scope_snapshot, p_mode, 'in_progress', p_actor_id, p_idempotency_key
  ) returning id into v_session_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_sku := upper(trim(v_line->>'sku'));
    v_barcode := upper(trim(v_line->>'productBarcode'));
    begin
      v_expected := (v_line->>'expectedQuantity')::integer;
      v_actual := (v_line->>'actualQuantity')::integer;
    exception when invalid_text_representation then
      raise exception 'Warehouse receipt quantities must be whole numbers';
    end;
    if coalesce(v_sku, '') = '' or coalesce(v_barcode, '') = '' or v_expected <= 0 or v_actual < 0 then
      raise exception 'Warehouse receipt line is invalid';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(p_scope_snapshot->'lines') as scope_line(value)
      where upper(trim(scope_line.value->>'sku')) = v_sku
        and upper(trim(scope_line.value->>'productBarcode')) = v_barcode
        and (scope_line.value->>'expectedQuantity')::integer = v_expected
    ) then
      raise exception 'Warehouse receipt line is outside the expected scope';
    end if;

    select id, sku, barcode into v_product
      from public.products
      where sku = v_sku and upper(coalesce(barcode, '')) = v_barcode;
    if v_product.id is null then
      raise exception 'Product master does not match the warehouse receipt barcode for %', v_sku;
    end if;

    v_discrepancy := v_line->'discrepancy';
    if v_actual <> v_expected and (
      jsonb_typeof(v_discrepancy) <> 'object'
      or v_discrepancy->>'type' not in ('short_pack', 'over_received', 'damaged', 'wrong_item', 'unknown_barcode')
      or length(trim(coalesce(v_discrepancy->>'reason', ''))) < 3
    ) then
      raise exception 'A classified discrepancy is required for %', v_sku;
    end if;

    insert into public.warehouse_receipt_session_lines(
      receipt_session_id, product_id, sku, product_barcode, expected_quantity, actual_quantity
    ) values (
      v_session_id, v_product.id, v_product.sku, v_barcode, v_expected, v_actual
    ) returning id into v_line_id;

    if jsonb_typeof(v_discrepancy) = 'object' then
      insert into public.warehouse_receipt_discrepancies(
        receipt_session_line_id, discrepancy_type, reason
      ) values (
        v_line_id, v_discrepancy->>'type', trim(v_discrepancy->>'reason')
      );
    end if;
  end loop;

  return v_session_id;
end;
$$;

create or replace function public.dm_confirm_warehouse_receipt_session(
  p_session_id uuid,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.warehouse_receipt_sessions%rowtype;
  v_line record;
  v_staging_location_id uuid;
  v_batch_id uuid;
  v_required_quantity integer;
begin
  select * into v_session
    from public.warehouse_receipt_sessions
    where id = p_session_id
    for update;
  if v_session.id is null then
    raise exception 'Warehouse receipt session was not found';
  end if;
  if v_session.status = 'confirmed' then
    return v_session.id;
  end if;
  if v_session.status <> 'in_progress' then
    raise exception 'Only an in-progress warehouse receipt session can be confirmed';
  end if;

  select coalesce(sum(expected_quantity), 0) into v_required_quantity
    from public.warehouse_receipt_session_lines
    where receipt_session_id = v_session.id;
  if v_required_quantity <= 0 then
    raise exception 'Warehouse receipt session has no lines';
  end if;
  if not exists (
    select 1
    from public.warehouse_label_print_jobs as job
    where job.template_id = 'unit_product'
      and job.status = 'printed'
      and job.requested_quantity >= v_required_quantity
      and job.payload_snapshot @> v_session.scope_snapshot
  ) then
    raise exception 'Confirmed Unit Product labels are required for the complete selected receipt scope before stock can be received';
  end if;

  insert into public.inventory_locations(warehouse, zone, bin_code)
    values ('Brisbane', 'RECEIVING', 'STAGING')
    on conflict (warehouse, zone, bin_code) do update set warehouse = excluded.warehouse
    returning id into v_staging_location_id;

  for v_line in
    select line.*, product.id as product_id
    from public.warehouse_receipt_session_lines as line
    join public.products as product on product.id = line.product_id
    where line.receipt_session_id = v_session.id
      and line.actual_quantity > 0
  loop
    insert into public.inventory_batches(product_id, batch_no, supplier_name, purchase_ref, received_date)
      values (
        v_line.product_id,
        'REC-' || v_session.id::text,
        'Warehouse receiving',
        v_session.id::text,
        current_date
      )
      on conflict (product_id, batch_no) do update
        set purchase_ref = excluded.purchase_ref,
            received_date = excluded.received_date
      returning id into v_batch_id;

    insert into public.inventory_balances(product_id, location_id, batch_id, on_hand, reserved, quarantine)
      values (v_line.product_id, v_staging_location_id, v_batch_id, v_line.actual_quantity, 0, v_line.actual_quantity)
      on conflict (product_id, location_id, batch_id) do update
        set on_hand = public.inventory_balances.on_hand + excluded.on_hand,
            quarantine = public.inventory_balances.quarantine + excluded.quarantine;

    insert into public.stock_movements(
      product_id, batch_id, movement_type, quantity, to_location_id, reference_type, reference_id, created_by
    ) values (
      v_line.product_id,
      v_batch_id,
      'inbound',
      v_line.actual_quantity,
      v_staging_location_id,
      'warehouse_receipt_session',
      v_session.id::text,
      p_actor_id
    );
  end loop;

  update public.warehouse_receipt_sessions
    set status = 'confirmed',
        staging_location = 'BNE-RECEIVING-STAGING',
        confirmed_by = p_actor_id,
        confirmed_at = now()
    where id = v_session.id;

  insert into public.audit_events(entity_type, entity_id, action, actor_id, after_value, idempotency_key)
    values (
      'warehouse_receipt_session',
      v_session.id::text,
      'warehouse_receipt_confirmed',
      p_actor_id,
      jsonb_build_object('staging_location', 'BNE-RECEIVING-STAGING'),
      'warehouse-receipt-confirm:' || v_session.id::text
    );

  return v_session.id;
end;
$$;

revoke all on function public.dm_create_warehouse_receipt_session(uuid, jsonb, text, jsonb, text, uuid) from public;
revoke all on function public.dm_confirm_warehouse_receipt_session(uuid, uuid) from public;

commit;
