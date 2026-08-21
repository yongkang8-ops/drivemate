create extension if not exists pgcrypto;

-- Product release gates and auditable source metadata.
alter table public.products
  add column if not exists part_name_zh text,
  add column if not exists supplier_part_number text,
  add column if not exists cross_references text[] not null default '{}',
  add column if not exists quality text,
  add column if not exists origin_country text,
  add column if not exists unit text,
  add column if not exists position text,
  add column if not exists source_fitment_text text,
  add column if not exists packaging jsonb not null default '{}'::jsonb,
  add column if not exists warranty text,
  add column if not exists risk_tier text not null default 'low',
  add column if not exists hs_code text,
  add column if not exists chafta_status text not null default 'unverified',
  add column if not exists source_evidence jsonb not null default '[]'::jsonb,
  add column if not exists supply_status text not null default 'on_order',
  add column if not exists compliance_status text not null default 'pending',
  add column if not exists fitment_status text not null default 'vin_pending',
  add column if not exists pricing_status text not null default 'price_pending',
  add column if not exists commercial_status text not null default 'inactive',
  add column if not exists public_visibility boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.products drop constraint if exists products_risk_tier_check;
alter table public.products add constraint products_risk_tier_check
  check (risk_tier in ('low', 'medium', 'high'));
alter table public.products drop constraint if exists products_chafta_status_check;
alter table public.products add constraint products_chafta_status_check
  check (chafta_status in ('unverified', 'eligible', 'ineligible', 'broker_review'));
alter table public.products drop constraint if exists products_supply_status_check;
alter table public.products add constraint products_supply_status_check
  check (supply_status in ('on_order', 'part_received', 'received', 'discontinued'));
alter table public.products drop constraint if exists products_compliance_status_check;
alter table public.products add constraint products_compliance_status_check
  check (compliance_status in ('pending', 'china_docs_approved', 'australia_acceptance_approved', 'approved', 'rejected'));
alter table public.products drop constraint if exists products_fitment_status_check;
alter table public.products add constraint products_fitment_status_check
  check (fitment_status in ('vin_pending', 'manual_review', 'approved', 'conflict'));
alter table public.products drop constraint if exists products_pricing_status_check;
alter table public.products add constraint products_pricing_status_check
  check (pricing_status in ('price_pending', 'approved', 'paused'));
alter table public.products drop constraint if exists products_commercial_status_check;
alter table public.products add constraint products_commercial_status_check
  check (commercial_status in ('inactive', 'active', 'paused'));

create unique index if not exists products_oem_part_number_unique
  on public.products (upper(oem_part_number)) where oem_part_number is not null;
create index if not exists products_release_gate_idx
  on public.products (commercial_status, public_visibility, compliance_status, fitment_status, pricing_status);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  country_code text not null default 'CN',
  default_currency text not null default 'CNY',
  tax_identifier text,
  contact_name text,
  contact_email text,
  contact_phone text,
  address jsonb not null default '{}'::jsonb,
  source_evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists suppliers_legal_name_unique on public.suppliers (lower(legal_name));

create table if not exists public.data_import_runs (
  id uuid primary key default gen_random_uuid(),
  import_type text not null,
  source_file_name text not null,
  source_sha256 text not null,
  source_version text,
  supplemental_sha256 text,
  status text not null default 'previewed'
    check (status in ('previewed', 'committed', 'failed', 'rolled_back')),
  row_count int not null default 0,
  success_count int not null default 0,
  failure_count int not null default 0,
  failure_rows jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  idempotency_key text,
  previewed_by uuid references auth.users(id),
  committed_by uuid references auth.users(id),
  previewed_at timestamptz not null default now(),
  committed_at timestamptz,
  unique (import_type, source_sha256)
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  contract_number text not null unique,
  supplier_id uuid not null references public.suppliers(id),
  currency text not null default 'CNY',
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  final_total_minor bigint not null check (final_total_minor >= 0),
  vat_recoverable boolean not null default false,
  status text not null default 'confirmed'
    check (status in ('draft', 'confirmed', 'in_transit', 'part_received', 'received', 'closed', 'cancelled')),
  source_import_run_id uuid not null references public.data_import_runs(id),
  source_evidence jsonb not null default '[]'::jsonb,
  ordered_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  source_row_number int not null,
  supplier_part_number text not null,
  quantity int not null check (quantity > 0),
  unit text not null,
  unit_price_incl_vat_minor bigint not null check (unit_price_incl_vat_minor >= 0),
  original_amount_minor bigint not null check (original_amount_minor >= 0),
  allocated_discount_minor bigint not null default 0 check (allocated_discount_minor >= 0),
  cash_purchase_cost_minor bigint not null check (cash_purchase_cost_minor >= 0),
  source_evidence jsonb not null default '[]'::jsonb,
  unique (purchase_order_id, source_row_number),
  unique (purchase_order_id, supplier_part_number)
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id),
  shipment_reference text not null unique,
  mode text,
  incoterm text,
  origin text,
  destination text,
  status text not null default 'planned'
    check (status in ('planned', 'booked', 'departed', 'arrived', 'customs_hold', 'released', 'delivered', 'closed')),
  departed_at timestamptz,
  arrived_at timestamptz,
  source_evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.shipment_pallets (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  pallet_number text not null,
  length_mm int,
  width_mm int,
  height_mm int,
  gross_weight_grams bigint,
  source_evidence jsonb not null default '[]'::jsonb,
  unique (shipment_id, pallet_number)
);

create table if not exists public.shipment_cartons (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  pallet_id uuid references public.shipment_pallets(id),
  carton_number text not null,
  carton_count int not null default 1 check (carton_count > 0),
  length_mm int,
  width_mm int,
  height_mm int,
  gross_weight_grams bigint,
  source_evidence jsonb not null default '[]'::jsonb,
  unique (shipment_id, carton_number)
);
alter table public.shipment_cartons add column if not exists carton_count int not null default 1 check (carton_count > 0);

create table if not exists public.shipment_carton_lines (
  id uuid primary key default gen_random_uuid(),
  carton_id uuid not null references public.shipment_cartons(id) on delete cascade,
  purchase_order_line_id uuid not null references public.purchase_order_lines(id),
  quantity int not null check (quantity > 0),
  source_evidence jsonb not null default '[]'::jsonb,
  unique (carton_id, purchase_order_line_id)
);

create table if not exists public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id),
  receipt_number text not null unique,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'cancelled')),
  received_by uuid references auth.users(id),
  received_at timestamptz not null default now(),
  idempotency_key text not null unique,
  notes text
);

create table if not exists public.goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references public.goods_receipts(id) on delete cascade,
  purchase_order_line_id uuid not null references public.purchase_order_lines(id),
  inventory_batch_id uuid references public.inventory_batches(id),
  expected_quantity int not null check (expected_quantity >= 0),
  received_quantity int not null check (received_quantity >= 0),
  damaged_quantity int not null default 0 check (damaged_quantity >= 0),
  quarantined_quantity int not null default 0 check (quarantined_quantity >= 0),
  short_received_quantity int not null default 0 check (short_received_quantity >= 0),
  over_received_quantity int not null default 0 check (over_received_quantity >= 0),
  evidence jsonb not null default '[]'::jsonb,
  unique (goods_receipt_id, purchase_order_line_id)
);
alter table public.goods_receipt_lines
  add column if not exists short_received_quantity int not null default 0 check (short_received_quantity >= 0),
  add column if not exists over_received_quantity int not null default 0 check (over_received_quantity >= 0);

create table if not exists public.landed_costs (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id),
  version int not null default 1,
  status text not null default 'provisional' check (status in ('provisional', 'final', 'superseded')),
  currency text not null default 'AUD',
  allocation_basis text not null default 'value' check (allocation_basis in ('value', 'quantity', 'weight', 'volume', 'manual')),
  domestic_logistics_minor bigint not null default 0,
  ocean_freight_minor bigint not null default 0,
  insurance_minor bigint not null default 0,
  duty_minor bigint not null default 0,
  import_gst_minor bigint not null default 0,
  brokerage_minor bigint not null default 0,
  port_charges_minor bigint not null default 0,
  australia_delivery_minor bigint not null default 0,
  other_costs_minor bigint not null default 0,
  source_evidence jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (shipment_id, version)
);

create table if not exists public.landed_cost_allocations (
  id uuid primary key default gen_random_uuid(),
  landed_cost_id uuid not null references public.landed_costs(id) on delete cascade,
  purchase_order_line_id uuid not null references public.purchase_order_lines(id),
  allocated_minor bigint not null default 0,
  allocated_cash_minor bigint not null default 0,
  allocated_cogs_minor bigint not null default 0,
  basis_value numeric,
  unique (landed_cost_id, purchase_order_line_id)
);
alter table public.landed_cost_allocations
  add column if not exists allocated_cash_minor bigint not null default 0,
  add column if not exists allocated_cogs_minor bigint not null default 0;

create table if not exists public.compliance_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  review_type text not null check (review_type in ('china_docs', 'australia_acceptance', 'fitment', 'pricing')),
  outcome text not null check (outcome in ('pending', 'approved', 'rejected', 'more_information')),
  reviewer_id uuid references auth.users(id),
  evidence jsonb not null default '[]'::jsonb,
  notes text,
  reviewed_at timestamptz not null default now()
);
create index if not exists compliance_reviews_product_idx
  on public.compliance_reviews (product_id, review_type, reviewed_at desc);

create table if not exists public.vehicle_configurations (
  id uuid primary key default gen_random_uuid(),
  make text not null,
  model text not null,
  year int not null,
  engine text,
  variant text,
  market text not null default 'AU',
  status text not null default 'pending' check (status in ('pending', 'approved', 'conflict', 'retired')),
  source_evidence jsonb not null default '[]'::jsonb,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  vin text not null unique check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  vehicle_configuration_id uuid not null references public.vehicle_configurations(id),
  source text not null,
  notes text,
  source_import_run_id uuid references public.data_import_runs(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.vehicle_lookup_requests drop constraint if exists vehicle_lookup_requests_confidence_check;
alter table public.vehicle_lookup_requests add constraint vehicle_lookup_requests_confidence_check
  check (confidence in ('exact', 'manual_review'));

create table if not exists public.audit_events (
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
create index if not exists audit_events_entity_idx on public.audit_events (entity_type, entity_id, created_at desc);

alter table public.trade_accounts
  add column if not exists credit_limit_cents int not null default 100000,
  add column if not exists current_balance_cents int not null default 0,
  add column if not exists overdue_balance_cents int not null default 0,
  add column if not exists terms_days int not null default 30,
  add column if not exists credit_status text not null default 'active',
  add column if not exists privacy_consent_at timestamptz,
  add column if not exists trade_terms_consent_at timestamptz,
  add column if not exists consent_version text;
alter table public.trade_accounts drop constraint if exists trade_accounts_credit_status_check;
alter table public.trade_accounts add constraint trade_accounts_credit_status_check
  check (credit_status in ('active', 'hold', 'closed'));
create unique index if not exists trade_accounts_contact_email_unique
  on public.trade_accounts (lower(contact_email)) where contact_email is not null and status <> 'closed';
create unique index if not exists trade_accounts_abn_unique
  on public.trade_accounts (regexp_replace(abn, '[^0-9]', '', 'g')) where abn is not null and abn <> '' and status <> 'closed';

alter table public.sales_orders
  add column if not exists idempotency_key text,
  add column if not exists delivery_charge_ex_gst_cents int not null default 0,
  add column if not exists carrier text,
  add column if not exists tracking_number text,
  add column if not exists dispatched_at timestamptz,
  add column if not exists payment_due_at timestamptz,
  add column if not exists invoice_status text not null default 'not_issued';
alter table public.sales_orders drop constraint if exists sales_orders_invoice_status_check;
alter table public.sales_orders add constraint sales_orders_invoice_status_check
  check (invoice_status in ('not_issued', 'issued', 'part_paid', 'paid', 'credited', 'void'));
create unique index if not exists sales_orders_idempotency_key_unique
  on public.sales_orders (idempotency_key) where idempotency_key is not null;

alter table public.sales_order_lines drop constraint if exists sales_order_lines_status_check;
alter table public.sales_order_lines add constraint sales_order_lines_status_check
  check (status in ('open', 'reserved', 'part_picked', 'picked', 'backordered', 'cancelled'));

create table if not exists public.sales_order_allocations (
  id uuid primary key default gen_random_uuid(),
  sales_order_line_id uuid not null references public.sales_order_lines(id) on delete cascade,
  inventory_balance_id uuid not null references public.inventory_balances(id),
  quantity int not null check (quantity > 0),
  picked_quantity int not null default 0 check (picked_quantity >= 0),
  dispatched_quantity int not null default 0 check (dispatched_quantity >= 0),
  created_at timestamptz not null default now(),
  unique (sales_order_line_id, inventory_balance_id)
);

create table if not exists public.account_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  trade_account_id uuid not null references public.trade_accounts(id),
  sales_order_id uuid references public.sales_orders(id),
  entry_type text not null check (entry_type in ('invoice', 'payment', 'credit_adjustment', 'debit_adjustment', 'rebate')),
  amount_cents int not null check (amount_cents <> 0),
  reference text not null,
  notes text,
  effective_at timestamptz not null default now(),
  due_at timestamptz,
  created_by uuid references auth.users(id),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists account_ledger_account_idx on public.account_ledger_entries(trade_account_id, effective_at);

create table if not exists public.rma_requests (
  id uuid primary key default gen_random_uuid(),
  rma_number text not null unique,
  trade_account_id uuid not null references public.trade_accounts(id),
  sales_order_id uuid not null references public.sales_orders(id),
  reason_type text not null check (reason_type in ('quality', 'incorrect_fitment', 'damaged_delivery', 'other')),
  responsibility text not null check (responsibility in ('drivemate', 'workshop', 'carrier', 'pending_review')),
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'in_transit', 'received_quarantine', 'inspected', 'credited', 'closed')),
  requested_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  notes text,
  evidence jsonb not null default '[]'::jsonb,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rma_requests add column if not exists idempotency_key text;
create unique index if not exists rma_requests_idempotency_unique on public.rma_requests(idempotency_key) where idempotency_key is not null;

create table if not exists public.rma_lines (
  id uuid primary key default gen_random_uuid(),
  rma_request_id uuid not null references public.rma_requests(id) on delete cascade,
  sales_order_line_id uuid not null references public.sales_order_lines(id),
  quantity int not null check (quantity > 0),
  received_quantity int not null default 0 check (received_quantity >= 0),
  inspection_outcome text check (inspection_outcome in ('pending', 'quality_confirmed', 'no_fault_found', 'customer_fitment_error', 'carrier_damage')),
  unique (rma_request_id, sales_order_line_id)
);

alter table public.account_documents drop constraint if exists account_documents_document_type_check;
alter table public.account_documents add constraint account_documents_document_type_check
  check (document_type in ('order_confirmation', 'invoice', 'credit_note', 'statement', 'delivery_record'));

create or replace function public.dm_product_is_sellable(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.products p
    where p.id = p_product_id
      and p.commercial_status = 'active'
      and p.compliance_status = 'approved'
      and p.fitment_status = 'approved'
      and p.pricing_status = 'approved'
      and exists (
        select 1 from public.pricing_rules pr
        where pr.sku = p.sku and pr.status = 'active' and pr.unit_price_ex_gst_cents > 0
      )
  );
$$;

create or replace function public.dm_commit_purchase_import(
  p_payload jsonb,
  p_actor_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_existing record;
  v_supplier_id uuid;
  v_po_id uuid;
  v_shipment_id uuid;
  v_line jsonb;
  v_product_id uuid;
  v_po_line_id uuid;
  v_pallet jsonb;
  v_carton jsonb;
  v_pallet_id uuid;
  v_carton_id uuid;
  v_count int;
  v_quantity int;
  v_subtotal bigint;
  v_discount bigint;
  v_final bigint;
begin
  if p_payload->>'sourceSha256' <> 'F7C6F6BB4576CCCA62221E50D27E2FCCF3CAB3C46F9889404F87C0B59E9ABB4C' then
    raise exception 'Authoritative PI hash mismatch';
  end if;
  if p_payload->>'contractNumber' <> 'AJG-YJ-GWM-202608-01' then
    raise exception 'Contract number mismatch';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' then raise exception 'Idempotency key is required'; end if;

  select * into v_existing
  from public.data_import_runs
  where import_type = 'purchase_order' and source_sha256 = p_payload->>'sourceSha256';
  if v_existing.id is not null then
    if v_existing.status = 'committed' then return v_existing.id; end if;
    raise exception 'An incomplete import run already exists for this source file';
  end if;

  select count(*),
         coalesce(sum((value->>'quantity')::int), 0),
         coalesce(sum((value->>'originalAmountMinor')::bigint), 0),
         coalesce(sum((value->>'allocatedDiscountMinor')::bigint), 0),
         coalesce(sum((value->>'cashPurchaseCostMinor')::bigint), 0)
    into v_count, v_quantity, v_subtotal, v_discount, v_final
  from jsonb_array_elements(p_payload->'lines');
  if v_count <> 119 or v_quantity <> 706
    or v_final <> v_subtotal - v_discount
    or v_subtotal <> (p_payload->'summary'->>'subtotalMinor')::bigint
    or v_discount <> (p_payload->'summary'->>'discountMinor')::bigint
    or v_final <> (p_payload->'summary'->>'finalTotalMinor')::bigint then
    raise exception 'Purchase import control totals failed';
  end if;
  if (select count(distinct upper(value->>'partNumber')) from jsonb_array_elements(p_payload->'lines')) <> 119 then
    raise exception 'Part Numbers are not unique';
  end if;

  insert into public.data_import_runs (
    import_type, source_file_name, source_sha256, source_version, supplemental_sha256,
    status, row_count, success_count, summary, idempotency_key, previewed_by,
    committed_by, committed_at
  ) values (
    'purchase_order', p_payload->>'sourceFileName', p_payload->>'sourceSha256',
    p_payload->>'sourceVersion', nullif(p_payload->>'supplementalSha256',''),
    'committed', v_count, v_count, p_payload->'summary', p_idempotency_key,
    p_actor_id, p_actor_id, now()
  ) returning id into v_run_id;

  select id into v_supplier_id from public.suppliers where lower(legal_name) = lower(p_payload->>'supplierName');
  if v_supplier_id is null then
    insert into public.suppliers(legal_name, country_code, default_currency, source_evidence)
      values (p_payload->>'supplierName', 'CN', 'CNY', jsonb_build_array(jsonb_build_object(
        'file', p_payload->>'sourceFileName', 'sha256', p_payload->>'sourceSha256', 'row', 3
      ))) returning id into v_supplier_id;
  end if;

  insert into public.purchase_orders (
    contract_number, supplier_id, currency, subtotal_minor, discount_minor, final_total_minor,
    vat_recoverable, status, source_import_run_id, source_evidence, ordered_at
  ) values (
    p_payload->>'contractNumber', v_supplier_id, 'CNY', v_subtotal, v_discount, v_final,
    false, 'confirmed', v_run_id, jsonb_build_array(jsonb_build_object(
      'file', p_payload->>'sourceFileName', 'sha256', p_payload->>'sourceSha256'
    )), '2026-08-20'
  ) returning id into v_po_id;

  for v_line in select * from jsonb_array_elements(p_payload->'lines')
  loop
    if exists (select 1 from public.products where sku = v_line->>'sku' or upper(oem_part_number) = upper(v_line->>'partNumber')) then
      raise exception 'SKU or Part Number already exists: % / %', v_line->>'sku', v_line->>'partNumber';
    end if;
    insert into public.products (
      sku, brand, part_name, part_name_zh, category, oem_part_number, supplier_part_number,
      quality, origin_country, unit, position, source_fitment_text, packaging, risk_tier,
      source_evidence, status, supply_status, compliance_status, fitment_status,
      pricing_status, commercial_status, public_visibility, reorder_point, reorder_quantity
    ) values (
      v_line->>'sku', 'GWM', v_line->>'nameEn', v_line->>'nameZh', v_line->>'category',
      v_line->>'partNumber', v_line->>'partNumber', v_line->>'quality', v_line->>'originCountry',
      v_line->>'unit', nullif(v_line->>'position',''), v_line->>'sourceFitmentText',
      coalesce(v_line->'packaging','{}'::jsonb), v_line->>'riskTier',
      coalesce(v_line->'sourceEvidence','[]'::jsonb), 'draft', 'on_order', 'pending',
      'vin_pending', 'price_pending', 'inactive', false, 0, 0
    ) returning id into v_product_id;

    insert into public.purchase_order_lines (
      purchase_order_id, product_id, source_row_number, supplier_part_number, quantity, unit,
      unit_price_incl_vat_minor, original_amount_minor, allocated_discount_minor,
      cash_purchase_cost_minor, source_evidence
    ) values (
      v_po_id, v_product_id, (v_line->>'sourceRowNumber')::int, v_line->>'partNumber',
      (v_line->>'quantity')::int, v_line->>'unit', (v_line->>'unitPriceInclVatMinor')::bigint,
      (v_line->>'originalAmountMinor')::bigint, (v_line->>'allocatedDiscountMinor')::bigint,
      (v_line->>'cashPurchaseCostMinor')::bigint, coalesce(v_line->'sourceEvidence','[]'::jsonb)
    ) returning id into v_po_line_id;

    insert into public.audit_events (
      entity_type, entity_id, action, actor_id, after_value, source_file, source_hash,
      source_row_number, idempotency_key
    ) values (
      'product', v_product_id::text, 'purchase_import_created', p_actor_id,
      jsonb_build_object('sku',v_line->>'sku','part_number',v_line->>'partNumber','supply_status','on_order'),
      p_payload->>'sourceFileName', p_payload->>'sourceSha256',
      (v_line->>'sourceRowNumber')::int, p_idempotency_key || ':' || (v_line->>'sourceRowNumber')
    );
  end loop;

  if jsonb_array_length(coalesce(p_payload->'cartons','[]'::jsonb)) > 0 then
    insert into public.shipments (
      purchase_order_id, shipment_reference, status, origin, destination, source_evidence
    ) values (
      v_po_id, (p_payload->>'contractNumber') || '-PACKING', 'planned', 'China', 'Brisbane, QLD',
      jsonb_build_array(jsonb_build_object('file','final_order_data_20260820.json','sha256',p_payload->>'supplementalSha256'))
    ) returning id into v_shipment_id;

    for v_pallet in select * from jsonb_array_elements(coalesce(p_payload->'pallets','[]'::jsonb))
    loop
      insert into public.shipment_pallets (
        shipment_id, pallet_number, length_mm, width_mm, height_mm, gross_weight_grams, source_evidence
      ) values (
        v_shipment_id, v_pallet->>'palletNumber', nullif(v_pallet->>'lengthMm','')::int,
        nullif(v_pallet->>'widthMm','')::int, nullif(v_pallet->>'heightMm','')::int,
        nullif(v_pallet->>'grossWeightGrams','')::bigint,
        jsonb_build_array(jsonb_build_object('file','final_order_data_20260820.json','sha256',p_payload->>'supplementalSha256'))
      );
    end loop;

    for v_carton in select * from jsonb_array_elements(coalesce(p_payload->'cartons','[]'::jsonb))
    loop
      select id into v_pallet_id from public.shipment_pallets
        where shipment_id = v_shipment_id and pallet_number in (v_carton->>'palletNumber', replace(v_carton->>'palletNumber','号托盘','#'))
        limit 1;
      insert into public.shipment_cartons (
        shipment_id, pallet_id, carton_number, carton_count, length_mm, width_mm, height_mm,
        gross_weight_grams, source_evidence
      ) values (
        v_shipment_id, v_pallet_id, v_carton->>'cartonNumber', coalesce(nullif(v_carton->>'cartonCount','')::int, 1), nullif(v_carton->>'lengthMm','')::int,
        nullif(v_carton->>'widthMm','')::int, nullif(v_carton->>'heightMm','')::int,
        nullif(v_carton->>'grossWeightGrams','')::bigint,
        jsonb_build_array(jsonb_build_object('file','final_order_data_20260820.json','sha256',p_payload->>'supplementalSha256'))
      ) returning id into v_carton_id;

      for v_line in
        select value from jsonb_array_elements(p_payload->'lines')
        where value->'packaging'->>'cartonNumber' = v_carton->>'cartonNumber'
      loop
        select pol.id into v_po_line_id
        from public.purchase_order_lines pol
        where pol.purchase_order_id = v_po_id and upper(pol.supplier_part_number) = upper(v_line->>'partNumber');
        insert into public.shipment_carton_lines(carton_id, purchase_order_line_id, quantity, source_evidence)
          values (v_carton_id, v_po_line_id, (v_line->>'quantity')::int,
            jsonb_build_array(jsonb_build_object('file','final_order_data_20260820.json','sha256',p_payload->>'supplementalSha256')));
      end loop;
    end loop;
  end if;

  insert into public.audit_events(entity_type, entity_id, action, actor_id, after_value, source_file, source_hash, idempotency_key)
    values ('purchase_order', v_po_id::text, 'purchase_import_committed', p_actor_id,
      jsonb_build_object('contract_number',p_payload->>'contractNumber','line_count',v_count,'quantity',v_quantity,'final_total_minor',v_final),
      p_payload->>'sourceFileName', p_payload->>'sourceSha256', p_idempotency_key);
  return v_run_id;
end;
$$;

create or replace function public.dm_receive_goods(
  p_shipment_id uuid,
  p_receipt_number text,
  p_lines jsonb,
  p_location_id uuid,
  p_idempotency_key text,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_receipt_id uuid;
  v_line jsonb;
  v_po_line record;
  v_batch_id uuid;
  v_balance_id uuid;
  v_received int;
  v_damaged int;
  v_cumulative int;
begin
  select id into v_existing from public.goods_receipts where idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;
  insert into public.goods_receipts(shipment_id, receipt_number, status, received_by, idempotency_key)
    values (p_shipment_id, p_receipt_number, 'in_progress', p_actor_id, p_idempotency_key)
    returning id into v_receipt_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select pol.*, p.sku into v_po_line
    from public.purchase_order_lines pol
    join public.products p on p.id = pol.product_id
    join public.purchase_orders po on po.id = pol.purchase_order_id
    join public.shipments s on s.purchase_order_id = po.id
    where s.id = p_shipment_id and p.sku = upper(v_line->>'sku')
    for update of pol;
    if v_po_line.id is null then raise exception 'SKU % is not on the shipment PO', v_line->>'sku'; end if;
    v_received := (v_line->>'receivedQuantity')::int;
    v_damaged := coalesce((v_line->>'damagedQuantity')::int, 0);
    if v_received <= 0 or v_damaged < 0 or v_damaged > v_received then raise exception 'Invalid receipt quantity'; end if;

    insert into public.inventory_batches(product_id, batch_no, supplier_name, purchase_ref, received_date)
      values (v_po_line.product_id, p_receipt_number, 'Purchase import', p_receipt_number, current_date)
      on conflict (product_id, batch_no) do update set received_date = excluded.received_date
      returning id into v_batch_id;
    insert into public.inventory_balances(product_id, location_id, batch_id, on_hand, reserved, quarantine)
      values (v_po_line.product_id, p_location_id, v_batch_id, v_received, 0, v_received)
      on conflict (product_id, location_id, batch_id) do update
        set on_hand = public.inventory_balances.on_hand + excluded.on_hand,
            quarantine = public.inventory_balances.quarantine + excluded.quarantine
      returning id into v_balance_id;
    insert into public.goods_receipt_lines(
      goods_receipt_id, purchase_order_line_id, inventory_batch_id, expected_quantity,
      received_quantity, damaged_quantity, quarantined_quantity,
      short_received_quantity, over_received_quantity, evidence
    ) values (
      v_receipt_id, v_po_line.id, v_batch_id, v_po_line.quantity, v_received, v_damaged,
      v_received, greatest(v_po_line.quantity - v_received, 0),
      greatest(v_received - v_po_line.quantity, 0), coalesce(v_line->'evidence','[]'::jsonb)
    );
    insert into public.stock_movements(
      product_id, batch_id, movement_type, quantity, to_location_id, reference_type,
      reference_id, created_by
    ) values (
      v_po_line.product_id, v_batch_id, 'inbound', v_received, p_location_id,
      'goods_receipt', v_receipt_id::text, p_actor_id
    );
    select coalesce(sum(received_quantity),0) into v_cumulative
      from public.goods_receipt_lines where purchase_order_line_id = v_po_line.id;
    update public.products
      set supply_status = case when v_cumulative >= v_po_line.quantity then 'received' else 'part_received' end,
          updated_at = now()
      where id = v_po_line.product_id;
  end loop;
  update public.goods_receipts set status = 'completed' where id = v_receipt_id;
  update public.shipments set status = 'delivered' where id = p_shipment_id;
  return v_receipt_id;
end;
$$;

create or replace function public.dm_release_quarantine(
  p_product_id uuid,
  p_quantity int,
  p_idempotency_key text,
  p_actor_id uuid default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_balance record; v_remaining int := p_quantity; v_release int;
begin
  if exists (select 1 from public.audit_events where idempotency_key = p_idempotency_key and action = 'quarantine_released') then
    return p_quantity;
  end if;
  if not exists (
    select 1 from public.products
    where id = p_product_id and compliance_status = 'approved' and fitment_status = 'approved'
  ) then raise exception 'Compliance and fitment approval are required'; end if;
  for v_balance in
    select * from public.inventory_balances where product_id = p_product_id and quarantine > 0 for update
  loop
    exit when v_remaining <= 0;
    v_release := least(v_remaining, v_balance.quarantine);
    update public.inventory_balances set quarantine = quarantine - v_release where id = v_balance.id;
    v_remaining := v_remaining - v_release;
  end loop;
  if v_remaining > 0 then raise exception 'Quarantine quantity is insufficient'; end if;
  insert into public.audit_events(entity_type, entity_id, action, actor_id, after_value, idempotency_key)
    values ('product', p_product_id::text, 'quarantine_released', p_actor_id, jsonb_build_object('quantity',p_quantity), p_idempotency_key);
  update public.products
    set status = 'active', commercial_status = 'active', public_visibility = true, updated_at = now()
    where id = p_product_id
      and compliance_status = 'approved'
      and fitment_status = 'approved'
      and pricing_status = 'approved';
  return p_quantity;
end;
$$;

create or replace function public.dm_review_product_gate(
  p_sku text,
  p_review_type text,
  p_outcome text,
  p_evidence jsonb,
  p_notes text,
  p_actor_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_product record; v_china boolean; v_au boolean; v_status text;
begin
  select * into v_product from public.products where sku = upper(p_sku) for update;
  if v_product.id is null then raise exception 'SKU was not found'; end if;
  insert into public.compliance_reviews(product_id, review_type, outcome, reviewer_id, evidence, notes)
    values (v_product.id, p_review_type, p_outcome, p_actor_id, coalesce(p_evidence,'[]'::jsonb), p_notes);
  if p_review_type = 'fitment' then
    update public.products set fitment_status = case when p_outcome = 'approved' then 'approved' when p_outcome = 'rejected' then 'conflict' else 'manual_review' end,
      updated_at = now() where id = v_product.id;
    return (select fitment_status from public.products where id = v_product.id);
  end if;

  select exists (
    select 1 from public.compliance_reviews where product_id = v_product.id and review_type = 'china_docs' and outcome = 'approved'
  ), exists (
    select 1 from public.compliance_reviews where product_id = v_product.id and review_type = 'australia_acceptance' and outcome = 'approved'
  ) into v_china, v_au;
  v_status := case
    when p_outcome = 'rejected' then 'rejected'
    when v_product.risk_tier = 'high' and v_china and v_au then 'approved'
    when v_product.risk_tier <> 'high' and v_au then 'approved'
    when v_china then 'china_docs_approved'
    when v_au then 'australia_acceptance_approved'
    else 'pending'
  end;
  update public.products set compliance_status = v_status, updated_at = now() where id = v_product.id;
  return v_status;
end;
$$;

create or replace function public.dm_approve_trade_price(
  p_sku text,
  p_unit_price_ex_gst_cents int,
  p_actor_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_product record; v_rule_id text;
begin
  if p_unit_price_ex_gst_cents <= 0 then raise exception 'Trade price must be positive'; end if;
  select * into v_product from public.products where sku = upper(p_sku) for update;
  if v_product.id is null then raise exception 'SKU was not found'; end if;
  v_rule_id := 'trade-' || lower(v_product.sku);
  insert into public.pricing_rules(id, sku, channel, price_mode, unit_price_ex_gst_cents, status)
    values (v_rule_id, v_product.sku, 'trade', 'fixed', p_unit_price_ex_gst_cents, 'active')
    on conflict (id) do update set unit_price_ex_gst_cents = excluded.unit_price_ex_gst_cents, status = 'active';
  update public.products set pricing_status = 'approved', updated_at = now() where id = v_product.id;
  insert into public.audit_events(entity_type, entity_id, action, actor_id, after_value)
    values ('product',v_product.id::text,'trade_price_approved',p_actor_id,jsonb_build_object('unit_price_ex_gst_cents',p_unit_price_ex_gst_cents));
  return v_product.sku;
end;
$$;

create or replace function public.dm_commit_vin_import(
  p_source_sha256 text,
  p_rows jsonb,
  p_idempotency_key text,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_existing record; v_run_id uuid; v_row jsonb; v_config_id uuid; v_count int;
begin
  select * into v_existing from public.data_import_runs where import_type = 'vin' and source_sha256 = p_source_sha256;
  if v_existing.id is not null and v_existing.status = 'committed' then return v_existing.id; end if;
  select count(*) into v_count from jsonb_array_elements(p_rows);
  if v_count <= 0 then raise exception 'VIN import is empty'; end if;
  if (select count(distinct upper(value->>'vin')) from jsonb_array_elements(p_rows)) <> v_count then raise exception 'VIN import contains duplicates'; end if;
  insert into public.data_import_runs(import_type,source_file_name,source_sha256,source_version,status,row_count,success_count,summary,idempotency_key,previewed_by,committed_by,committed_at)
    values ('vin','vin_import.json',p_source_sha256,to_char(current_date,'YYYY-MM-DD'),'committed',v_count,v_count,jsonb_build_object('vehicles',v_count),p_idempotency_key,p_actor_id,p_actor_id,now())
    returning id into v_run_id;
  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    if upper(v_row->>'vin') !~ '^[A-HJ-NPR-Z0-9]{17}$' then raise exception 'Invalid VIN: %', v_row->>'vin'; end if;
    select id into v_config_id from public.vehicle_configurations
      where lower(make)=lower(v_row->>'make') and lower(model)=lower(v_row->>'model') and year=(v_row->>'year')::int
        and coalesce(lower(engine),'')=coalesce(lower(v_row->>'engine'),'') and coalesce(lower(variant),'')=coalesce(lower(v_row->>'variant'),'')
        and lower(market)=lower(v_row->>'market') limit 1;
    if v_config_id is null then
      insert into public.vehicle_configurations(make,model,year,engine,variant,market,status,source_evidence)
        values (v_row->>'make',v_row->>'model',(v_row->>'year')::int,nullif(v_row->>'engine',''),nullif(v_row->>'variant',''),v_row->>'market','pending',
          jsonb_build_array(jsonb_build_object('source',v_row->>'source','import_hash',p_source_sha256))) returning id into v_config_id;
    end if;
    insert into public.vehicles(vin,vehicle_configuration_id,source,notes,source_import_run_id)
      values (upper(v_row->>'vin'),v_config_id,v_row->>'source',nullif(v_row->>'notes',''),v_run_id);
  end loop;
  return v_run_id;
end;
$$;

create or replace function public.dm_reserve_sales_order(
  p_trade_account_id uuid,
  p_lines jsonb,
  p_idempotency_key text,
  p_po_number text default null,
  p_vehicle_vin text default null,
  p_vehicle_rego text default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_order_id uuid;
  v_line jsonb;
  v_product record;
  v_order_line_id uuid;
  v_balance record;
  v_needed int;
  v_take int;
  v_unit_price int;
  v_subtotal bigint := 0;
  v_gst bigint := 0;
  v_open_exposure bigint := 0;
  v_account record;
begin
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'Idempotency key is required';
  end if;

  select id into v_existing from public.sales_orders where idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  select * into v_account from public.trade_accounts where id = p_trade_account_id for update;
  if v_account.id is null then raise exception 'Trade account was not found'; end if;
  if v_account.current_balance_cents > 0 and exists (
    select 1 from public.account_ledger_entries
    where trade_account_id = p_trade_account_id and entry_type = 'invoice' and due_at < now()
  ) then
    update public.trade_accounts set overdue_balance_cents = current_balance_cents, credit_status = 'hold' where id = p_trade_account_id;
    raise exception 'Trade account has an overdue balance';
  end if;
  if v_account.status <> 'approved' or v_account.credit_status <> 'active' or v_account.overdue_balance_cents > 0 then
    raise exception 'Trade account is not permitted to place orders';
  end if;

  insert into public.sales_orders (
    trade_account_id, status, po_number, vehicle_vin, vehicle_rego, created_by, idempotency_key
  ) values (
    p_trade_account_id, 'submitted', p_po_number, p_vehicle_vin, p_vehicle_rego, p_created_by, p_idempotency_key
  ) returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select p.id, p.sku, pr.unit_price_ex_gst_cents
      into v_product
    from public.products p
    join public.pricing_rules pr on pr.sku = p.sku and pr.status = 'active'
    where p.sku = upper(v_line->>'sku')
    order by pr.created_at desc
    limit 1;

    if v_product.id is null or not public.dm_product_is_sellable(v_product.id) then
      raise exception 'SKU % is not sellable', v_line->>'sku';
    end if;

    v_needed := (v_line->>'quantity')::int;
    if v_needed <= 0 then raise exception 'Order quantity must be positive'; end if;
    v_unit_price := v_product.unit_price_ex_gst_cents;

    insert into public.sales_order_lines (
      sales_order_id, product_id, quantity, unit_price_ex_gst_cents,
      line_total_ex_gst_cents, gst_cents, line_total_inc_gst_cents, status
    ) values (
      v_order_id, v_product.id, v_needed, v_unit_price,
      v_unit_price * v_needed, round(v_unit_price * v_needed * 0.1),
      v_unit_price * v_needed + round(v_unit_price * v_needed * 0.1), 'reserved'
    ) returning id into v_order_line_id;

    for v_balance in
      select ib.*
      from public.inventory_balances ib
      join public.inventory_batches b on b.id = ib.batch_id
      where ib.product_id = v_product.id
        and (ib.on_hand - ib.reserved - ib.quarantine) > 0
      order by b.received_date nulls last, b.batch_no, ib.id
      for update of ib
    loop
      exit when v_needed <= 0;
      v_take := least(v_needed, v_balance.on_hand - v_balance.reserved - v_balance.quarantine);
      update public.inventory_balances set reserved = reserved + v_take where id = v_balance.id;
      insert into public.sales_order_allocations (sales_order_line_id, inventory_balance_id, quantity)
        values (v_order_line_id, v_balance.id, v_take);
      v_needed := v_needed - v_take;
    end loop;

    if v_needed > 0 then raise exception 'Insufficient available stock for SKU %', v_product.sku; end if;
    v_subtotal := v_subtotal + v_unit_price * (v_line->>'quantity')::int;
  end loop;

  v_gst := round(v_subtotal * 0.1);
  select coalesce(sum(total_inc_gst_cents),0) into v_open_exposure
    from public.sales_orders
    where trade_account_id = p_trade_account_id
      and id <> v_order_id
      and status in ('submitted', 'confirmed', 'picked');
  if v_account.current_balance_cents + v_open_exposure + v_subtotal + v_gst > v_account.credit_limit_cents then
    raise exception 'Credit limit exceeded';
  end if;

  update public.sales_orders set
    subtotal_ex_gst_cents = v_subtotal,
    gst_cents = v_gst,
    total_inc_gst_cents = v_subtotal + v_gst,
    status = 'confirmed'
  where id = v_order_id;

  return v_order_id;
end;
$$;

create or replace function public.dm_cancel_sales_order(
  p_order_id uuid,
  p_idempotency_key text,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_order record; v_allocation record;
begin
  if exists (select 1 from public.audit_events where idempotency_key = p_idempotency_key and action = 'order_cancelled') then
    return p_order_id;
  end if;
  select * into v_order from public.sales_orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Order was not found'; end if;
  if v_order.status = 'dispatched' then raise exception 'Dispatched orders cannot be cancelled'; end if;
  if v_order.status = 'cancelled' then return p_order_id; end if;
  for v_allocation in
    select a.* from public.sales_order_allocations a
    join public.sales_order_lines l on l.id = a.sales_order_line_id
    where l.sales_order_id = p_order_id for update of a
  loop
    insert into public.stock_movements(
      product_id, batch_id, movement_type, quantity, from_location_id,
      reference_type, reference_id, created_by
    )
    select ib.product_id, ib.batch_id, 'dispatch',
      (v_allocation.quantity - v_allocation.dispatched_quantity), ib.location_id,
      'dispatch', p_order_id::text, p_actor_id
    from public.inventory_balances ib
    where ib.id = v_allocation.inventory_balance_id;
    update public.inventory_balances
      set reserved = reserved - (v_allocation.quantity - v_allocation.dispatched_quantity)
      where id = v_allocation.inventory_balance_id;
  end loop;
  update public.sales_order_lines set status = 'cancelled' where sales_order_id = p_order_id;
  update public.sales_orders set status = 'cancelled' where id = p_order_id;
  insert into public.audit_events(entity_type, entity_id, action, actor_id, before_value, after_value, idempotency_key)
    values ('sales_order', p_order_id::text, 'order_cancelled', p_actor_id, to_jsonb(v_order), jsonb_build_object('status','cancelled'), p_idempotency_key);
  return p_order_id;
end;
$$;

create or replace function public.dm_dispatch_sales_order(
  p_order_id uuid,
  p_delivery_charge_ex_gst_cents int,
  p_carrier text,
  p_tracking_number text,
  p_idempotency_key text,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_allocation record;
  v_delivery_gst int;
  v_terms_days int;
  v_due_at timestamptz;
  v_invoice_total int;
begin
  if exists (select 1 from public.audit_events where idempotency_key = p_idempotency_key and action = 'order_dispatched') then
    return p_order_id;
  end if;
  select * into v_order from public.sales_orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Order was not found'; end if;
  if v_order.status = 'cancelled' then raise exception 'Cancelled orders cannot be dispatched'; end if;
  if v_order.status = 'dispatched' then return p_order_id; end if;
  if coalesce(trim(p_carrier),'') = '' or coalesce(trim(p_tracking_number),'') = '' then
    raise exception 'Carrier and tracking number are required';
  end if;
  select terms_days into v_terms_days from public.trade_accounts where id = v_order.trade_account_id for update;
  v_due_at := now() + make_interval(days => coalesce(v_terms_days, 30));

  for v_allocation in
    select a.* from public.sales_order_allocations a
    join public.sales_order_lines l on l.id = a.sales_order_line_id
    where l.sales_order_id = p_order_id for update of a
  loop
    update public.inventory_balances
      set on_hand = on_hand - (v_allocation.quantity - v_allocation.dispatched_quantity),
          reserved = reserved - (v_allocation.quantity - v_allocation.dispatched_quantity)
      where id = v_allocation.inventory_balance_id
        and on_hand >= (v_allocation.quantity - v_allocation.dispatched_quantity)
        and reserved >= (v_allocation.quantity - v_allocation.dispatched_quantity);
    if not found then raise exception 'Reserved inventory changed before dispatch'; end if;
    update public.sales_order_allocations
      set picked_quantity = quantity, dispatched_quantity = quantity
      where id = v_allocation.id;
  end loop;

  v_delivery_gst := round(greatest(p_delivery_charge_ex_gst_cents, 0) * 0.1);
  update public.sales_orders set
    status = 'dispatched',
    delivery_charge_ex_gst_cents = greatest(p_delivery_charge_ex_gst_cents, 0),
    carrier = p_carrier,
    tracking_number = p_tracking_number,
    subtotal_ex_gst_cents = subtotal_ex_gst_cents + greatest(p_delivery_charge_ex_gst_cents, 0),
    gst_cents = gst_cents + v_delivery_gst,
    total_inc_gst_cents = total_inc_gst_cents + greatest(p_delivery_charge_ex_gst_cents, 0) + v_delivery_gst,
    dispatched_at = now(),
    payment_due_at = v_due_at,
    invoice_status = 'issued'
  where id = p_order_id
  returning total_inc_gst_cents into v_invoice_total;
  insert into public.account_ledger_entries(
    trade_account_id, sales_order_id, entry_type, amount_cents, reference,
    effective_at, due_at, created_by, idempotency_key
  ) values (
    v_order.trade_account_id, p_order_id, 'invoice', v_invoice_total,
    'INV-' || p_order_id::text, now(), v_due_at, p_actor_id, 'invoice:' || p_order_id::text
  ) on conflict (idempotency_key) do nothing;
  update public.trade_accounts
    set current_balance_cents = current_balance_cents + v_invoice_total,
        credit_status = case when current_balance_cents + v_invoice_total > credit_limit_cents then 'hold' else credit_status end
    where id = v_order.trade_account_id;
  update public.sales_order_lines set status = 'picked' where sales_order_id = p_order_id;
  insert into public.audit_events(entity_type, entity_id, action, actor_id, before_value, after_value, idempotency_key)
    values ('sales_order', p_order_id::text, 'order_dispatched', p_actor_id, to_jsonb(v_order), jsonb_build_object('status','dispatched','carrier',p_carrier,'tracking_number',p_tracking_number), p_idempotency_key);
  return p_order_id;
end;
$$;

create or replace function public.dm_post_account_adjustment(
  p_trade_account_id uuid,
  p_entry_type text,
  p_amount_cents int,
  p_reference text,
  p_notes text,
  p_idempotency_key text,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_entry_id uuid; v_signed_amount int; v_balance int; v_overdue int;
begin
  if p_entry_type not in ('payment','credit_adjustment','debit_adjustment','rebate') then raise exception 'Unsupported account adjustment type'; end if;
  if p_amount_cents <= 0 then raise exception 'Adjustment amount must be positive'; end if;
  select id into v_entry_id from public.account_ledger_entries where idempotency_key = p_idempotency_key;
  if v_entry_id is not null then return v_entry_id; end if;
  perform 1 from public.trade_accounts where id = p_trade_account_id for update;
  if not found then raise exception 'Trade account was not found'; end if;
  v_signed_amount := case when p_entry_type in ('payment','credit_adjustment','rebate') then -p_amount_cents else p_amount_cents end;
  insert into public.account_ledger_entries(trade_account_id,entry_type,amount_cents,reference,notes,created_by,idempotency_key)
    values (p_trade_account_id,p_entry_type,v_signed_amount,p_reference,p_notes,p_actor_id,p_idempotency_key)
    returning id into v_entry_id;
  select coalesce(sum(amount_cents),0) into v_balance from public.account_ledger_entries where trade_account_id = p_trade_account_id;
  select case when exists (
    select 1 from public.account_ledger_entries where trade_account_id = p_trade_account_id and entry_type = 'invoice' and due_at < now()
  ) and v_balance > 0 then v_balance else 0 end into v_overdue;
  update public.trade_accounts
    set current_balance_cents = v_balance,
        overdue_balance_cents = v_overdue,
        credit_status = case when v_overdue > 0 or v_balance > credit_limit_cents then 'hold' else 'active' end
    where id = p_trade_account_id and status = 'approved';
  insert into public.audit_events(entity_type,entity_id,action,actor_id,after_value,idempotency_key)
    values ('trade_account',p_trade_account_id::text,'account_adjustment_posted',p_actor_id,
      jsonb_build_object('entry_type',p_entry_type,'amount_cents',v_signed_amount,'reference',p_reference),p_idempotency_key);
  return v_entry_id;
end;
$$;

create or replace function public.dm_refresh_credit_holds()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_changed int;
begin
  with balances as (
    select ta.id,
      coalesce(sum(le.amount_cents),0)::int as balance,
      case when bool_or(le.entry_type='invoice' and le.due_at < now()) and coalesce(sum(le.amount_cents),0) > 0
        then coalesce(sum(le.amount_cents),0)::int else 0 end as overdue
    from public.trade_accounts ta left join public.account_ledger_entries le on le.trade_account_id=ta.id
    group by ta.id
  )
  update public.trade_accounts ta set
    current_balance_cents=b.balance,
    overdue_balance_cents=b.overdue,
    credit_status=case when b.overdue>0 or b.balance>ta.credit_limit_cents then 'hold' when ta.status='approved' then 'active' else ta.credit_status end
  from balances b where ta.id=b.id;
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

create or replace function public.dm_create_rma(
  p_trade_account_id uuid,
  p_sales_order_id uuid,
  p_reason_type text,
  p_lines jsonb,
  p_notes text,
  p_evidence jsonb,
  p_idempotency_key text,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_existing uuid; v_rma_id uuid; v_line jsonb; v_order_line record; v_responsibility text;
begin
  select id into v_existing from public.rma_requests where idempotency_key=p_idempotency_key;
  if v_existing is not null then return v_existing; end if;
  if p_reason_type not in ('quality','incorrect_fitment','damaged_delivery','other') then raise exception 'Unsupported RMA reason'; end if;
  if not exists (select 1 from public.sales_orders where id=p_sales_order_id and trade_account_id=p_trade_account_id and status='dispatched') then
    raise exception 'Only dispatched orders owned by the trade account can be returned';
  end if;
  v_responsibility := case p_reason_type when 'quality' then 'drivemate' when 'incorrect_fitment' then 'workshop' when 'damaged_delivery' then 'carrier' else 'pending_review' end;
  insert into public.rma_requests(rma_number,trade_account_id,sales_order_id,reason_type,responsibility,status,requested_by,notes,evidence,idempotency_key)
    values ('RMA-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),p_trade_account_id,p_sales_order_id,p_reason_type,v_responsibility,'requested',p_actor_id,p_notes,coalesce(p_evidence,'[]'::jsonb),p_idempotency_key)
    returning id into v_rma_id;
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select sol.id,sol.quantity,p.sku into v_order_line from public.sales_order_lines sol join public.products p on p.id=sol.product_id
      where sol.sales_order_id=p_sales_order_id and p.sku=upper(v_line->>'sku') for update of sol;
    if v_order_line.id is null then raise exception 'SKU % is not on the order',v_line->>'sku'; end if;
    if (v_line->>'quantity')::int<=0 or (v_line->>'quantity')::int>v_order_line.quantity then raise exception 'RMA quantity is invalid for SKU %',v_line->>'sku'; end if;
    insert into public.rma_lines(rma_request_id,sales_order_line_id,quantity,inspection_outcome)
      values (v_rma_id,v_order_line.id,(v_line->>'quantity')::int,'pending');
  end loop;
  insert into public.audit_events(entity_type,entity_id,action,actor_id,after_value,idempotency_key)
    values ('rma',v_rma_id::text,'rma_requested',p_actor_id,jsonb_build_object('reason_type',p_reason_type,'responsibility',v_responsibility),p_idempotency_key);
  return v_rma_id;
end;
$$;

create or replace function public.dm_save_landed_cost(
  p_shipment_id uuid,
  p_status text,
  p_allocation_basis text,
  p_costs jsonb,
  p_allocations jsonb,
  p_source_evidence jsonb,
  p_idempotency_key text,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_existing uuid; v_id uuid; v_version int; v_allocation jsonb; v_cash_total bigint; v_cogs_total bigint; v_alloc_cash bigint; v_alloc_cogs bigint;
begin
  select (after_value->>'landed_cost_id')::uuid into v_existing from public.audit_events where idempotency_key=p_idempotency_key and action='landed_cost_saved';
  if v_existing is not null then return v_existing; end if;
  if p_status not in ('provisional','final') then raise exception 'Landed cost status must be provisional or final'; end if;
  if p_allocation_basis not in ('value','quantity','weight','volume','manual') then raise exception 'Unsupported landed cost allocation basis'; end if;
  perform 1 from public.shipments where id=p_shipment_id for update;
  if not found then raise exception 'Shipment was not found'; end if;
  v_cash_total := coalesce((p_costs->>'domesticLogisticsMinor')::bigint,0)+coalesce((p_costs->>'oceanFreightMinor')::bigint,0)+coalesce((p_costs->>'insuranceMinor')::bigint,0)+coalesce((p_costs->>'dutyMinor')::bigint,0)+coalesce((p_costs->>'importGstMinor')::bigint,0)+coalesce((p_costs->>'brokerageMinor')::bigint,0)+coalesce((p_costs->>'portChargesMinor')::bigint,0)+coalesce((p_costs->>'australiaDeliveryMinor')::bigint,0)+coalesce((p_costs->>'otherCostsMinor')::bigint,0);
  v_cogs_total := v_cash_total-coalesce((p_costs->>'importGstMinor')::bigint,0);
  select coalesce(sum((value->>'allocatedCashMinor')::bigint),0),coalesce(sum((value->>'allocatedCogsMinor')::bigint),0) into v_alloc_cash,v_alloc_cogs from jsonb_array_elements(p_allocations);
  if v_alloc_cash<>v_cash_total or v_alloc_cogs<>v_cogs_total then raise exception 'Landed cost allocations do not reconcile'; end if;
  if (select count(*) from jsonb_array_elements(p_allocations)) <> (
    select count(*) from public.purchase_order_lines pol join public.shipments s on s.purchase_order_id=pol.purchase_order_id where s.id=p_shipment_id
  ) or (select count(distinct value->>'purchaseOrderLineId') from jsonb_array_elements(p_allocations)) <> (select count(*) from jsonb_array_elements(p_allocations)) then
    raise exception 'Every shipment purchase line must have exactly one landed cost allocation';
  end if;
  select coalesce(max(version),0)+1 into v_version from public.landed_costs where shipment_id=p_shipment_id;
  if p_status='final' then update public.landed_costs set status='superseded' where shipment_id=p_shipment_id and status in ('provisional','final');
  else update public.landed_costs set status='superseded' where shipment_id=p_shipment_id and status='provisional'; end if;
  insert into public.landed_costs(shipment_id,version,status,currency,allocation_basis,domestic_logistics_minor,ocean_freight_minor,insurance_minor,duty_minor,import_gst_minor,brokerage_minor,port_charges_minor,australia_delivery_minor,other_costs_minor,source_evidence,created_by)
    values(p_shipment_id,v_version,p_status,'AUD',p_allocation_basis,coalesce((p_costs->>'domesticLogisticsMinor')::bigint,0),coalesce((p_costs->>'oceanFreightMinor')::bigint,0),coalesce((p_costs->>'insuranceMinor')::bigint,0),coalesce((p_costs->>'dutyMinor')::bigint,0),coalesce((p_costs->>'importGstMinor')::bigint,0),coalesce((p_costs->>'brokerageMinor')::bigint,0),coalesce((p_costs->>'portChargesMinor')::bigint,0),coalesce((p_costs->>'australiaDeliveryMinor')::bigint,0),coalesce((p_costs->>'otherCostsMinor')::bigint,0),coalesce(p_source_evidence,'[]'::jsonb),p_actor_id) returning id into v_id;
  for v_allocation in select * from jsonb_array_elements(p_allocations)
  loop
    if not exists(select 1 from public.purchase_order_lines pol join public.shipments s on s.purchase_order_id=pol.purchase_order_id where s.id=p_shipment_id and pol.id=(v_allocation->>'purchaseOrderLineId')::uuid) then raise exception 'Allocation line is not on the shipment purchase order'; end if;
    insert into public.landed_cost_allocations(landed_cost_id,purchase_order_line_id,allocated_minor,allocated_cash_minor,allocated_cogs_minor,basis_value)
      values(v_id,(v_allocation->>'purchaseOrderLineId')::uuid,(v_allocation->>'allocatedCogsMinor')::bigint,(v_allocation->>'allocatedCashMinor')::bigint,(v_allocation->>'allocatedCogsMinor')::bigint,nullif(v_allocation->>'basisValue','')::numeric);
  end loop;
  insert into public.audit_events(entity_type,entity_id,action,actor_id,after_value,idempotency_key)
    values('landed_cost',v_id::text,'landed_cost_saved',p_actor_id,jsonb_build_object('landed_cost_id',v_id,'version',v_version,'status',p_status,'cash_total_minor',v_cash_total,'cogs_total_minor',v_cogs_total),p_idempotency_key);
  return v_id;
end;
$$;

create or replace function public.dm_receive_rma(
  p_rma_id uuid,
  p_lines jsonb,
  p_location_id uuid,
  p_idempotency_key text,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_rma record; v_line jsonb; v_rma_line record; v_batch_id uuid; v_quantity int;
begin
  if exists(select 1 from public.audit_events where idempotency_key=p_idempotency_key and action='rma_received') then return p_rma_id; end if;
  select * into v_rma from public.rma_requests where id=p_rma_id for update;
  if v_rma.id is null or v_rma.status not in ('requested','approved','in_transit') then raise exception 'RMA is not receivable'; end if;
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select rl.*,sol.product_id,p.sku into v_rma_line
      from public.rma_lines rl join public.sales_order_lines sol on sol.id=rl.sales_order_line_id join public.products p on p.id=sol.product_id
      where rl.rma_request_id=p_rma_id and p.sku=upper(v_line->>'sku') for update of rl;
    if v_rma_line.id is null then raise exception 'SKU % is not on the RMA',v_line->>'sku'; end if;
    v_quantity := (v_line->>'quantity')::int;
    if v_quantity<=0 or v_rma_line.received_quantity+v_quantity>v_rma_line.quantity then raise exception 'RMA received quantity is invalid'; end if;
    insert into public.inventory_batches(product_id,batch_no,supplier_name,purchase_ref,received_date)
      values (v_rma_line.product_id,v_rma.rma_number,'RMA return',v_rma.rma_number,current_date)
      on conflict(product_id,batch_no) do update set received_date=excluded.received_date returning id into v_batch_id;
    insert into public.inventory_balances(product_id,location_id,batch_id,on_hand,reserved,quarantine)
      values(v_rma_line.product_id,p_location_id,v_batch_id,v_quantity,0,v_quantity)
      on conflict(product_id,location_id,batch_id) do update set on_hand=public.inventory_balances.on_hand+excluded.on_hand,quarantine=public.inventory_balances.quarantine+excluded.quarantine;
    update public.rma_lines set received_quantity=received_quantity+v_quantity where id=v_rma_line.id;
    insert into public.stock_movements(product_id,batch_id,movement_type,quantity,to_location_id,reference_type,reference_id,created_by)
      values(v_rma_line.product_id,v_batch_id,'return',v_quantity,p_location_id,'rma',p_rma_id::text,p_actor_id);
  end loop;
  update public.rma_requests set status='received_quarantine',updated_at=now() where id=p_rma_id;
  insert into public.audit_events(entity_type,entity_id,action,actor_id,after_value,idempotency_key)
    values('rma',p_rma_id::text,'rma_received',p_actor_id,jsonb_build_object('status','received_quarantine'),p_idempotency_key);
  return p_rma_id;
end;
$$;

create or replace function public.dm_inspect_rma(
  p_rma_id uuid,
  p_outcome text,
  p_credit_amount_cents int,
  p_notes text,
  p_idempotency_key text,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_rma record;
begin
  if exists(select 1 from public.audit_events where idempotency_key=p_idempotency_key and action='rma_inspected') then return p_rma_id; end if;
  if p_outcome not in ('quality_confirmed','no_fault_found','customer_fitment_error','carrier_damage') then raise exception 'Unsupported inspection outcome'; end if;
  select * into v_rma from public.rma_requests where id=p_rma_id for update;
  if v_rma.id is null or v_rma.status<>'received_quarantine' then raise exception 'RMA must be received into quarantine before inspection'; end if;
  update public.rma_lines set inspection_outcome=p_outcome where rma_request_id=p_rma_id;
  update public.rma_requests set status=case when coalesce(p_credit_amount_cents,0)>0 then 'credited' else 'inspected' end,notes=concat_ws(E'\n',notes,p_notes),updated_at=now() where id=p_rma_id;
  if coalesce(p_credit_amount_cents,0)>0 then
    perform public.dm_post_account_adjustment(v_rma.trade_account_id,'credit_adjustment',p_credit_amount_cents,'RMA credit '||v_rma.rma_number,p_notes,'rma-credit:'||p_rma_id::text,p_actor_id);
  end if;
  insert into public.audit_events(entity_type,entity_id,action,actor_id,after_value,idempotency_key)
    values('rma',p_rma_id::text,'rma_inspected',p_actor_id,jsonb_build_object('outcome',p_outcome,'credit_amount_cents',coalesce(p_credit_amount_cents,0)),p_idempotency_key);
  return p_rma_id;
end;
$$;

create or replace view public.sellable_catalogue as
select p.*,
       coalesce(sum(ib.on_hand - ib.reserved - ib.quarantine), 0)::int as available_stock
from public.products p
left join public.inventory_balances ib on ib.product_id = p.id
where p.public_visibility = true
  and p.commercial_status = 'active'
  and p.compliance_status = 'approved'
  and p.fitment_status = 'approved'
  and p.pricing_status = 'approved'
group by p.id
having coalesce(sum(ib.on_hand - ib.reserved - ib.quarantine), 0) > 0;

revoke all on function public.dm_reserve_sales_order(uuid, jsonb, text, text, text, text, uuid) from public;
revoke all on function public.dm_cancel_sales_order(uuid, text, uuid) from public;
revoke all on function public.dm_dispatch_sales_order(uuid, int, text, text, text, uuid) from public;
revoke all on function public.dm_post_account_adjustment(uuid, text, int, text, text, text, uuid) from public;
revoke all on function public.dm_create_rma(uuid, uuid, text, jsonb, text, jsonb, text, uuid) from public;
revoke all on function public.dm_receive_rma(uuid, jsonb, uuid, text, uuid) from public;
revoke all on function public.dm_inspect_rma(uuid, text, int, text, text, uuid) from public;
revoke all on function public.dm_save_landed_cost(uuid, text, text, jsonb, jsonb, jsonb, text, uuid) from public;
revoke all on function public.dm_product_is_sellable(uuid) from public;
revoke all on function public.dm_commit_purchase_import(jsonb, uuid, text) from public;
revoke all on function public.dm_receive_goods(uuid, text, jsonb, uuid, text, uuid) from public;
revoke all on function public.dm_release_quarantine(uuid, int, text, uuid) from public;
revoke all on function public.dm_review_product_gate(text, text, text, jsonb, text, uuid) from public;
revoke all on function public.dm_approve_trade_price(text, int, uuid) from public;
revoke all on function public.dm_commit_vin_import(text, jsonb, text, uuid) from public;
revoke all on function public.dm_refresh_credit_holds() from public;

alter table public.suppliers enable row level security;
alter table public.data_import_runs enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_pallets enable row level security;
alter table public.shipment_cartons enable row level security;
alter table public.shipment_carton_lines enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_lines enable row level security;
alter table public.landed_costs enable row level security;
alter table public.landed_cost_allocations enable row level security;
alter table public.compliance_reviews enable row level security;
alter table public.vehicle_configurations enable row level security;
alter table public.vehicles enable row level security;
alter table public.audit_events enable row level security;
alter table public.sales_order_allocations enable row level security;
alter table public.account_ledger_entries enable row level security;
alter table public.rma_requests enable row level security;
alter table public.rma_lines enable row level security;

do $$
declare v_role text; v_table text;
begin
  foreach v_role in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=v_role) then
      foreach v_table in array array[
        'suppliers','data_import_runs','purchase_orders','purchase_order_lines','shipments','shipment_pallets',
        'shipment_cartons','shipment_carton_lines','goods_receipts','goods_receipt_lines','landed_costs',
        'landed_cost_allocations','compliance_reviews','vehicle_configurations','vehicles','audit_events',
        'sales_order_allocations','account_ledger_entries','rma_requests','rma_lines','sellable_catalogue'
      ] loop
        execute format('revoke all on public.%I from %I',v_table,v_role);
      end loop;
      execute format('revoke execute on all functions in schema public from %I',v_role);
    end if;
  end loop;
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'grant all on all tables in schema public to service_role';
    execute 'grant execute on all functions in schema public to service_role';
  end if;
end;
$$;
