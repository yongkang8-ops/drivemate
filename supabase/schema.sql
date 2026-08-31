create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('account-documents', 'account-documents', false, 10485760, null)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.trade_accounts (
  id uuid primary key default gen_random_uuid(),
  account_name text not null,
  abn text,
  contact_name text,
  contact_email text,
  contact_phone text,
  postcode text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'paused', 'closed')),
  created_at timestamptz not null default now()
);

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  trade_account_id uuid references public.trade_accounts(id),
  role text not null,
  display_name text,
  account_status text not null default 'active',
  must_change_password boolean not null default false,
  temporary_password_issued_at timestamptz,
  temporary_password_expires_at timestamptz,
  password_changed_at timestamptz,
  disabled_at timestamptz,
  disabled_by uuid references auth.users(id) on delete set null,
  disabled_reason text,
  status_before_disabled text,
  last_login_at timestamptz,
  requires_reauthentication boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_role_check
    check (role in ('public', 'trade', 'warehouse_staff', 'partner', 'admin')),
  constraint user_profiles_account_status_check
    check (account_status in ('pending_first_login', 'active', 'disabled')),
  constraint user_profiles_staff_lifecycle_check
    check (
      (
        role not in ('warehouse_staff', 'partner', 'admin')
        and account_status = 'active'
        and must_change_password = false
        and temporary_password_issued_at is null
        and temporary_password_expires_at is null
        and disabled_at is null
        and disabled_by is null
        and disabled_reason is null
        and status_before_disabled is null
        and requires_reauthentication = false
      )
      or
      (
        role in ('warehouse_staff', 'partner', 'admin')
        and (
          (
            account_status = 'active'
            and must_change_password = false
            and temporary_password_issued_at is null
            and temporary_password_expires_at is null
            and disabled_at is null
            and disabled_by is null
            and disabled_reason is null
            and status_before_disabled is null
          )
          or
          (
            account_status = 'pending_first_login'
            and must_change_password = true
            and temporary_password_issued_at is not null
            and temporary_password_expires_at = temporary_password_issued_at + interval '7 days'
            and disabled_at is null
            and disabled_by is null
            and disabled_reason is null
            and status_before_disabled is null
          )
          or
          (
            account_status = 'disabled'
            and disabled_at is not null
            and disabled_by is not null
            and coalesce(trim(disabled_reason), '') <> ''
            and status_before_disabled in ('pending_first_login', 'active')
            and requires_reauthentication = true
            and (
              (
                status_before_disabled = 'active'
                and must_change_password = false
                and temporary_password_issued_at is null
                and temporary_password_expires_at is null
              )
              or
              (
                status_before_disabled = 'pending_first_login'
                and must_change_password = true
                and temporary_password_issued_at is not null
                and temporary_password_expires_at = temporary_password_issued_at + interval '7 days'
              )
            )
          )
        )
      )
    )
);

create index if not exists user_profiles_staff_status_idx
  on public.user_profiles (account_status, role, created_at desc)
  where role in ('warehouse_staff', 'partner', 'admin');
create index if not exists user_profiles_pending_password_expiry_idx
  on public.user_profiles (temporary_password_expires_at)
  where must_change_password = true and account_status = 'pending_first_login';
create index if not exists user_profiles_disabled_by_idx
  on public.user_profiles (disabled_by)
  where disabled_by is not null;
create index if not exists user_profiles_created_by_idx
  on public.user_profiles (created_by)
  where created_by is not null;
create index if not exists user_profiles_updated_by_idx
  on public.user_profiles (updated_by)
  where updated_by is not null;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  brand text not null,
  part_name text not null,
  category text not null,
  oem_part_number text,
  barcode text unique,
  image_url text,
  reorder_point int not null default 0 check (reorder_point >= 0),
  reorder_quantity int not null default 0 check (reorder_quantity >= 0),
  status text not null default 'active' check (status in ('active', 'draft', 'paused')),
  created_at timestamptz not null default now()
);

create table public.fitment_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  make text not null,
  model text not null,
  year_from int,
  year_to int,
  engine text,
  variant text,
  confidence text not null check (confidence in ('exact', 'likely', 'confirm_vin')),
  created_at timestamptz not null default now()
);

create unique index if not exists fitment_rules_unique_vehicle
on public.fitment_rules (
  product_id,
  lower(make),
  lower(model),
  coalesce(year_from, 0),
  coalesce(year_to, 0),
  coalesce(lower(engine), ''),
  coalesce(lower(variant), '')
);

create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  warehouse text not null,
  zone text not null,
  bin_code text not null,
  location_code text not null unique,
  barcode text not null unique,
  status text not null default 'active' check (status in ('active', 'disabled', 'archived')),
  is_putaway_destination boolean not null default true,
  physical_description text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (warehouse, zone, bin_code)
);

create table public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  batch_no text not null,
  supplier_name text,
  purchase_ref text,
  received_date date,
  unique (product_id, batch_no)
);

create table public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  location_id uuid not null references public.inventory_locations(id),
  batch_id uuid not null references public.inventory_batches(id),
  on_hand int not null default 0 check (on_hand >= 0),
  reserved int not null default 0 check (reserved >= 0),
  quarantine int not null default 0 check (quarantine >= 0),
  unique (product_id, location_id, batch_id)
);

create index inventory_balances_location_balance_lookup_idx
on public.inventory_balances (location_id)
include (on_hand, reserved, quarantine);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  batch_id uuid references public.inventory_batches(id),
  movement_type text not null check (
    movement_type in ('inbound', 'putaway', 'reserve', 'pick', 'dispatch', 'return', 'quarantine', 'adjustment')
  ),
  quantity int not null check (quantity > 0),
  from_location_id uuid references public.inventory_locations(id),
  to_location_id uuid references public.inventory_locations(id),
  reference_type text not null,
  reference_id text not null,
  created_by uuid references auth.users(id),
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor_id uuid references auth.users(id),
  before_value jsonb,
  after_value jsonb,
  source_file text,
  source_hash text,
  source_row_number int,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create index audit_events_entity_idx
on public.audit_events (entity_type, entity_id, created_at desc);

create table public.warehouse_label_print_jobs (
  id uuid primary key default gen_random_uuid(),
  template_id text not null check (template_id in ('unit_product', 'receiving_carton', 'bin_location', 'dispatch_shipping')),
  payload_snapshot jsonb not null check (jsonb_typeof(payload_snapshot) = 'object'),
  requested_quantity integer not null check (requested_quantity > 0),
  status text not null default 'pending' check (status in ('pending', 'printed', 'cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  printed_at timestamptz,
  cancelled_at timestamptz,
  reprint_of_job_id uuid references public.warehouse_label_print_jobs(id) on delete restrict,
  reprint_reason text,
  check (
    (reprint_of_job_id is null and reprint_reason is null)
    or (reprint_of_job_id is not null and length(trim(coalesce(reprint_reason, ''))) > 0)
  ),
  check (
    (status = 'pending' and printed_at is null and cancelled_at is null)
    or (status = 'printed' and printed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and printed_at is null)
  )
);

create table public.warehouse_label_print_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.warehouse_label_print_jobs(id) on delete restrict,
  source_item_id uuid references public.warehouse_label_print_items(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  payload_snapshot jsonb not null check (jsonb_typeof(payload_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique (job_id, sequence)
);

create index warehouse_label_print_jobs_created_at_idx
on public.warehouse_label_print_jobs (created_at desc);
create index warehouse_label_print_jobs_reprint_of_job_id_idx
on public.warehouse_label_print_jobs (reprint_of_job_id);

create table public.warehouse_receipt_sessions (
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

create table public.warehouse_receipt_session_lines (
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

create table public.warehouse_receipt_discrepancies (
  id uuid primary key default gen_random_uuid(),
  receipt_session_line_id uuid not null references public.warehouse_receipt_session_lines(id) on delete restrict,
  discrepancy_type text not null check (discrepancy_type in ('short_pack', 'over_received', 'damaged', 'wrong_item', 'unknown_barcode')),
  reason text not null check (length(trim(reason)) >= 3),
  created_at timestamptz not null default now(),
  unique (receipt_session_line_id)
);

create index warehouse_receipt_sessions_shipment_created_idx
on public.warehouse_receipt_sessions (shipment_id, created_at desc);
create index warehouse_receipt_sessions_created_by_idx
on public.warehouse_receipt_sessions (created_by);
create index warehouse_receipt_sessions_confirmed_by_idx
on public.warehouse_receipt_sessions (confirmed_by);
create index warehouse_receipt_session_lines_product_idx
on public.warehouse_receipt_session_lines (product_id);

create table public.shipment_packing_list_versions (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id),
  version integer not null check (version > 0),
  status text not null check (status in ('draft', 'confirmed', 'superseded')),
  payload_snapshot jsonb not null check (jsonb_typeof(payload_snapshot) = 'object'),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (shipment_id, version),
  check (
    (status = 'draft' and confirmed_by is null and confirmed_at is null)
    or (status in ('confirmed', 'superseded') and confirmed_by is not null and confirmed_at is not null)
  )
);

create index shipment_packing_list_versions_shipment_idx
on public.shipment_packing_list_versions (shipment_id, version desc);

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  trade_account_id uuid not null references public.trade_accounts(id),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'confirmed', 'picked', 'dispatched', 'cancelled')),
  po_number text,
  vehicle_rego text,
  vehicle_vin text,
  subtotal_ex_gst_cents int not null default 0 check (subtotal_ex_gst_cents >= 0),
  gst_cents int not null default 0 check (gst_cents >= 0),
  total_inc_gst_cents int not null default 0 check (total_inc_gst_cents >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity int not null check (quantity > 0),
  unit_price_ex_gst_cents int not null default 0 check (unit_price_ex_gst_cents >= 0),
  line_total_ex_gst_cents int not null default 0 check (line_total_ex_gst_cents >= 0),
  gst_cents int not null default 0 check (gst_cents >= 0),
  line_total_inc_gst_cents int not null default 0 check (line_total_inc_gst_cents >= 0),
  status text not null default 'open' check (status in ('open', 'reserved', 'picked', 'cancelled'))
);

create table public.account_documents (
  id uuid primary key default gen_random_uuid(),
  trade_account_id uuid not null references public.trade_accounts(id),
  document_type text not null check (document_type in ('invoice', 'statement', 'delivery_record')),
  document_ref text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (trade_account_id, document_type, document_ref)
);

create table public.pricing_rules (
  id text primary key,
  sku text not null references public.products(sku),
  channel text not null,
  price_mode text not null,
  unit_price_ex_gst_cents int not null default 0 check (unit_price_ex_gst_cents >= 0),
  status text not null default 'active' check (status in ('active', 'draft', 'paused')),
  created_at timestamptz not null default now()
);

create table public.rfq_reviews (
  id text primary key,
  brand text not null,
  vehicle text not null,
  requested_part text not null,
  priority text not null check (priority in ('low', 'medium', 'high')),
  status text not null,
  created_at timestamptz not null default now()
);

create table public.vehicle_lookup_requests (
  id uuid primary key default gen_random_uuid(),
  trade_account_id uuid references public.trade_accounts(id),
  rego text,
  vin text,
  query text,
  vehicle text not null,
  match_count int not null default 0 check (match_count >= 0),
  confidence text not null check (confidence in ('mock_match', 'manual_review')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists vehicle_lookup_requests_created_at_idx
on public.vehicle_lookup_requests (created_at desc);

create or replace function public.dm_create_warehouse_label_print_job_with_items(
  p_template_id text,
  p_payload_snapshot jsonb,
  p_requested_quantity integer,
  p_item_payload_snapshots jsonb,
  p_actor_id uuid default null,
  p_reprint_of_job_id uuid default null,
  p_reprint_reason text default null,
  p_reprint_source_item_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_original public.warehouse_label_print_jobs%rowtype;
  v_original_item_count integer;
  v_selected_item_count integer;
  v_original_item_payloads jsonb;
begin
  if p_template_id is null
    or p_template_id not in ('unit_product', 'receiving_carton', 'bin_location', 'dispatch_shipping') then
    raise exception 'Unsupported warehouse label template';
  end if;
  if jsonb_typeof(p_payload_snapshot) <> 'object' then
    raise exception 'Warehouse label payload snapshot must be an object';
  end if;
  if p_requested_quantity is null or p_requested_quantity <= 0 then
    raise exception 'Requested label quantity must be a positive integer';
  end if;
  if jsonb_typeof(p_item_payload_snapshots) <> 'array'
    or jsonb_array_length(p_item_payload_snapshots) <> p_requested_quantity then
    raise exception 'Label item count must equal the requested quantity';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_item_payload_snapshots) as item(payload_snapshot)
    where jsonb_typeof(item.payload_snapshot) <> 'object'
  ) then
    raise exception 'Label item snapshots must be objects';
  end if;
  if (p_reprint_of_job_id is null) <> (nullif(trim(coalesce(p_reprint_reason, '')), '') is null) then
    raise exception 'A reprint source and reason are required together';
  end if;
  if p_reprint_of_job_id is null and p_reprint_source_item_ids is not null then
    raise exception 'Reprint source item selection requires a reprint source';
  end if;

  if p_reprint_of_job_id is not null then
    select * into v_original
      from public.warehouse_label_print_jobs
      where id = p_reprint_of_job_id
      for key share;
    if v_original.id is null then
      raise exception 'Original warehouse label print job was not found';
    end if;
    select count(*) into v_original_item_count
      from public.warehouse_label_print_items
      where job_id = v_original.id;
    if v_original_item_count <> v_original.requested_quantity then
      raise exception 'Original warehouse label print job is incomplete and cannot be reprinted';
    end if;
    if p_reprint_source_item_ids is null
      or cardinality(p_reprint_source_item_ids) <> p_requested_quantity
      or exists (
        select 1
        from unnest(p_reprint_source_item_ids) as source(item_id)
        group by source.item_id
        having count(*) > 1
      ) then
      raise exception 'Reprint source item selection must match the requested quantity';
    end if;
    select count(*) into v_selected_item_count
      from unnest(p_reprint_source_item_ids) as selected(item_id)
      join public.warehouse_label_print_items as item
        on item.id = selected.item_id
       and item.job_id = v_original.id;
    if v_selected_item_count <> p_requested_quantity then
      raise exception 'Every reprint source item must belong to the original warehouse label job';
    end if;
    select coalesce(jsonb_agg(item.payload_snapshot order by selected.ordinality), '[]'::jsonb)
      into v_original_item_payloads
      from unnest(p_reprint_source_item_ids) with ordinality as selected(item_id, ordinality)
      join public.warehouse_label_print_items as item
        on item.id = selected.item_id
       and item.job_id = v_original.id;
    if v_original.template_id <> p_template_id
      or v_original.payload_snapshot is distinct from p_payload_snapshot
      or v_original_item_payloads is distinct from p_item_payload_snapshots then
      raise exception 'A reprint must reuse the original audited label payload';
    end if;
  end if;

  insert into public.warehouse_label_print_jobs(
    template_id,
    payload_snapshot,
    requested_quantity,
    created_by,
    reprint_of_job_id,
    reprint_reason
  ) values (
    p_template_id,
    p_payload_snapshot,
    p_requested_quantity,
    p_actor_id,
    p_reprint_of_job_id,
    nullif(trim(coalesce(p_reprint_reason, '')), '')
  ) returning id into v_job_id;

  insert into public.warehouse_label_print_items(job_id, sequence, payload_snapshot, source_item_id)
  select
    v_job_id,
    item.ordinality::integer,
    item.payload_snapshot,
    case
      when p_reprint_source_item_ids is null then null
      else p_reprint_source_item_ids[item.ordinality::integer]
    end
  from jsonb_array_elements(p_item_payload_snapshots) with ordinality as item(payload_snapshot, ordinality);

  return v_job_id;
end;
$$;

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
  select * into v_session from public.warehouse_receipt_sessions where id = p_session_id for update;
  if v_session.id is null or v_session.status <> 'confirmed' or v_session.staging_location <> 'BNE-RECEIVING-STAGING' then
    raise exception 'A confirmed warehouse receipt in BNE-RECEIVING-STAGING is required';
  end if;
  select line.product_id, line.sku, line.product_barcode, line.actual_quantity into v_line
    from public.warehouse_receipt_session_lines as line
    where line.receipt_session_id = v_session.id and upper(trim(line.product_barcode)) = upper(trim(p_product_barcode));
  if v_line.product_id is null then
    raise exception 'Product barcode is outside the confirmed receipt scope';
  end if;
  select coalesce(sum(quantity), 0) into v_moved_quantity from public.stock_movements
    where movement_type = 'putaway' and reference_type = 'warehouse_receipt_putaway'
      and reference_id = v_session.id::text and product_id = v_line.product_id;
  v_remaining_quantity := v_line.actual_quantity - v_moved_quantity;
  select id into v_existing_movement_id from public.stock_movements where idempotency_key = p_idempotency_key;
  if v_existing_movement_id is not null then
    return jsonb_build_object('movement_id', v_existing_movement_id, 'remaining_quantity', v_remaining_quantity);
  end if;
  if v_remaining_quantity < p_quantity then
    raise exception 'Putaway quantity exceeds the receipt''s remaining staged quantity';
  end if;

  select id into v_source_location_id from public.inventory_locations
    where location_code = 'BNE-RECEIVING-STAGING' and barcode = 'DMLOC:BNE-RECEIVING-STAGING'
      and status = 'active' and is_putaway_destination = false for update;
  if v_source_location_id is null then
    raise exception 'Registered BNE-RECEIVING-STAGING source was not found';
  end if;
  select id into v_destination_location_id from public.inventory_locations
    where location_code = upper(trim(p_destination_location_code))
      and status = 'active' and is_putaway_destination = true for update;
  if v_destination_location_id is null then
    raise exception 'Destination location % is not an active registered putaway destination', v_destination_location_code;
  end if;
  select id into v_batch_id from public.inventory_batches
    where product_id = v_line.product_id and batch_no = 'REC-' || v_session.id::text;
  if v_batch_id is null then
    raise exception 'Receipt staging batch was not found';
  end if;
  select * into v_source_balance from public.inventory_balances
    where product_id = v_line.product_id and location_id = v_source_location_id and batch_id = v_batch_id for update;
  if v_source_balance.id is null or v_source_balance.on_hand < p_quantity or v_source_balance.quarantine < p_quantity then
    raise exception 'Not enough quarantined stock remains in BNE-RECEIVING-STAGING';
  end if;
  insert into public.inventory_balances(product_id, location_id, batch_id, on_hand, reserved, quarantine)
    values (v_line.product_id, v_destination_location_id, v_batch_id, 0, 0, 0)
    on conflict (product_id, location_id, batch_id) do nothing;
  select * into v_destination_balance from public.inventory_balances
    where product_id = v_line.product_id and location_id = v_destination_location_id and batch_id = v_batch_id for update;
  update public.inventory_balances set on_hand = on_hand - p_quantity, quarantine = quarantine - p_quantity where id = v_source_balance.id;
  update public.inventory_balances set on_hand = on_hand + p_quantity where id = v_destination_balance.id;
  insert into public.stock_movements(product_id, batch_id, movement_type, quantity, from_location_id, to_location_id, reference_type, reference_id, created_by, idempotency_key)
    values (v_line.product_id, v_batch_id, 'putaway', p_quantity, v_source_location_id, v_destination_location_id, 'warehouse_receipt_putaway', v_session.id::text, p_actor_id, p_idempotency_key)
    returning id into v_movement_id;
  select coalesce(sum(quantity), 0) into v_moved_quantity from public.stock_movements
    where movement_type = 'putaway' and reference_type = 'warehouse_receipt_putaway'
      and reference_id = v_session.id::text and product_id = v_line.product_id;
  insert into public.audit_events(entity_type, entity_id, action, actor_id, after_value, idempotency_key)
    values ('warehouse_receipt_session', v_session.id::text, 'warehouse_putaway_confirmed', p_actor_id,
      jsonb_build_object('product_barcode', upper(trim(p_product_barcode)), 'quantity', p_quantity, 'source_location', 'BNE-RECEIVING-STAGING', 'destination_location', v_destination_location_code),
      'warehouse-putaway:' || p_idempotency_key);
  return jsonb_build_object('movement_id', v_movement_id, 'remaining_quantity', greatest(v_line.actual_quantity - v_moved_quantity, 0));
end;
$$;

revoke all on function public.dm_putaway_warehouse_receipt(uuid, text, text, integer, text, uuid) from public;

create or replace function public.dm_record_warehouse_label_print_outcome(
  p_job_id uuid,
  p_outcome text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.warehouse_label_print_jobs%rowtype;
  v_item_count integer;
  v_completed_job_id uuid;
begin
  if p_outcome not in ('printed', 'cancelled') then
    raise exception 'Unsupported warehouse label print outcome';
  end if;
  select * into v_job
    from public.warehouse_label_print_jobs
    where id = p_job_id
    for update;
  if v_job.id is null or v_job.status <> 'pending' then
    return null;
  end if;
  select count(*) into v_item_count
    from public.warehouse_label_print_items
    where job_id = v_job.id;
  if v_item_count <> v_job.requested_quantity then
    return null;
  end if;

  update public.warehouse_label_print_jobs
    set status = p_outcome,
        printed_at = case when p_outcome = 'printed' then now() else null end,
        cancelled_at = case when p_outcome = 'cancelled' then now() else null end
    where id = v_job.id
    returning id into v_completed_job_id;
  return v_completed_job_id;
end;
$$;

revoke all on function public.dm_create_warehouse_label_print_job_with_items(
  text, jsonb, integer, jsonb, uuid, uuid, text, uuid[]
) from public;
revoke all on function public.dm_record_warehouse_label_print_outcome(uuid, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.dm_create_warehouse_label_print_job_with_items(
      text, jsonb, integer, jsonb, uuid, uuid, text, uuid[]
    ) to service_role;
    grant execute on function public.dm_record_warehouse_label_print_outcome(uuid, text) to service_role;
    grant execute on function public.dm_putaway_warehouse_receipt(uuid, text, text, integer, text, uuid) to service_role;
  end if;
end;
$$;

-- v19 staff account lifecycle.
create or replace function public.dm_set_user_profile_lifecycle_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, new.created_by, auth.uid());
    new.updated_at := coalesce(new.updated_at, new.created_at, now());
  else
    if new.created_at is distinct from old.created_at
      or new.created_by is distinct from old.created_by then
      raise exception 'Staff account creation fields cannot be changed';
    end if;

    if old.account_status <> 'disabled' and new.account_status = 'disabled' then
      if coalesce(trim(new.disabled_reason), '') = '' then
        raise exception 'A reason is required to disable a staff account';
      end if;
      new.status_before_disabled := old.account_status;
      new.requires_reauthentication := true;
      new.disabled_at := coalesce(new.disabled_at, now());
      new.disabled_by := coalesce(new.disabled_by, auth.uid());
      if new.disabled_by is null then
        raise exception 'The disabling administrator is required';
      end if;
    elsif old.account_status = 'disabled' and new.account_status <> 'disabled' then
      new.account_status := old.status_before_disabled;
      new.disabled_at := null;
      new.disabled_by := null;
      new.disabled_reason := null;
      new.status_before_disabled := null;
    elsif old.account_status = 'disabled' and new.account_status = 'disabled' then
      if new.disabled_at is distinct from old.disabled_at
        or new.disabled_by is distinct from old.disabled_by
        or new.disabled_reason is distinct from old.disabled_reason
        or new.status_before_disabled is distinct from old.status_before_disabled then
        raise exception 'Disabled staff account evidence cannot be changed';
      end if;
    end if;

    if new.role is distinct from old.role then
      new.requires_reauthentication := true;
    end if;

    if old.account_status = 'pending_first_login'
      and new.account_status = 'active'
      and (
        new.must_change_password
        or new.password_changed_at is null
        or new.password_changed_at is not distinct from old.password_changed_at
      ) then
      raise exception 'A recorded password change is required to activate this staff account';
    end if;

    new.updated_at := now();
    new.updated_by := coalesce(new.updated_by, auth.uid(), old.updated_by);
  end if;

  if new.role not in ('warehouse_staff', 'partner', 'admin') then
    if new.account_status <> 'active'
      or new.must_change_password
      or new.temporary_password_issued_at is not null
      or new.temporary_password_expires_at is not null
      or new.disabled_at is not null
      or new.disabled_by is not null
      or new.disabled_reason is not null
      or new.status_before_disabled is not null
      or new.requires_reauthentication then
      raise exception 'Staff lifecycle fields are available only to staff roles';
    end if;
    return new;
  end if;

  if new.must_change_password then
    if new.temporary_password_issued_at is null then
      raise exception 'Temporary password issue time is required';
    end if;
    new.temporary_password_expires_at :=
      new.temporary_password_issued_at + interval '7 days';
  else
    new.temporary_password_issued_at := null;
    new.temporary_password_expires_at := null;
  end if;

  if new.account_status = 'pending_first_login' and not new.must_change_password then
    raise exception 'Pending first login requires a temporary password change';
  end if;
  if new.account_status = 'active' and new.must_change_password then
    raise exception 'An active staff account cannot retain a temporary password';
  end if;

  return new;
end;
$$;

create or replace function public.dm_audit_user_profile_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op = 'INSERT' then
    if new.role not in ('warehouse_staff', 'partner', 'admin') then
      return new;
    end if;
    v_action := 'staff_account_created';
  elsif new.role is distinct from old.role then
    v_action := 'staff_role_changed';
  elsif new.account_status is distinct from old.account_status then
    v_action := case
      when new.account_status = 'disabled' then 'staff_account_disabled'
      when old.account_status = 'disabled' then 'staff_account_reenabled'
      when new.account_status = 'pending_first_login' then 'staff_password_reset_required'
      else 'staff_first_password_completed'
    end;
  elsif new.last_login_at is distinct from old.last_login_at then
    v_action := 'staff_login_recorded';
  elsif new.password_changed_at is distinct from old.password_changed_at then
    v_action := 'staff_password_changed';
  elsif new.display_name is distinct from old.display_name then
    v_action := 'staff_profile_updated';
  else
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_before := jsonb_build_object(
      'role', old.role,
      'account_status', old.account_status,
      'must_change_password', old.must_change_password,
      'requires_reauthentication', old.requires_reauthentication,
      'disabled_reason', old.disabled_reason,
      'display_name', old.display_name,
      'last_login_at', old.last_login_at,
      'created_at', old.created_at,
      'updated_at', old.updated_at
    );
  end if;
  v_after := jsonb_build_object(
    'role', new.role,
    'account_status', new.account_status,
    'must_change_password', new.must_change_password,
    'requires_reauthentication', new.requires_reauthentication,
    'disabled_reason', new.disabled_reason,
    'display_name', new.display_name,
    'last_login_at', new.last_login_at,
    'created_at', new.created_at,
    'updated_at', new.updated_at
  );

  insert into public.audit_events (
    entity_type,
    entity_id,
    action,
    actor_id,
    before_value,
    after_value
  ) values (
    'staff_account',
    new.id::text,
    v_action,
    coalesce(new.updated_by, new.created_by, auth.uid()),
    v_before,
    v_after
  );
  return new;
end;
$$;

drop trigger if exists user_profiles_lifecycle_fields on public.user_profiles;
create trigger user_profiles_lifecycle_fields
  before insert or update on public.user_profiles
  for each row execute function public.dm_set_user_profile_lifecycle_fields();

drop trigger if exists user_profiles_lifecycle_audit on public.user_profiles;
create trigger user_profiles_lifecycle_audit
  after insert or update on public.user_profiles
  for each row execute function public.dm_audit_user_profile_lifecycle();

drop policy if exists "users can read own profile" on public.user_profiles;
create policy "users can read own profile"
on public.user_profiles for select
to authenticated
using (id = (select auth.uid()) or public.current_user_role() = 'admin');

revoke insert, update, delete on public.user_profiles from anon, authenticated;
revoke all on function public.dm_set_user_profile_lifecycle_fields() from public, anon, authenticated;
revoke all on function public.dm_audit_user_profile_lifecycle() from public, anon, authenticated;
