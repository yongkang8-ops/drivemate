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
  role text not null check (role in ('public', 'trade', 'partner', 'admin')),
  display_name text,
  created_at timestamptz not null default now()
);

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
