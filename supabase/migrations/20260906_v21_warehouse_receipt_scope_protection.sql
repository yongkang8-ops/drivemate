-- Local review artifact only. Do not execute against Production without separate approval.
begin;

alter table public.warehouse_receipt_sessions
  add column if not exists request_fingerprint text;

create or replace function public.dm_normalize_warehouse_scope_identifier(p_value text)
returns text language sql immutable strict
as $$ select regexp_replace(upper(trim(p_value)), '\s+', ' ', 'g') $$;

create or replace function public.dm_warehouse_receipt_request_fingerprint(
  p_scope_snapshot jsonb, p_mode text, p_lines jsonb
) returns text language sql immutable strict
as $$
  select encode(extensions.digest(jsonb_build_object(
    'shipmentId', lower(trim(p_scope_snapshot->>'shipmentId')),
    'cartons', (select jsonb_agg(public.dm_normalize_warehouse_scope_identifier(value) order by public.dm_normalize_warehouse_scope_identifier(value))
      from jsonb_array_elements_text(p_scope_snapshot->'cartonNumbers')),
    'mode', p_mode,
    'expected', (select jsonb_agg(jsonb_build_array(
        upper(trim(value->>'sku')),upper(trim(value->>'productBarcode')),(value->>'expectedQuantity')::integer
      ) order by upper(trim(value->>'sku')),upper(trim(value->>'productBarcode')))
      from jsonb_array_elements(p_scope_snapshot->'lines')),
    'actual', (select jsonb_agg(jsonb_build_array(
        upper(trim(value->>'sku')),upper(trim(value->>'productBarcode')),
        (value->>'expectedQuantity')::integer,(value->>'actualQuantity')::integer,
        coalesce(value->'discrepancy'->>'type',''),coalesce(trim(value->'discrepancy'->>'reason'),'')
      ) order by upper(trim(value->>'sku')),upper(trim(value->>'productBarcode')))
      from jsonb_array_elements(p_lines))
  )::text, 'sha256'), 'hex')
$$;

create or replace function public.dm_assert_warehouse_receipt_scope(
  p_shipment_id uuid, p_scope_snapshot jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_payload jsonb; v_version integer; v_scope text; v_line jsonb;
  v_expected integer; v_matches integer; v_barcode text;
begin
  select payload_snapshot,
         coalesce(nullif(payload_snapshot->>'schemaVersion','')::integer,1)
    into v_payload,v_version
    from public.shipment_packing_list_versions
    where shipment_id=p_shipment_id and status='confirmed'
    order by version desc limit 1;
  if v_payload is null then raise exception 'Confirmed packing list was not found for this shipment'; end if;
  if jsonb_typeof(p_scope_snapshot)<>'object'
    or p_scope_snapshot->>'shipmentId'<>p_shipment_id::text
    or jsonb_typeof(p_scope_snapshot->'cartonNumbers')<>'array'
    or jsonb_array_length(p_scope_snapshot->'cartonNumbers')=0
    or jsonb_typeof(p_scope_snapshot->'lines')<>'array'
    or jsonb_array_length(p_scope_snapshot->'lines')=0 then
    raise exception 'Warehouse receipt scope is invalid';
  end if;
  if (select count(*) from jsonb_array_elements_text(p_scope_snapshot->'cartonNumbers')) <>
     (select count(distinct public.dm_normalize_warehouse_scope_identifier(value)) from jsonb_array_elements_text(p_scope_snapshot->'cartonNumbers')) then
    raise exception 'Select each source scope once';
  end if;
  for v_scope in select public.dm_normalize_warehouse_scope_identifier(value)
    from jsonb_array_elements_text(p_scope_snapshot->'cartonNumbers') loop
    if not exists (
      select 1 from (
        select carton->>'sourceCartonNumber' as source_number
          from jsonb_array_elements(case when v_version=1 then
            (select coalesce(jsonb_agg(carton),'[]') from jsonb_array_elements(v_payload->'pallets') pallet
              cross join lateral jsonb_array_elements(pallet->'cartons') carton)
            else v_payload->'cartons' end) carton
      ) scopes where public.dm_normalize_warehouse_scope_identifier(source_number)=v_scope
    ) then raise exception 'Selected carton % is not a canonical source scope',v_scope; end if;
  end loop;
  for v_line in select value from jsonb_array_elements(p_scope_snapshot->'lines') loop
    select coalesce(sum((line->>'expectedQuantity')::integer),0)
      into v_expected
      from jsonb_array_elements(case when v_version=1 then
        (select coalesce(jsonb_agg(carton),'[]') from jsonb_array_elements(v_payload->'pallets') pallet
          cross join lateral jsonb_array_elements(pallet->'cartons') carton)
        else v_payload->'cartons' end) carton
      cross join lateral jsonb_array_elements(carton->'lines') line
      where public.dm_normalize_warehouse_scope_identifier(carton->>'sourceCartonNumber') in
        (select public.dm_normalize_warehouse_scope_identifier(value) from jsonb_array_elements_text(p_scope_snapshot->'cartonNumbers'))
        and upper(trim(line->>'sku'))=upper(trim(v_line->>'sku'));
    select count(*),max(barcode) into v_matches,v_barcode from public.products
      where upper(sku)=upper(trim(v_line->>'sku'));
    if v_expected<=0 or v_expected<>(v_line->>'expectedQuantity')::integer
      or v_matches<>1 or upper(coalesce(v_barcode,''))<>upper(trim(v_line->>'productBarcode')) then
      raise exception 'Warehouse receipt line does not match the confirmed source scope';
    end if;
  end loop;
  select count(distinct upper(trim(line->>'sku'))) into v_expected
    from jsonb_array_elements(case when v_version=1 then
      (select coalesce(jsonb_agg(carton),'[]') from jsonb_array_elements(v_payload->'pallets') pallet
        cross join lateral jsonb_array_elements(pallet->'cartons') carton)
      else v_payload->'cartons' end) carton
    cross join lateral jsonb_array_elements(carton->'lines') line
    where public.dm_normalize_warehouse_scope_identifier(carton->>'sourceCartonNumber') in
      (select public.dm_normalize_warehouse_scope_identifier(value) from jsonb_array_elements_text(p_scope_snapshot->'cartonNumbers'));
  if v_expected<>jsonb_array_length(p_scope_snapshot->'lines') then
    raise exception 'Warehouse receipt lines do not cover the confirmed source scope';
  end if;
end;
$$;

create or replace function public.dm_packing_carton_contract(p_payload jsonb,p_scope text)
returns jsonb language sql immutable strict
as $$
  with source as (
    select coalesce(nullif(p_payload->>'schemaVersion','')::integer,1) version
  ), cartons as (
    select carton from source, lateral jsonb_array_elements(case when version=1 then
      (select coalesce(jsonb_agg(carton),'[]') from jsonb_array_elements(p_payload->'pallets') pallet
        cross join lateral jsonb_array_elements(pallet->'cartons') carton)
      else p_payload->'cartons' end) carton
  ), target as (
    select carton from cartons where public.dm_normalize_warehouse_scope_identifier(carton->>'sourceCartonNumber')=
      public.dm_normalize_warehouse_scope_identifier(p_scope)
  )
  select jsonb_build_object(
    'kind',coalesce(carton->>'kind','carton'),
    'count',coalesce((carton->>'physicalCartonCount')::integer,1),
    'members',(select jsonb_agg(public.dm_normalize_warehouse_scope_identifier(value) order by public.dm_normalize_warehouse_scope_identifier(value))
      from jsonb_array_elements_text(coalesce(carton->'memberCartonNumbers',jsonb_build_array(carton->>'sourceCartonNumber')))),
    'lines',(select jsonb_agg(jsonb_build_array(upper(trim(value->>'sku')),(value->>'expectedQuantity')::integer,
      coalesce(value->>'batchLot','')) order by upper(trim(value->>'sku')),coalesce(value->>'batchLot','')) from jsonb_array_elements(carton->'lines'))
  ) from target
$$;

create or replace function public.dm_assert_used_packing_scopes_preserved(p_revision_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare v_target public.shipment_packing_list_versions%rowtype; v_previous jsonb; v_scope text;
begin
  select * into v_target from public.shipment_packing_list_versions where id=p_revision_id;
  if not found or v_target.status<>'draft' then return; end if;
  select payload_snapshot into v_previous from public.shipment_packing_list_versions
    where shipment_id=v_target.shipment_id and status='confirmed' order by version desc limit 1;
  if v_previous is null then return; end if;
  for v_scope in
    select distinct public.dm_normalize_warehouse_scope_identifier(scope_number)
    from (
      select jsonb_array_elements_text(scope_snapshot->'cartonNumbers') scope_number
        from public.warehouse_receipt_sessions where shipment_id=v_target.shipment_id and status<>'cancelled'
      union all
      select jsonb_array_elements_text(payload_snapshot->'cartonNumbers')
        from public.warehouse_label_print_jobs where template_id='unit_product' and status='printed'
          and payload_snapshot->>'shipmentId'=v_target.shipment_id::text
    ) used
  loop
    if public.dm_packing_carton_contract(v_previous,v_scope) is null
      or public.dm_packing_carton_contract(v_previous,v_scope) is distinct from
         public.dm_packing_carton_contract(v_target.payload_snapshot,v_scope) then
      raise exception 'A used source scope cannot be renamed, split or have its expected contents changed';
    end if;
  end loop;
end;
$$;

alter function public.dm_record_warehouse_label_print_outcome(uuid,text)
  rename to dm_record_warehouse_label_print_outcome_v18;

create function public.dm_record_warehouse_label_print_outcome(p_job_id uuid,p_outcome text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare
  v_job public.warehouse_label_print_jobs%rowtype;
  v_shipment_id uuid;
begin
  if p_outcome='printed' then
    select * into v_job from public.warehouse_label_print_jobs where id=p_job_id;
    if not found or v_job.status<>'pending' then return null; end if;
    if v_job.template_id='unit_product' then
      begin
        v_shipment_id:=nullif(v_job.payload_snapshot->>'shipmentId','')::uuid;
      exception when invalid_text_representation then
        raise exception 'Unit Product label job has an invalid shipment scope';
      end;
      if v_shipment_id is null then
        raise exception 'Unit Product label job has an invalid shipment scope';
      end if;
      -- Serialize against Packing List confirmation for the same shipment.
      perform pg_advisory_xact_lock(hashtextextended(v_shipment_id::text,617));
      select * into v_job from public.warehouse_label_print_jobs where id=p_job_id;
      if not found or v_job.status<>'pending' then return null; end if;
      perform public.dm_assert_warehouse_receipt_scope(v_shipment_id,v_job.payload_snapshot);
    end if;
  end if;
  return public.dm_record_warehouse_label_print_outcome_v18(p_job_id,p_outcome);
end;
$$;

alter function public.dm_create_warehouse_receipt_session(uuid,jsonb,text,jsonb,text,uuid)
  rename to dm_create_warehouse_receipt_session_v15;
alter function public.dm_confirm_warehouse_receipt_session(uuid,uuid)
  rename to dm_confirm_warehouse_receipt_session_v15;

create function public.dm_create_warehouse_receipt_session(
  p_shipment_id uuid,p_scope_snapshot jsonb,p_mode text,p_lines jsonb,
  p_idempotency_key text,p_actor_id uuid default null
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_existing public.warehouse_receipt_sessions%rowtype; v_id uuid; v_fingerprint text;
begin
  if coalesce(trim(p_idempotency_key),'')='' then raise exception 'Idempotency key is required'; end if;
  -- Keys are globally unique; bind their payload before taking the shipment lock.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0));
  perform pg_advisory_xact_lock(hashtextextended(p_shipment_id::text,617));
  v_fingerprint:=public.dm_warehouse_receipt_request_fingerprint(p_scope_snapshot,p_mode,p_lines);
  select * into v_existing from public.warehouse_receipt_sessions where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.shipment_id<>p_shipment_id or v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Idempotency key was already used for a different receipt request';
    end if;
    return v_existing.id;
  end if;
  perform public.dm_assert_warehouse_receipt_scope(p_shipment_id,p_scope_snapshot);
  if exists (
    select 1 from public.warehouse_receipt_sessions existing
    where existing.shipment_id=p_shipment_id and existing.status='confirmed'
      and exists (select 1 from jsonb_array_elements_text(existing.scope_snapshot->'cartonNumbers') old_scope
        join jsonb_array_elements_text(p_scope_snapshot->'cartonNumbers') new_scope
        on public.dm_normalize_warehouse_scope_identifier(old_scope.value)=public.dm_normalize_warehouse_scope_identifier(new_scope.value))
  ) then raise exception 'This source scope overlaps an already confirmed receipt'; end if;
  v_id:=public.dm_create_warehouse_receipt_session_v15(p_shipment_id,p_scope_snapshot,p_mode,p_lines,p_idempotency_key,p_actor_id);
  update public.warehouse_receipt_sessions set request_fingerprint=v_fingerprint where id=v_id;
  return v_id;
end;
$$;

create function public.dm_confirm_warehouse_receipt_session(p_session_id uuid,p_actor_id uuid default null)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_session public.warehouse_receipt_sessions%rowtype;
begin
  select * into v_session from public.warehouse_receipt_sessions where id=p_session_id;
  if not found then raise exception 'Warehouse receipt session was not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_session.shipment_id::text,617));
  select * into v_session from public.warehouse_receipt_sessions where id=p_session_id for update;
  if v_session.status='confirmed' then return v_session.id; end if;
  perform public.dm_assert_warehouse_receipt_scope(v_session.shipment_id,v_session.scope_snapshot);
  if exists (
    select 1 from public.warehouse_receipt_sessions existing
    where existing.id<>v_session.id and existing.shipment_id=v_session.shipment_id and existing.status='confirmed'
      and exists (select 1 from jsonb_array_elements_text(existing.scope_snapshot->'cartonNumbers') old_scope
        join jsonb_array_elements_text(v_session.scope_snapshot->'cartonNumbers') new_scope
        on public.dm_normalize_warehouse_scope_identifier(old_scope.value)=public.dm_normalize_warehouse_scope_identifier(new_scope.value))
  ) then raise exception 'This source scope overlaps an already confirmed receipt'; end if;
  return public.dm_confirm_warehouse_receipt_session_v15(p_session_id,p_actor_id);
end;
$$;

alter function public.dm_confirm_packing_list_revision(uuid,uuid)
  rename to dm_confirm_packing_list_revision_v20;

create function public.dm_confirm_packing_list_revision(p_revision_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_shipment_id uuid;
begin
  select shipment_id into v_shipment_id from public.shipment_packing_list_versions where id=p_revision_id;
  if v_shipment_id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_shipment_id::text,617));
  perform public.dm_assert_used_packing_scopes_preserved(p_revision_id);
  return public.dm_confirm_packing_list_revision_v20(p_revision_id,p_actor_id);
end;
$$;

update public.warehouse_receipt_sessions session
set request_fingerprint=public.dm_warehouse_receipt_request_fingerprint(
  session.scope_snapshot,session.mode,
  (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'sku',line.sku,'productBarcode',line.product_barcode,'expectedQuantity',line.expected_quantity,
    'actualQuantity',line.actual_quantity,'discrepancy',case when discrepancy.id is null then null else
      jsonb_build_object('type',discrepancy.discrepancy_type,'reason',discrepancy.reason) end
  )) order by line.id),'[]') from public.warehouse_receipt_session_lines line
    left join public.warehouse_receipt_discrepancies discrepancy on discrepancy.receipt_session_line_id=line.id
    where line.receipt_session_id=session.id)
) where request_fingerprint is null;

revoke all on function public.dm_normalize_warehouse_scope_identifier(text) from public,anon,authenticated,service_role;
revoke all on function public.dm_warehouse_receipt_request_fingerprint(jsonb,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.dm_assert_warehouse_receipt_scope(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.dm_packing_carton_contract(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.dm_assert_used_packing_scopes_preserved(uuid) from public,anon,authenticated,service_role;
revoke all on function public.dm_record_warehouse_label_print_outcome_v18(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.dm_create_warehouse_receipt_session_v15(uuid,jsonb,text,jsonb,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.dm_confirm_warehouse_receipt_session_v15(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.dm_confirm_packing_list_revision_v20(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.dm_create_warehouse_receipt_session(uuid,jsonb,text,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.dm_confirm_warehouse_receipt_session(uuid,uuid) from public,anon,authenticated;
revoke all on function public.dm_confirm_packing_list_revision(uuid,uuid) from public,anon,authenticated;
revoke all on function public.dm_record_warehouse_label_print_outcome(uuid,text) from public,anon,authenticated;
grant execute on function public.dm_create_warehouse_receipt_session(uuid,jsonb,text,jsonb,text,uuid) to service_role;
grant execute on function public.dm_confirm_warehouse_receipt_session(uuid,uuid) to service_role;
grant execute on function public.dm_confirm_packing_list_revision(uuid,uuid) to service_role;
grant execute on function public.dm_record_warehouse_label_print_outcome(uuid,text) to service_role;

commit;
