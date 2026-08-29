-- Local review artifact only. Do not execute against Production without separate approval.
begin;

alter table public.warehouse_label_print_items
  add column if not exists source_item_id uuid
    references public.warehouse_label_print_items(id) on delete restrict;

create or replace function public.dm_create_warehouse_label_print_job_with_items(
  p_template_id text,
  p_payload_snapshot jsonb,
  p_requested_quantity integer,
  p_item_payload_snapshots jsonb,
  p_actor_id uuid default null,
  p_reprint_of_job_id uuid default null,
  p_reprint_reason text default null,
  p_reprint_source_item_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_original public.warehouse_label_print_jobs%rowtype;
  v_original_item_count integer;
  v_selected_item_count integer;
  v_original_item_payloads jsonb;
begin
  if p_template_id is null
    or p_template_id not in ('unit_product', 'receiving_carton', 'bin_location', 'dispatch_shipping') then
    raise exception 'Unsupported warehouse label template';
  end if;
  if jsonb_typeof(p_payload_snapshot) <> 'object' then
    raise exception 'Warehouse label payload snapshot must be an object';
  end if;
  if p_requested_quantity is null or p_requested_quantity <= 0 then
    raise exception 'Requested label quantity must be a positive integer';
  end if;
  if jsonb_typeof(p_item_payload_snapshots) <> 'array'
    or jsonb_array_length(p_item_payload_snapshots) <> p_requested_quantity then
    raise exception 'Label item count must equal the requested quantity';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_item_payload_snapshots) as item(payload_snapshot)
    where jsonb_typeof(item.payload_snapshot) <> 'object'
  ) then
    raise exception 'Label item snapshots must be objects';
  end if;
  if (p_reprint_of_job_id is null) <> (nullif(trim(coalesce(p_reprint_reason, '')), '') is null) then
    raise exception 'A reprint source and reason are required together';
  end if;
  if p_reprint_of_job_id is null and p_reprint_source_item_ids is not null then
    raise exception 'Reprint source item selection requires a reprint source';
  end if;

  if p_reprint_of_job_id is not null then
    select * into v_original
      from public.warehouse_label_print_jobs
      where id = p_reprint_of_job_id
      for key share;
    if v_original.id is null then
      raise exception 'Original warehouse label print job was not found';
    end if;
    select count(*) into v_original_item_count
      from public.warehouse_label_print_items
      where job_id = v_original.id;
    if v_original_item_count <> v_original.requested_quantity then
      raise exception 'Original warehouse label print job is incomplete and cannot be reprinted';
    end if;
    if p_reprint_source_item_ids is null
      or cardinality(p_reprint_source_item_ids) <> p_requested_quantity
      or exists (
        select 1
        from unnest(p_reprint_source_item_ids) as source(item_id)
        group by source.item_id
        having count(*) > 1
      ) then
      raise exception 'Reprint source item selection must match the requested quantity';
    end if;
    select count(*) into v_selected_item_count
      from unnest(p_reprint_source_item_ids) as selected(item_id)
      join public.warehouse_label_print_items as item
        on item.id = selected.item_id
       and item.job_id = v_original.id;
    if v_selected_item_count <> p_requested_quantity then
      raise exception 'Every reprint source item must belong to the original warehouse label job';
    end if;
    select coalesce(jsonb_agg(item.payload_snapshot order by selected.ordinality), '[]'::jsonb)
      into v_original_item_payloads
      from unnest(p_reprint_source_item_ids) with ordinality as selected(item_id, ordinality)
      join public.warehouse_label_print_items as item
        on item.id = selected.item_id
       and item.job_id = v_original.id;
    if v_original.template_id <> p_template_id
      or v_original.payload_snapshot is distinct from p_payload_snapshot
      or v_original_item_payloads is distinct from p_item_payload_snapshots then
      raise exception 'A reprint must reuse the original audited label payload';
    end if;
  end if;

  insert into public.warehouse_label_print_jobs(
    template_id,
    payload_snapshot,
    requested_quantity,
    created_by,
    reprint_of_job_id,
    reprint_reason
  ) values (
    p_template_id,
    p_payload_snapshot,
    p_requested_quantity,
    p_actor_id,
    p_reprint_of_job_id,
    nullif(trim(coalesce(p_reprint_reason, '')), '')
  ) returning id into v_job_id;

  insert into public.warehouse_label_print_items(job_id, sequence, payload_snapshot, source_item_id)
  select
    v_job_id,
    item.ordinality::integer,
    item.payload_snapshot,
    case
      when p_reprint_source_item_ids is null then null
      else p_reprint_source_item_ids[item.ordinality::integer]
    end
  from jsonb_array_elements(p_item_payload_snapshots) with ordinality as item(payload_snapshot, ordinality);

  return v_job_id;
end;
$$;

create or replace function public.dm_record_warehouse_label_print_outcome(
  p_job_id uuid,
  p_outcome text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.warehouse_label_print_jobs%rowtype;
  v_item_count integer;
  v_completed_job_id uuid;
begin
  if p_outcome not in ('printed', 'cancelled') then
    raise exception 'Unsupported warehouse label print outcome';
  end if;
  select * into v_job
    from public.warehouse_label_print_jobs
    where id = p_job_id
    for update;
  if v_job.id is null or v_job.status <> 'pending' then
    return null;
  end if;
  select count(*) into v_item_count
    from public.warehouse_label_print_items
    where job_id = v_job.id;
  if v_item_count <> v_job.requested_quantity then
    return null;
  end if;

  update public.warehouse_label_print_jobs
    set status = p_outcome,
        printed_at = case when p_outcome = 'printed' then now() else null end,
        cancelled_at = case when p_outcome = 'cancelled' then now() else null end
    where id = v_job.id
    returning id into v_completed_job_id;
  return v_completed_job_id;
end;
$$;

revoke all on function public.dm_create_warehouse_label_print_job_with_items(
  text, jsonb, integer, jsonb, uuid, uuid, text, uuid[]
) from public;
revoke all on function public.dm_record_warehouse_label_print_outcome(uuid, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.dm_create_warehouse_label_print_job_with_items(
      text, jsonb, integer, jsonb, uuid, uuid, text, uuid[]
    ) to service_role;
    grant execute on function public.dm_record_warehouse_label_print_outcome(uuid, text) to service_role;
  end if;
end;
$$;

commit;
