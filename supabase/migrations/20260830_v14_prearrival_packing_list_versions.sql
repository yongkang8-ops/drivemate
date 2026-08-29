-- Local review artifact only. Do not execute against Production without separate approval.
begin;

create table if not exists public.shipment_packing_list_versions (
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

create index if not exists shipment_packing_list_versions_shipment_idx
  on public.shipment_packing_list_versions (shipment_id, version desc);

create or replace function public.dm_guard_shipment_packing_list_version_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Packing-list revisions are immutable';
  end if;

  if new.id is distinct from old.id
    or new.shipment_id is distinct from old.shipment_id
    or new.version is distinct from old.version
    or new.payload_snapshot is distinct from old.payload_snapshot
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Packing-list revision payloads are immutable';
  end if;

  if old.status = 'draft'
    and new.status = 'confirmed'
    and new.confirmed_by is not null
    and new.confirmed_at is not null then
    return new;
  end if;

  if old.status = 'confirmed'
    and new.status = 'superseded'
    and new.confirmed_by is not distinct from old.confirmed_by
    and new.confirmed_at is not distinct from old.confirmed_at then
    return new;
  end if;

  raise exception 'Invalid packing-list revision status transition';
end;
$$;

drop trigger if exists shipment_packing_list_versions_immutable on public.shipment_packing_list_versions;
create trigger shipment_packing_list_versions_immutable
before update or delete on public.shipment_packing_list_versions
for each row execute function public.dm_guard_shipment_packing_list_version_mutation();

create or replace function public.dm_confirm_packing_list_revision(
  p_revision_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision public.shipment_packing_list_versions%rowtype;
  v_shipment public.shipments%rowtype;
  v_pallet jsonb;
  v_carton jsonb;
  v_line jsonb;
  v_pallet_id uuid;
  v_carton_id uuid;
  v_purchase_order_line_id uuid;
  v_purchase_order_line_count integer;
begin
  if p_actor_id is null then
    raise exception 'Partner actor is required to confirm a packing-list revision';
  end if;

  select * into v_revision
  from public.shipment_packing_list_versions
  where id = p_revision_id
  for update;
  if not found or v_revision.status <> 'draft' then
    return null;
  end if;

  select * into v_shipment
  from public.shipments
  where id = v_revision.shipment_id
  for update;
  if not found then
    raise exception 'Shipment for packing-list revision was not found';
  end if;

  for v_pallet in select value from jsonb_array_elements(v_revision.payload_snapshot -> 'pallets') loop
    for v_carton in select value from jsonb_array_elements(v_pallet -> 'cartons') loop
      for v_line in select value from jsonb_array_elements(v_carton -> 'lines') loop
        select count(*), (array_agg(pol.id order by pol.id))[1]
          into v_purchase_order_line_count, v_purchase_order_line_id
        from public.purchase_order_lines pol
        join public.products product on product.id = pol.product_id
        where pol.purchase_order_id = v_shipment.purchase_order_id
          and upper(product.sku) = upper(v_line ->> 'sku');
        if v_purchase_order_line_count <> 1 then
          raise exception 'Packing-list SKU % does not resolve to exactly one purchase-order line', v_line ->> 'sku';
        end if;
      end loop;
    end loop;
  end loop;

  update public.shipment_packing_list_versions
  set status = 'superseded'
  where shipment_id = v_revision.shipment_id
    and status = 'confirmed';

  delete from public.shipment_carton_lines
  where carton_id in (
    select id from public.shipment_cartons where shipment_id = v_revision.shipment_id
  );
  delete from public.shipment_cartons where shipment_id = v_revision.shipment_id;
  delete from public.shipment_pallets where shipment_id = v_revision.shipment_id;

  for v_pallet in select value from jsonb_array_elements(v_revision.payload_snapshot -> 'pallets') loop
    insert into public.shipment_pallets (shipment_id, pallet_number, source_evidence)
    values (
      v_revision.shipment_id,
      v_pallet ->> 'sourcePalletNumber',
      jsonb_build_array(jsonb_build_object('packing_list_revision_id', v_revision.id))
    )
    returning id into v_pallet_id;

    for v_carton in select value from jsonb_array_elements(v_pallet -> 'cartons') loop
      insert into public.shipment_cartons (shipment_id, pallet_id, carton_number, source_evidence)
      values (
        v_revision.shipment_id,
        v_pallet_id,
        v_carton ->> 'sourceCartonNumber',
        jsonb_build_array(jsonb_build_object('packing_list_revision_id', v_revision.id))
      )
      returning id into v_carton_id;

      for v_line in select value from jsonb_array_elements(v_carton -> 'lines') loop
        select (array_agg(pol.id order by pol.id))[1]
          into v_purchase_order_line_id
        from public.purchase_order_lines pol
        join public.products product on product.id = pol.product_id
        where pol.purchase_order_id = v_shipment.purchase_order_id
          and upper(product.sku) = upper(v_line ->> 'sku');

        insert into public.shipment_carton_lines (
          carton_id,
          purchase_order_line_id,
          quantity,
          source_evidence
        )
        values (
          v_carton_id,
          v_purchase_order_line_id,
          (v_line ->> 'expectedQuantity')::integer,
          jsonb_build_array(jsonb_build_object('packing_list_revision_id', v_revision.id))
        );
      end loop;
    end loop;
  end loop;

  update public.shipment_packing_list_versions
  set status = 'confirmed',
      confirmed_by = p_actor_id,
      confirmed_at = now()
  where id = v_revision.id
  returning * into v_revision;

  return jsonb_build_object(
    'id', v_revision.id,
    'shipment_id', v_revision.shipment_id,
    'version', v_revision.version,
    'status', v_revision.status,
    'payload_snapshot', v_revision.payload_snapshot,
    'created_by', v_revision.created_by,
    'created_at', v_revision.created_at,
    'confirmed_by', v_revision.confirmed_by,
    'confirmed_at', v_revision.confirmed_at
  );
end;
$$;

alter table public.shipment_packing_list_versions enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.shipment_packing_list_versions from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.shipment_packing_list_versions from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.shipment_packing_list_versions to service_role;
    grant execute on function public.dm_confirm_packing_list_revision(uuid, uuid) to service_role;
  end if;
end;
$$;

commit;
