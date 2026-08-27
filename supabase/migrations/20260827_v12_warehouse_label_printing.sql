create table if not exists public.warehouse_label_print_jobs (
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

create table if not exists public.warehouse_label_print_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.warehouse_label_print_jobs(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  payload_snapshot jsonb not null check (jsonb_typeof(payload_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique (job_id, sequence)
);

create index if not exists warehouse_label_print_jobs_created_at_idx
  on public.warehouse_label_print_jobs (created_at desc);
create index if not exists warehouse_label_print_jobs_reprint_of_job_id_idx
  on public.warehouse_label_print_jobs (reprint_of_job_id);

create or replace function public.dm_prevent_warehouse_label_print_item_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Warehouse label print items are immutable';
end;
$$;

drop trigger if exists warehouse_label_print_items_immutable on public.warehouse_label_print_items;
create trigger warehouse_label_print_items_immutable
before update or delete on public.warehouse_label_print_items
for each row execute function public.dm_prevent_warehouse_label_print_item_mutation();

alter table public.warehouse_label_print_jobs enable row level security;
alter table public.warehouse_label_print_items enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.warehouse_label_print_jobs from anon;
    revoke all on public.warehouse_label_print_items from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.warehouse_label_print_jobs from authenticated;
    revoke all on public.warehouse_label_print_items from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.warehouse_label_print_jobs to service_role;
    grant all on public.warehouse_label_print_items to service_role;
  end if;
end;
$$;
