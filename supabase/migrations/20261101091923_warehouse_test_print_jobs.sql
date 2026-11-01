-- Device commissioning only. Formal print, receipt and stock tables are untouched.
create table public.warehouse_test_print_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  request_key text not null check (length(request_key) between 1 and 10000),
  shipment_id text not null check (length(shipment_id) between 1 and 120),
  labels jsonb not null check (jsonb_typeof(labels) = 'array' and jsonb_array_length(labels) between 1 and 20),
  status text not null default 'pending' check (status in ('pending','printed','failed','cancelled')),
  created_by text not null check (length(created_by) > 0),
  created_at timestamptz not null default now(),
  outcome_by text,
  outcome_at timestamptz,
  reason text check (length(reason) <= 500),
  unique (created_by, request_id),
  check ((status = 'pending' and outcome_by is null and outcome_at is null and reason is null)
    or (status <> 'pending' and outcome_by is not null and length(outcome_by) > 0 and outcome_at is not null and reason is not null)),
  check (status not in ('failed','cancelled') or length(trim(reason)) > 0)
);
create index warehouse_test_print_jobs_shipment_created on public.warehouse_test_print_jobs(shipment_id, created_at desc, id desc);
alter table public.warehouse_test_print_jobs enable row level security;
revoke all on public.warehouse_test_print_jobs from public, anon, authenticated;
grant select, insert, update on public.warehouse_test_print_jobs to service_role;

create function public.dm_guard_test_print_job() returns trigger
language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if tg_op = 'DELETE' then raise exception 'Test print records are retained'; end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'pending' then raise exception 'Test print result is immutable'; end if;
    if (new.id,new.request_id,new.request_key,new.shipment_id,new.labels,new.created_by,new.created_at)
      is distinct from (old.id,old.request_id,old.request_key,old.shipment_id,old.labels,old.created_by,old.created_at)
      then raise exception 'Test print artwork is immutable'; end if;
    if new.status = 'pending' then raise exception 'Only result updates are allowed'; end if;
  elsif new.status <> 'pending' then raise exception 'New test jobs must be pending'; end if;
  return new;
end;
$$;
revoke all on function public.dm_guard_test_print_job() from public, anon, authenticated;
create trigger warehouse_test_print_jobs_immutable before insert or update or delete on public.warehouse_test_print_jobs
for each row execute function public.dm_guard_test_print_job();
