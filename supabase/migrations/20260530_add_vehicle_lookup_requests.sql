create table if not exists public.vehicle_lookup_requests (
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

alter table public.vehicle_lookup_requests enable row level security;

drop policy if exists "admin can read lookup requests"
on public.vehicle_lookup_requests;

create policy "admin can read lookup requests"
on public.vehicle_lookup_requests for select
using (public.current_user_role() = 'admin');
