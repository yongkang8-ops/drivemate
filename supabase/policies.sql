create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_profiles where id = auth.uid()
$$;

create or replace function public.current_trade_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select trade_account_id from public.user_profiles where id = auth.uid()
$$;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.products to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter default privileges in schema public
grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
grant all privileges on tables to service_role;

alter table public.trade_accounts enable row level security;
alter table public.user_profiles enable row level security;
alter table public.products enable row level security;
alter table public.fitment_rules enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;
alter table public.account_documents enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.rfq_reviews enable row level security;
alter table public.vehicle_lookup_requests enable row level security;

drop policy if exists "public can read active products" on public.products;
create policy "public can read active products"
on public.products for select
using (status = 'active');

drop policy if exists "admin can manage products" on public.products;
create policy "admin can manage products"
on public.products for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "trade and staff can read fitment" on public.fitment_rules;
create policy "trade and staff can read fitment"
on public.fitment_rules for select
using (public.current_user_role() in ('trade', 'warehouse', 'admin'));

drop policy if exists "admin can manage fitment" on public.fitment_rules;
create policy "admin can manage fitment"
on public.fitment_rules for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "staff can read inventory locations" on public.inventory_locations;
create policy "staff can read inventory locations"
on public.inventory_locations for select
using (public.current_user_role() in ('warehouse', 'admin'));

drop policy if exists "staff can read batches" on public.inventory_batches;
create policy "staff can read batches"
on public.inventory_batches for select
using (public.current_user_role() in ('warehouse', 'admin'));

drop policy if exists "staff can read balances" on public.inventory_balances;
create policy "staff can read balances"
on public.inventory_balances for select
using (public.current_user_role() in ('warehouse', 'admin'));

drop policy if exists "warehouse can create stock movements" on public.stock_movements;
create policy "warehouse can create stock movements"
on public.stock_movements for insert
with check (public.current_user_role() in ('warehouse', 'admin'));

drop policy if exists "staff can read stock movements" on public.stock_movements;
create policy "staff can read stock movements"
on public.stock_movements for select
using (public.current_user_role() in ('warehouse', 'admin'));

drop policy if exists "trade users can read own orders" on public.sales_orders;
create policy "trade users can read own orders"
on public.sales_orders for select
using (
  public.current_user_role() = 'admin'
  or trade_account_id = public.current_trade_account_id()
);

drop policy if exists "trade users can create own draft orders" on public.sales_orders;
create policy "trade users can create own draft orders"
on public.sales_orders for insert
with check (
  public.current_user_role() in ('trade', 'admin')
  and trade_account_id = public.current_trade_account_id()
);

drop policy if exists "trade users can read own order lines" on public.sales_order_lines;
create policy "trade users can read own order lines"
on public.sales_order_lines for select
using (
  public.current_user_role() = 'admin'
  or exists (
    select 1
    from public.sales_orders
    where sales_orders.id = sales_order_lines.sales_order_id
      and sales_orders.trade_account_id = public.current_trade_account_id()
  )
);

drop policy if exists "trade users can read own documents" on public.account_documents;
create policy "trade users can read own documents"
on public.account_documents for select
using (
  public.current_user_role() = 'admin'
  or trade_account_id = public.current_trade_account_id()
);

drop policy if exists "users can read own profile" on public.user_profiles;
create policy "users can read own profile"
on public.user_profiles for select
to authenticated
using (id = (select auth.uid()) or public.current_user_role() = 'admin');

drop policy if exists "admin can manage trade accounts" on public.trade_accounts;
create policy "admin can manage trade accounts"
on public.trade_accounts for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "admin can manage pricing rules" on public.pricing_rules;
create policy "admin can manage pricing rules"
on public.pricing_rules for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "admin can manage rfq reviews" on public.rfq_reviews;
create policy "admin can manage rfq reviews"
on public.rfq_reviews for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "admin can read lookup requests" on public.vehicle_lookup_requests;
create policy "admin can read lookup requests"
on public.vehicle_lookup_requests for select
using (public.current_user_role() = 'admin');
