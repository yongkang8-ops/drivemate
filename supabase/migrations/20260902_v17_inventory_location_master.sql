-- Local review artifact only. Do not execute against Production without separate approval.
begin;

alter table public.inventory_locations
  add column if not exists location_code text,
  add column if not exists barcode text,
  add column if not exists status text not null default 'active',
  add column if not exists is_putaway_destination boolean not null default true,
  add column if not exists physical_description text,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now();

update public.inventory_locations
  set location_code = case
    when upper(trim(warehouse)) = 'BRISBANE'
      then 'BNE-' || upper(trim(zone)) || '-' || upper(trim(bin_code))
    else upper(trim(warehouse)) || '-' || upper(trim(zone)) || '-' || upper(trim(bin_code))
  end
  where location_code is null;

update public.inventory_locations
  set barcode = 'DMLOC:' || location_code
  where barcode is null;

do $$
begin
  if exists (
    select 1
      from public.inventory_locations
      group by location_code
      having count(*) > 1
  ) then
    raise exception 'Inventory location code backfill produced duplicate canonical values';
  end if;
  if exists (
    select 1
      from public.inventory_locations
      group by barcode
      having count(*) > 1
  ) then
    raise exception 'Inventory location barcode backfill produced duplicate canonical values';
  end if;
end;
$$;

insert into public.inventory_locations (
  warehouse,
  zone,
  bin_code,
  location_code,
  barcode,
  status,
  is_putaway_destination,
  physical_description,
  notes
)
values (
  'Brisbane',
  'RECEIVING',
  'STAGING',
  'BNE-RECEIVING-STAGING',
  'DMLOC:BNE-RECEIVING-STAGING',
  'active',
  false,
  'System receiving staging source',
  'Registered system source for confirmed warehouse receipts.'
)
on conflict (warehouse, zone, bin_code) do update
  set location_code = excluded.location_code,
      barcode = excluded.barcode,
      status = 'active',
      is_putaway_destination = false,
      physical_description = coalesce(public.inventory_locations.physical_description, excluded.physical_description),
      notes = coalesce(public.inventory_locations.notes, excluded.notes);

update public.inventory_locations
  set status = 'active',
      is_putaway_destination = false
  where location_code = 'BNE-RECEIVING-STAGING';

alter table public.inventory_locations
  alter column location_code set not null,
  alter column barcode set not null;

alter table public.inventory_locations
  add constraint inventory_locations_status_check
  check (status in ('active', 'disabled', 'archived'));

create unique index if not exists inventory_locations_location_code_unique
  on public.inventory_locations (location_code);
create unique index if not exists inventory_locations_barcode_unique
  on public.inventory_locations (barcode);
create index if not exists inventory_balances_location_balance_lookup_idx
  on public.inventory_balances (location_id)
  include (on_hand, reserved, quarantine);

create or replace function public.dm_set_inventory_location_lifecycle_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.location_code is null then
      new.location_code := case
        when upper(trim(new.warehouse)) = 'BRISBANE'
          then 'BNE-' || upper(trim(new.zone)) || '-' || upper(trim(new.bin_code))
        else upper(trim(new.warehouse)) || '-' || upper(trim(new.zone)) || '-' || upper(trim(new.bin_code))
      end;
    end if;
    if new.barcode is null then
      new.barcode := 'DMLOC:' || new.location_code;
    end if;
    if new.barcode <> 'DMLOC:' || new.location_code then
      raise exception 'Inventory location barcode must match its immutable location code';
    end if;
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, new.created_at);
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, new.created_by, auth.uid());
    return new;
  end if;

  if new.location_code is distinct from old.location_code
    or new.barcode is distinct from old.barcode
    or new.warehouse is distinct from old.warehouse
    or new.zone is distinct from old.zone
    or new.bin_code is distinct from old.bin_code
    or new.is_putaway_destination is distinct from old.is_putaway_destination then
    raise exception 'Inventory location identity fields cannot be changed';
  end if;

  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create or replace function public.dm_block_non_active_inventory_location_with_balance()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.location_code = 'BNE-RECEIVING-STAGING' and new.status <> 'active' then
    raise exception 'BNE-RECEIVING-STAGING must remain active';
  end if;

  if new.status <> 'active' and new.status is distinct from old.status and exists (
    select 1
      from public.inventory_balances
      where location_id = new.id
        and (on_hand > 0 or reserved > 0 or quarantine > 0)
  ) then
    raise exception 'Locations with on-hand, reserved, or quarantine balance cannot be disabled or archived';
  end if;
  return new;
end;
$$;

create or replace function public.dm_audit_inventory_location_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  v_after := jsonb_build_object(
    'location_code', new.location_code,
    'barcode', new.barcode,
    'status', new.status,
    'is_putaway_destination', new.is_putaway_destination,
    'physical_description', new.physical_description,
    'notes', new.notes,
    'created_at', new.created_at,
    'updated_at', new.updated_at
  );

  if tg_op = 'INSERT' then
    insert into public.audit_events (
      entity_type,
      entity_id,
      action,
      actor_id,
      before_value,
      after_value
    ) values (
      'inventory_location',
      new.id::text,
      'inventory_location_created',
      coalesce(new.created_by, auth.uid()),
      null,
      v_after
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    v_action := 'inventory_location_status_changed';
  elsif new.physical_description is distinct from old.physical_description
    or new.notes is distinct from old.notes then
    v_action := 'inventory_location_updated';
  else
    return new;
  end if;

  v_before := jsonb_build_object(
    'location_code', old.location_code,
    'barcode', old.barcode,
    'status', old.status,
    'is_putaway_destination', old.is_putaway_destination,
    'physical_description', old.physical_description,
    'notes', old.notes,
    'created_at', old.created_at,
    'updated_at', old.updated_at
  );
  insert into public.audit_events (
    entity_type,
    entity_id,
    action,
    actor_id,
    before_value,
    after_value
  ) values (
    'inventory_location',
    new.id::text,
    v_action,
    coalesce(new.updated_by, auth.uid()),
    v_before,
    v_after
  );
  return new;
end;
$$;

drop trigger if exists inventory_locations_lifecycle_fields on public.inventory_locations;
create trigger inventory_locations_lifecycle_fields
  before insert or update on public.inventory_locations
  for each row execute function public.dm_set_inventory_location_lifecycle_fields();

drop trigger if exists inventory_locations_non_active_balance_guard on public.inventory_locations;
create trigger inventory_locations_non_active_balance_guard
  before update of status on public.inventory_locations
  for each row execute function public.dm_block_non_active_inventory_location_with_balance();

create or replace function public.dm_require_active_inventory_location_for_balance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if new.on_hand > 0 or new.reserved > 0 or new.quarantine > 0 then
    select status into v_status
      from public.inventory_locations
      where id = new.location_id
      for share;
    if v_status is distinct from 'active' then
      raise exception 'Inventory balances require an active location';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_balances_active_location_guard on public.inventory_balances;
create trigger inventory_balances_active_location_guard
  before insert or update of location_id, on_hand, reserved, quarantine on public.inventory_balances
  for each row execute function public.dm_require_active_inventory_location_for_balance();

drop trigger if exists inventory_locations_lifecycle_audit on public.inventory_locations;
create trigger inventory_locations_lifecycle_audit
  after insert or update on public.inventory_locations
  for each row execute function public.dm_audit_inventory_location_lifecycle();

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

  select id into v_staging_location_id
    from public.inventory_locations
    where location_code = 'BNE-RECEIVING-STAGING'
      and barcode = 'DMLOC:BNE-RECEIVING-STAGING'
      and status = 'active'
      and is_putaway_destination = false;
  if v_staging_location_id is null then
    raise exception 'Registered BNE-RECEIVING-STAGING source was not found';
  end if;

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

-- Replace the legacy v16 destination auto-create procedure with a lookup against
-- the immutable, active physical-location master.
drop function if exists public.dm_putaway_warehouse_receipt(uuid, text, text, text, text, integer, text, uuid);

create function public.dm_putaway_warehouse_receipt(
  p_session_id uuid,
  p_product_barcode text,
  p_destination_location_code text,
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
  v_destination_location_code text;
begin
  if coalesce(trim(p_product_barcode), '') = '' then
    raise exception 'Product barcode is required';
  end if;
  v_destination_location_code := upper(trim(coalesce(p_destination_location_code, '')));
  if v_destination_location_code = '' then
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
    where location_code = 'BNE-RECEIVING-STAGING'
      and barcode = 'DMLOC:BNE-RECEIVING-STAGING'
      and status = 'active'
      and is_putaway_destination = false
    for update;
  if v_source_location_id is null then
    raise exception 'Registered BNE-RECEIVING-STAGING source was not found';
  end if;

  select id into v_destination_location_id
    from public.inventory_locations
    where location_code = upper(trim(p_destination_location_code))
      and status = 'active'
      and is_putaway_destination = true
    for update;
  if v_destination_location_id is null then
    raise exception 'Destination location % is not an active registered putaway destination', v_destination_location_code;
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
        'destination_location', v_destination_location_code
      ),
      'warehouse-putaway:' || p_idempotency_key
    );

  return jsonb_build_object(
    'movement_id', v_movement_id,
    'remaining_quantity', greatest(v_line.actual_quantity - v_moved_quantity, 0)
  );
end;
$$;

revoke all on function public.dm_putaway_warehouse_receipt(uuid, text, text, integer, text, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.dm_putaway_warehouse_receipt(uuid, text, text, integer, text, uuid) to service_role;
  end if;
end;
$$;

commit;
