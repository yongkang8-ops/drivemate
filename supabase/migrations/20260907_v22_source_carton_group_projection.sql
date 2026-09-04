-- Local review artifact only. Do not execute against Production without separate approval.
begin;

alter table public.shipment_cartons
  add column if not exists scope_kind text not null default 'carton';

alter table public.shipment_pallets
  add column if not exists normalized_pallet_number text generated always as (
    regexp_replace(upper(trim(pallet_number)),'\s+',' ','g')
  ) stored;

create unique index if not exists shipment_pallets_normalized_number_unique
  on public.shipment_pallets(shipment_id,normalized_pallet_number);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='shipment_cartons_scope_kind_check'
      and conrelid='public.shipment_cartons'::regclass
  ) then
    alter table public.shipment_cartons
      add constraint shipment_cartons_scope_kind_check
      check (scope_kind in ('carton','carton_group'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='shipment_cartons_id_shipment_unique'
      and conrelid='public.shipment_cartons'::regclass
  ) then
    alter table public.shipment_cartons
      add constraint shipment_cartons_id_shipment_unique unique (id,shipment_id);
  end if;
end;
$$;

create table if not exists public.shipment_carton_members (
  id uuid primary key default gen_random_uuid(),
  carton_id uuid not null,
  shipment_id uuid not null,
  member_identifier text not null check (trim(member_identifier)<>''),
  normalized_member_identifier text generated always as (
    regexp_replace(upper(trim(member_identifier)),'\s+',' ','g')
  ) stored,
  member_ordinal integer not null check (member_ordinal>0),
  source_evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (carton_id, shipment_id)
    references public.shipment_cartons(id, shipment_id) on delete cascade,
  unique (shipment_id, normalized_member_identifier),
  unique (carton_id, member_ordinal)
);

create index if not exists shipment_carton_members_carton_idx
  on public.shipment_carton_members(carton_id);

alter table public.shipment_carton_members enable row level security;
revoke all on public.shipment_carton_members from public,anon,authenticated;

alter function public.dm_confirm_packing_list_revision(uuid,uuid)
  rename to dm_confirm_packing_list_revision_v21;

create function public.dm_confirm_packing_list_revision(p_revision_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  v_revision public.shipment_packing_list_versions%rowtype;
  v_shipment public.shipments%rowtype;
  v_schema_version integer;
  v_physical_pallet_count integer;
  v_mapped_pallet_count integer;
  v_mapped_carton_count integer;
  v_total_carton_count integer;
  v_carton jsonb;
  v_line jsonb;
  v_member record;
  v_scope_kind text;
  v_source_scope text;
  v_normalized_scope text;
  v_normalized_member text;
  v_physical_carton_count integer;
  v_scope_ids text[] := '{}'::text[];
  v_member_ids text[] := '{}'::text[];
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
  where id=p_revision_id;
  if not found then return null; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_revision.shipment_id::text,617));
  select * into v_revision
  from public.shipment_packing_list_versions
  where id=p_revision_id
  for update;
  if not found or v_revision.status<>'draft' then return null; end if;

  v_schema_version:=coalesce(nullif(v_revision.payload_snapshot->>'schemaVersion','')::integer,1);
  if v_schema_version in (1,2) then
    return public.dm_confirm_packing_list_revision_v21(p_revision_id,p_actor_id);
  end if;
  if v_schema_version<>3 then
    raise exception 'Unsupported packing-list schema version %',v_schema_version;
  end if;
  if jsonb_typeof(v_revision.payload_snapshot->'shipmentId')<>'string' then
    raise exception 'Packing-list shipment does not match its revision';
  end if;
  begin
    if (v_revision.payload_snapshot->>'shipmentId')::uuid<>v_revision.shipment_id then
      raise exception 'Packing-list shipment does not match its revision';
    end if;
  exception when invalid_text_representation then
    raise exception 'Packing-list shipment does not match its revision';
  end;

  perform public.dm_assert_used_packing_scopes_preserved(p_revision_id);
  select * into v_shipment from public.shipments
  where id=v_revision.shipment_id for update;
  if not found then raise exception 'Shipment for packing-list revision was not found'; end if;

  if jsonb_typeof(v_revision.payload_snapshot->'cartons')<>'array'
    or jsonb_array_length(v_revision.payload_snapshot->'cartons')=0 then
    raise exception 'Schema v3 packing list requires at least one source scope';
  end if;

  if v_revision.payload_snapshot ? 'physicalPalletCount'
    and jsonb_typeof(v_revision.payload_snapshot->'physicalPalletCount') not in ('number','null') then
    raise exception 'Physical pallet count must be a positive integer or null';
  end if;
  v_physical_pallet_count:=nullif(v_revision.payload_snapshot->>'physicalPalletCount','')::integer;
  if v_physical_pallet_count is not null and v_physical_pallet_count<=0 then
    raise exception 'Physical pallet count must be a positive integer';
  end if;
  select count(*),
         count(*) filter (where nullif(trim(value->>'sourcePalletNumber'),'') is not null),
         count(distinct public.dm_normalize_warehouse_scope_identifier(
           nullif(trim(value->>'sourcePalletNumber'),'')
         ))
    into v_total_carton_count,v_mapped_carton_count,v_mapped_pallet_count
  from jsonb_array_elements(v_revision.payload_snapshot->'cartons');
  if v_physical_pallet_count is not null and v_mapped_pallet_count>v_physical_pallet_count then
    raise exception 'Mapped pallet count cannot exceed the physical pallet count';
  end if;
  if v_physical_pallet_count is not null
    and v_mapped_carton_count=v_total_carton_count
    and v_mapped_pallet_count<>v_physical_pallet_count then
    raise exception 'Complete pallet mapping must match the physical pallet count';
  end if;

  -- First collect every stable source-scope identifier before validating members.
  for v_carton in select value from jsonb_array_elements(v_revision.payload_snapshot->'cartons') loop
    if jsonb_typeof(v_carton)<>'object'
      or jsonb_typeof(v_carton->'sourceCartonNumber')<>'string' then
      raise exception 'Every schema v3 source scope must be an object with a string identifier';
    end if;
    v_source_scope:=trim(coalesce(v_carton->>'sourceCartonNumber',''));
    if v_source_scope='' then raise exception 'Source scope identifier is required'; end if;
    v_normalized_scope:=public.dm_normalize_warehouse_scope_identifier(v_source_scope);
    if v_normalized_scope=any(v_scope_ids) then
      raise exception 'Duplicate source scope identifier %',v_source_scope;
    end if;
    v_scope_ids:=array_append(v_scope_ids,v_normalized_scope);
  end loop;

  for v_carton in select value from jsonb_array_elements(v_revision.payload_snapshot->'cartons') loop
    v_source_scope:=trim(v_carton->>'sourceCartonNumber');
    v_normalized_scope:=public.dm_normalize_warehouse_scope_identifier(v_source_scope);
    if jsonb_typeof(v_carton->'kind')<>'string' then
      raise exception 'Schema v3 source scope % requires an explicit kind',v_source_scope;
    end if;
    v_scope_kind:=v_carton->>'kind';
    if v_scope_kind not in ('carton','carton_group') then
      raise exception 'Unsupported source scope kind %',v_scope_kind;
    end if;
    if jsonb_typeof(v_carton->'physicalCartonCount')<>'number' then
      raise exception 'Schema v3 source scope % requires an explicit physical carton count',v_source_scope;
    end if;
    begin
      v_physical_carton_count:=(v_carton->>'physicalCartonCount')::integer;
    exception when invalid_text_representation then
      raise exception 'Physical carton count must be a positive integer for %',v_source_scope;
    end;
    if v_physical_carton_count<=0 then
      raise exception 'Physical carton count must be a positive integer for %',v_source_scope;
    end if;
    if jsonb_typeof(v_carton->'memberCartonNumbers')<>'array' then
      raise exception 'Member carton identifiers are required for %',v_source_scope;
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_carton->'memberCartonNumbers') member
      where jsonb_typeof(member.value)<>'string'
    ) then raise exception 'Every member carton identifier must be a string for %',v_source_scope; end if;
    if v_carton ? 'sourcePalletNumber'
      and jsonb_typeof(v_carton->'sourcePalletNumber') not in ('string','null') then
      raise exception 'Source pallet identifier must be a string or null for %',v_source_scope;
    end if;
    if v_scope_kind='carton' and (
      v_physical_carton_count<>1
      or jsonb_array_length(v_carton->'memberCartonNumbers')<>1
    ) then raise exception 'Single-carton scope % must contain exactly one member',v_source_scope; end if;
    if v_scope_kind='carton_group' and (
      v_physical_carton_count<2
      or jsonb_array_length(v_carton->'memberCartonNumbers')<>v_physical_carton_count
    ) then raise exception 'Carton group % member count must equal its physical carton count',v_source_scope; end if;

    for v_member in
      select value,ordinality from jsonb_array_elements_text(v_carton->'memberCartonNumbers') with ordinality
    loop
      if trim(v_member.value)='' then raise exception 'Member carton identifier cannot be blank'; end if;
      v_normalized_member:=public.dm_normalize_warehouse_scope_identifier(v_member.value);
      if v_normalized_member=any(v_member_ids) then
        raise exception 'Member carton identifier % belongs to more than one source scope',v_member.value;
      end if;
      if v_scope_kind='carton_group' and v_normalized_member=any(v_scope_ids) then
        raise exception 'Member carton identifier % cannot also be a source scope',v_member.value;
      end if;
      if v_scope_kind='carton' and v_normalized_member=any(v_scope_ids) and v_normalized_member<>v_normalized_scope then
        raise exception 'Member carton identifier % cannot also be a source scope',v_member.value;
      end if;
      if v_scope_kind='carton' and v_normalized_member<>v_normalized_scope then
        raise exception 'Single-carton member must match source scope %',v_source_scope;
      end if;
      v_member_ids:=array_append(v_member_ids,v_normalized_member);
    end loop;

    if jsonb_typeof(v_carton->'lines')<>'array' or jsonb_array_length(v_carton->'lines')=0 then
      raise exception 'Source scope % requires at least one SKU line',v_source_scope;
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_carton->'lines') line
      where jsonb_typeof(line.value)<>'object'
        or jsonb_typeof(line.value->'sku')<>'string'
        or jsonb_typeof(line.value->'expectedQuantity')<>'number'
    ) then raise exception 'Every source-scope line requires a string SKU and numeric expected quantity'; end if;
    if (select count(*) from jsonb_array_elements(v_carton->'lines')) <>
       (select count(distinct upper(trim(value->>'sku'))) from jsonb_array_elements(v_carton->'lines')) then
      raise exception 'Source scope % contains a duplicate SKU',v_source_scope;
    end if;
    for v_line in select value from jsonb_array_elements(v_carton->'lines') loop
      if trim(coalesce(v_line->>'sku',''))='' then
        raise exception 'Source scope % contains a blank SKU',v_source_scope;
      end if;
      begin
        if (v_line->>'expectedQuantity')::integer<=0 then
          raise exception 'Expected quantity must be positive for SKU %',v_line->>'sku';
        end if;
      exception when invalid_text_representation then
        raise exception 'Expected quantity must be a positive integer for SKU %',v_line->>'sku';
      end;
      select count(*),(array_agg(pol.id order by pol.id))[1]
        into v_purchase_order_line_count,v_purchase_order_line_id
      from public.purchase_order_lines pol
      join public.products product on product.id=pol.product_id
      where pol.purchase_order_id=v_shipment.purchase_order_id
        and upper(product.sku)=upper(trim(v_line->>'sku'));
      if v_purchase_order_line_count<>1 then
        raise exception 'Packing-list SKU % does not resolve to exactly one purchase-order line',v_line->>'sku';
      end if;
    end loop;
  end loop;

  update public.shipment_packing_list_versions set status='superseded'
  where shipment_id=v_revision.shipment_id and status='confirmed';
  delete from public.shipment_carton_lines where carton_id in (
    select id from public.shipment_cartons where shipment_id=v_revision.shipment_id
  );
  delete from public.shipment_cartons where shipment_id=v_revision.shipment_id;
  delete from public.shipment_pallets where shipment_id=v_revision.shipment_id;
  update public.shipments set physical_pallet_count=v_physical_pallet_count
  where id=v_revision.shipment_id;

  for v_carton in select value from jsonb_array_elements(v_revision.payload_snapshot->'cartons') loop
    v_source_scope:=trim(v_carton->>'sourceCartonNumber');
    v_scope_kind:=v_carton->>'kind';
    v_physical_carton_count:=(v_carton->>'physicalCartonCount')::integer;
    v_pallet_number:=nullif(public.dm_normalize_warehouse_scope_identifier(
      coalesce(v_carton->>'sourcePalletNumber','')
    ),'');
    v_pallet_id:=null;
    if v_pallet_number is not null then
      insert into public.shipment_pallets(shipment_id,pallet_number,source_evidence)
      values(v_revision.shipment_id,v_pallet_number,
        jsonb_build_array(jsonb_build_object('packing_list_revision_id',v_revision.id,'schema_version',3)))
      on conflict (shipment_id,pallet_number) do update set source_evidence=excluded.source_evidence
      returning id into v_pallet_id;
    end if;
    insert into public.shipment_cartons(
      shipment_id,pallet_id,carton_number,carton_count,scope_kind,source_evidence
    ) values(
      v_revision.shipment_id,v_pallet_id,v_source_scope,v_physical_carton_count,v_scope_kind,
      jsonb_build_array(jsonb_build_object('packing_list_revision_id',v_revision.id,'schema_version',3))
    ) returning id into v_carton_id;

    insert into public.shipment_carton_members(
      carton_id,shipment_id,member_identifier,member_ordinal,source_evidence
    )
    select v_carton_id,v_revision.shipment_id,member.value,member.ordinality::integer,
      jsonb_build_array(jsonb_build_object('packing_list_revision_id',v_revision.id,'schema_version',3))
    from jsonb_array_elements_text(v_carton->'memberCartonNumbers') with ordinality as member(value,ordinality);

    for v_line in select value from jsonb_array_elements(v_carton->'lines') loop
      select (array_agg(pol.id order by pol.id))[1] into v_purchase_order_line_id
      from public.purchase_order_lines pol
      join public.products product on product.id=pol.product_id
      where pol.purchase_order_id=v_shipment.purchase_order_id
        and upper(product.sku)=upper(trim(v_line->>'sku'));
      insert into public.shipment_carton_lines(
        carton_id,purchase_order_line_id,quantity,source_evidence
      ) values(
        v_carton_id,v_purchase_order_line_id,(v_line->>'expectedQuantity')::integer,
        jsonb_build_array(jsonb_build_object('packing_list_revision_id',v_revision.id,'schema_version',3))
      );
    end loop;
  end loop;

  update public.shipment_packing_list_versions
  set status='confirmed',confirmed_by=p_actor_id,confirmed_at=now()
  where id=v_revision.id returning * into v_revision;
  return jsonb_build_object(
    'id',v_revision.id,'shipment_id',v_revision.shipment_id,'version',v_revision.version,
    'status',v_revision.status,'payload_snapshot',v_revision.payload_snapshot,
    'created_by',v_revision.created_by,'created_at',v_revision.created_at,
    'confirmed_by',v_revision.confirmed_by,'confirmed_at',v_revision.confirmed_at
  );
end;
$$;

revoke all on function public.dm_confirm_packing_list_revision_v21(uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.dm_confirm_packing_list_revision(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.dm_confirm_packing_list_revision(uuid,uuid)
  to service_role;

commit;
