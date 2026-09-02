-- Local review artifact only. Do not execute against Production without separate approval.
begin;

alter table public.shipments
  add column if not exists physical_pallet_count integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shipments_physical_pallet_count_positive'
      and conrelid = 'public.shipments'::regclass
  ) then
    alter table public.shipments
      add constraint shipments_physical_pallet_count_positive
      check (physical_pallet_count is null or physical_pallet_count > 0);
  end if;
end;
$$;

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
  v_schema_version integer;
  v_physical_pallet_count integer;
  v_mapped_pallet_count integer;
  v_mapped_carton_count integer;
  v_total_carton_count integer;
  v_pallet jsonb;
  v_carton jsonb;
  v_line jsonb;
  v_pallet_number text;
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

  v_schema_version := coalesce(
    nullif(v_revision.payload_snapshot ->> 'schemaVersion', '')::integer,
    1
  );
  if v_schema_version not in (1, 2) then
    raise exception 'Unsupported packing-list schema version %', v_schema_version;
  end if;

  if v_schema_version = 2 then
    v_physical_pallet_count := nullif(
      v_revision.payload_snapshot ->> 'physicalPalletCount',
      ''
    )::integer;
    select count(*),
           count(*) filter (where nullif(trim(value ->> 'sourcePalletNumber'), '') is not null),
           count(distinct upper(nullif(trim(value ->> 'sourcePalletNumber'), '')))
      into v_total_carton_count, v_mapped_carton_count, v_mapped_pallet_count
    from jsonb_array_elements(v_revision.payload_snapshot -> 'cartons');
    if v_physical_pallet_count is not null
      and v_mapped_pallet_count > v_physical_pallet_count then
      raise exception 'Mapped pallet count cannot exceed the physical pallet count';
    end if;
    if v_physical_pallet_count is not null
      and v_mapped_carton_count = v_total_carton_count
      and v_mapped_pallet_count <> v_physical_pallet_count then
      raise exception 'Complete pallet mapping must match the physical pallet count';
    end if;

    for v_carton in
      select value from jsonb_array_elements(v_revision.payload_snapshot -> 'cartons')
    loop
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
  else
    for v_pallet in
      select value from jsonb_array_elements(v_revision.payload_snapshot -> 'pallets')
    loop
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
  end if;

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

  if v_schema_version = 2 then
    update public.shipments
    set physical_pallet_count = v_physical_pallet_count
    where id = v_revision.shipment_id;

    for v_carton in
      select value from jsonb_array_elements(v_revision.payload_snapshot -> 'cartons')
    loop
      v_pallet_number := nullif(trim(v_carton ->> 'sourcePalletNumber'), '');
      v_pallet_id := null;

      if v_pallet_number is not null then
        insert into public.shipment_pallets (shipment_id, pallet_number, source_evidence)
        values (
          v_revision.shipment_id,
          v_pallet_number,
          jsonb_build_array(jsonb_build_object('packing_list_revision_id', v_revision.id))
        )
        on conflict (shipment_id, pallet_number) do update
        set source_evidence = excluded.source_evidence
        returning id into v_pallet_id;
      end if;

      insert into public.shipment_cartons (
        shipment_id, pallet_id, carton_number, source_evidence
      )
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
          carton_id, purchase_order_line_id, quantity, source_evidence
        )
        values (
          v_carton_id,
          v_purchase_order_line_id,
          (v_line ->> 'expectedQuantity')::integer,
          jsonb_build_array(jsonb_build_object('packing_list_revision_id', v_revision.id))
        );
      end loop;
    end loop;
  else
    update public.shipments
    set physical_pallet_count = jsonb_array_length(v_revision.payload_snapshot -> 'pallets')
    where id = v_revision.shipment_id;

    for v_pallet in
      select value from jsonb_array_elements(v_revision.payload_snapshot -> 'pallets')
    loop
      insert into public.shipment_pallets (shipment_id, pallet_number, source_evidence)
      values (
        v_revision.shipment_id,
        v_pallet ->> 'sourcePalletNumber',
        jsonb_build_array(jsonb_build_object('packing_list_revision_id', v_revision.id))
      )
      returning id into v_pallet_id;

      for v_carton in select value from jsonb_array_elements(v_pallet -> 'cartons') loop
        insert into public.shipment_cartons (
          shipment_id, pallet_id, carton_number, source_evidence
        )
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
            carton_id, purchase_order_line_id, quantity, source_evidence
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
  end if;

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

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.dm_confirm_packing_list_revision(uuid, uuid)
      to service_role;
  end if;
end;
$$;

commit;
