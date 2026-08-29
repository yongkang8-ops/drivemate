-- Local review artifact only. Do not execute against Production without separate approval.
begin;

create or replace function public.dm_putaway_warehouse_receipt(
  p_session_id uuid,
  p_product_barcode text,
  p_destination_warehouse text,
  p_destination_zone text,
  p_destination_bin text,
  p_quantity integer,
  p_idempotency_key text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.warehouse_receipt_sessions%rowtype;
  v_line record;
  v_source_location_id uuid;
  v_destination_location_id uuid;
  v_source_balance public.inventory_balances%rowtype;
  v_destination_balance public.inventory_balances%rowtype;
  v_batch_id uuid;
  v_movement_id uuid;
  v_existing_movement_id uuid;
  v_moved_quantity integer;
  v_remaining_quantity integer;
begin
  if coalesce(trim(p_product_barcode), '') = '' then
    raise exception 'Product barcode is required';
  end if;
  if coalesce(trim(p_destination_warehouse), '') = ''
    or coalesce(trim(p_destination_zone), '') = ''
    or coalesce(trim(p_destination_bin), '') = '' then
    raise exception 'A valid destination location is required';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Putaway quantity must be positive';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'Idempotency key is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  select * into v_session
    from public.warehouse_receipt_sessions
    where id = p_session_id
    for update;
  if v_session.id is null or v_session.status <> 'confirmed'
    or v_session.staging_location <> 'BNE-RECEIVING-STAGING' then
    raise exception 'A confirmed warehouse receipt in BNE-RECEIVING-STAGING is required';
  end if;

  select line.product_id, line.sku, line.product_barcode, line.actual_quantity
    into v_line
    from public.warehouse_receipt_session_lines as line
    where line.receipt_session_id = v_session.id
      and upper(trim(line.product_barcode)) = upper(trim(p_product_barcode));
  if v_line.product_id is null then
    raise exception 'Product barcode is outside the confirmed receipt scope';
  end if;

  select coalesce(sum(quantity), 0) into v_moved_quantity
    from public.stock_movements
    where movement_type = 'putaway'
      and reference_type = 'warehouse_receipt_putaway'
      and reference_id = v_session.id::text
      and product_id = v_line.product_id;
  v_remaining_quantity := v_line.actual_quantity - v_moved_quantity;

  select id into v_existing_movement_id
    from public.stock_movements
    where idempotency_key = p_idempotency_key;
  if v_existing_movement_id is not null then
    return jsonb_build_object(
      'movement_id', v_existing_movement_id,
      'remaining_quantity', v_remaining_quantity
    );
  end if;
  if v_remaining_quantity < p_quantity then
    raise exception 'Putaway quantity exceeds the receipt''s remaining staged quantity';
  end if;

  select id into v_source_location_id
    from public.inventory_locations
    where warehouse = 'Brisbane' and zone = 'RECEIVING' and bin_code = 'STAGING';
  if v_source_location_id is null then
    raise exception 'BNE-RECEIVING-STAGING location was not found';
  end if;

  select id into v_batch_id
    from public.inventory_batches
    where product_id = v_line.product_id
      and batch_no = 'REC-' || v_session.id::text;
  if v_batch_id is null then
    raise exception 'Receipt staging batch was not found';
  end if;

  select * into v_source_balance
    from public.inventory_balances
    where product_id = v_line.product_id
      and location_id = v_source_location_id
      and batch_id = v_batch_id
    for update;
  if v_source_balance.id is null
    or v_source_balance.on_hand < p_quantity
    or v_source_balance.quarantine < p_quantity then
    raise exception 'Not enough quarantined stock remains in BNE-RECEIVING-STAGING';
  end if;

  insert into public.inventory_locations(warehouse, zone, bin_code)
    values (trim(p_destination_warehouse), trim(p_destination_zone), trim(p_destination_bin))
    on conflict (warehouse, zone, bin_code) do update set warehouse = excluded.warehouse
    returning id into v_destination_location_id;
  if v_destination_location_id = v_source_location_id then
    raise exception 'Destination location must differ from BNE-RECEIVING-STAGING';
  end if;

  insert into public.inventory_balances(product_id, location_id, batch_id, on_hand, reserved, quarantine)
    values (v_line.product_id, v_destination_location_id, v_batch_id, 0, 0, 0)
    on conflict (product_id, location_id, batch_id) do nothing;
  select * into v_destination_balance
    from public.inventory_balances
    where product_id = v_line.product_id
      and location_id = v_destination_location_id
      and batch_id = v_batch_id
    for update;

  update public.inventory_balances
    set on_hand = on_hand - p_quantity,
        quarantine = quarantine - p_quantity
    where id = v_source_balance.id;
  update public.inventory_balances
    set on_hand = on_hand + p_quantity
    where id = v_destination_balance.id;

  insert into public.stock_movements(
    product_id, batch_id, movement_type, quantity,
    from_location_id, to_location_id,
    reference_type, reference_id, created_by, idempotency_key
  ) values (
    v_line.product_id, v_batch_id, 'putaway', p_quantity,
    v_source_location_id, v_destination_location_id,
    'warehouse_receipt_putaway', v_session.id::text, p_actor_id, p_idempotency_key
  ) returning id into v_movement_id;

  select coalesce(sum(quantity), 0) into v_moved_quantity
    from public.stock_movements
    where movement_type = 'putaway'
      and reference_type = 'warehouse_receipt_putaway'
      and reference_id = v_session.id::text
      and product_id = v_line.product_id;

  insert into public.audit_events(entity_type, entity_id, action, actor_id, after_value, idempotency_key)
    values (
      'warehouse_receipt_session', v_session.id::text, 'warehouse_putaway_confirmed', p_actor_id,
      jsonb_build_object(
        'product_barcode', upper(trim(p_product_barcode)),
        'quantity', p_quantity,
        'source_location', 'BNE-RECEIVING-STAGING',
        'destination_location', trim(p_destination_warehouse) || '-' || trim(p_destination_zone) || '-' || trim(p_destination_bin)
      ),
      'warehouse-putaway:' || p_idempotency_key
    );

  return jsonb_build_object(
    'movement_id', v_movement_id,
    'remaining_quantity', greatest(v_line.actual_quantity - v_moved_quantity, 0)
  );
end;
$$;

revoke all on function public.dm_putaway_warehouse_receipt(uuid, text, text, text, text, integer, text, uuid) from public;

commit;
