-- Local review artifact only. Do not execute against Production without separate approval.
begin;

alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('public', 'trade', 'warehouse_staff', 'partner', 'admin'));

alter table public.user_profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists must_change_password boolean not null default false,
  add column if not exists temporary_password_issued_at timestamptz,
  add column if not exists temporary_password_expires_at timestamptz,
  add column if not exists password_changed_at timestamptz,
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid references auth.users(id) on delete set null,
  add column if not exists disabled_reason text,
  add column if not exists status_before_disabled text,
  add column if not exists last_login_at timestamptz,
  add column if not exists requires_reauthentication boolean not null default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.user_profiles
  drop constraint if exists user_profiles_account_status_check,
  drop constraint if exists user_profiles_staff_lifecycle_check;

alter table public.user_profiles
  add constraint user_profiles_account_status_check
  check (account_status in ('pending_first_login', 'active', 'disabled')),
  add constraint user_profiles_staff_lifecycle_check
  check (
    (
      role not in ('warehouse_staff', 'partner', 'admin')
      and account_status = 'active'
      and must_change_password = false
      and temporary_password_issued_at is null
      and temporary_password_expires_at is null
      and disabled_at is null
      and disabled_by is null
      and disabled_reason is null
      and status_before_disabled is null
      and requires_reauthentication = false
    )
    or
    (
      role in ('warehouse_staff', 'partner', 'admin')
      and (
        (
          account_status = 'active'
          and must_change_password = false
          and temporary_password_issued_at is null
          and temporary_password_expires_at is null
          and disabled_at is null
          and disabled_by is null
          and disabled_reason is null
          and status_before_disabled is null
        )
        or
        (
          account_status = 'pending_first_login'
          and must_change_password = true
          and temporary_password_issued_at is not null
          and temporary_password_expires_at = temporary_password_issued_at + interval '7 days'
          and disabled_at is null
          and disabled_by is null
          and disabled_reason is null
          and status_before_disabled is null
        )
        or
        (
          account_status = 'disabled'
          and disabled_at is not null
          and disabled_by is not null
          and coalesce(trim(disabled_reason), '') <> ''
          and status_before_disabled in ('pending_first_login', 'active')
          and requires_reauthentication = true
          and (
            (
              status_before_disabled = 'active'
              and must_change_password = false
              and temporary_password_issued_at is null
              and temporary_password_expires_at is null
            )
            or
            (
              status_before_disabled = 'pending_first_login'
              and must_change_password = true
              and temporary_password_issued_at is not null
              and temporary_password_expires_at = temporary_password_issued_at + interval '7 days'
            )
          )
        )
      )
    )
  );

create index if not exists user_profiles_staff_status_idx
  on public.user_profiles (account_status, role, created_at desc)
  where role in ('warehouse_staff', 'partner', 'admin');
create index if not exists user_profiles_pending_password_expiry_idx
  on public.user_profiles (temporary_password_expires_at)
  where must_change_password = true and account_status = 'pending_first_login';
create index if not exists user_profiles_disabled_by_idx
  on public.user_profiles (disabled_by)
  where disabled_by is not null;
create index if not exists user_profiles_created_by_idx
  on public.user_profiles (created_by)
  where created_by is not null;
create index if not exists user_profiles_updated_by_idx
  on public.user_profiles (updated_by)
  where updated_by is not null;

create or replace function public.dm_set_user_profile_lifecycle_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, new.created_by, auth.uid());
    new.updated_at := coalesce(new.updated_at, new.created_at, now());
  else
    if new.created_at is distinct from old.created_at
      or new.created_by is distinct from old.created_by then
      raise exception 'Staff account creation fields cannot be changed';
    end if;

    if old.account_status <> 'disabled' and new.account_status = 'disabled' then
      if coalesce(trim(new.disabled_reason), '') = '' then
        raise exception 'A reason is required to disable a staff account';
      end if;
      new.status_before_disabled := old.account_status;
      new.requires_reauthentication := true;
      new.disabled_at := coalesce(new.disabled_at, now());
      new.disabled_by := coalesce(new.disabled_by, auth.uid());
      if new.disabled_by is null then
        raise exception 'The disabling administrator is required';
      end if;
    elsif old.account_status = 'disabled' and new.account_status <> 'disabled' then
      new.account_status := old.status_before_disabled;
      new.disabled_at := null;
      new.disabled_by := null;
      new.disabled_reason := null;
      new.status_before_disabled := null;
    elsif old.account_status = 'disabled' and new.account_status = 'disabled' then
      if new.disabled_at is distinct from old.disabled_at
        or new.disabled_by is distinct from old.disabled_by
        or new.disabled_reason is distinct from old.disabled_reason
        or new.status_before_disabled is distinct from old.status_before_disabled then
        raise exception 'Disabled staff account evidence cannot be changed';
      end if;
    end if;

    if new.role is distinct from old.role then
      new.requires_reauthentication := true;
    end if;

    if old.account_status = 'pending_first_login'
      and new.account_status = 'active'
      and (
        new.must_change_password
        or new.password_changed_at is null
        or new.password_changed_at is not distinct from old.password_changed_at
      ) then
      raise exception 'A recorded password change is required to activate this staff account';
    end if;

    new.updated_at := now();
    new.updated_by := coalesce(new.updated_by, auth.uid(), old.updated_by);
  end if;

  if new.role not in ('warehouse_staff', 'partner', 'admin') then
    if new.account_status <> 'active'
      or new.must_change_password
      or new.temporary_password_issued_at is not null
      or new.temporary_password_expires_at is not null
      or new.disabled_at is not null
      or new.disabled_by is not null
      or new.disabled_reason is not null
      or new.status_before_disabled is not null
      or new.requires_reauthentication then
      raise exception 'Staff lifecycle fields are available only to staff roles';
    end if;
    return new;
  end if;

  if new.must_change_password then
    if new.temporary_password_issued_at is null then
      raise exception 'Temporary password issue time is required';
    end if;
    new.temporary_password_expires_at :=
      new.temporary_password_issued_at + interval '7 days';
  else
    new.temporary_password_issued_at := null;
    new.temporary_password_expires_at := null;
  end if;

  if new.account_status = 'pending_first_login' and not new.must_change_password then
    raise exception 'Pending first login requires a temporary password change';
  end if;
  if new.account_status = 'active' and new.must_change_password then
    raise exception 'An active staff account cannot retain a temporary password';
  end if;

  return new;
end;
$$;

create or replace function public.dm_audit_user_profile_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op = 'INSERT' then
    if new.role not in ('warehouse_staff', 'partner', 'admin') then
      return new;
    end if;
    v_action := 'staff_account_created';
  elsif new.role is distinct from old.role then
    v_action := 'staff_role_changed';
  elsif new.account_status is distinct from old.account_status then
    v_action := case
      when new.account_status = 'disabled' then 'staff_account_disabled'
      when old.account_status = 'disabled' then 'staff_account_reenabled'
      when new.account_status = 'pending_first_login' then 'staff_password_reset_required'
      else 'staff_first_password_completed'
    end;
  elsif new.last_login_at is distinct from old.last_login_at then
    v_action := 'staff_login_recorded';
  elsif new.password_changed_at is distinct from old.password_changed_at then
    v_action := 'staff_password_changed';
  elsif new.display_name is distinct from old.display_name then
    v_action := 'staff_profile_updated';
  else
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_before := jsonb_build_object(
      'role', old.role,
      'account_status', old.account_status,
      'must_change_password', old.must_change_password,
      'requires_reauthentication', old.requires_reauthentication,
      'disabled_reason', old.disabled_reason,
      'display_name', old.display_name,
      'last_login_at', old.last_login_at,
      'created_at', old.created_at,
      'updated_at', old.updated_at
    );
  end if;
  v_after := jsonb_build_object(
    'role', new.role,
    'account_status', new.account_status,
    'must_change_password', new.must_change_password,
    'requires_reauthentication', new.requires_reauthentication,
    'disabled_reason', new.disabled_reason,
    'display_name', new.display_name,
    'last_login_at', new.last_login_at,
    'created_at', new.created_at,
    'updated_at', new.updated_at
  );

  insert into public.audit_events (
    entity_type,
    entity_id,
    action,
    actor_id,
    before_value,
    after_value
  ) values (
    'staff_account',
    new.id::text,
    v_action,
    coalesce(new.updated_by, new.created_by, auth.uid()),
    v_before,
    v_after
  );
  return new;
end;
$$;

drop trigger if exists user_profiles_lifecycle_fields on public.user_profiles;
create trigger user_profiles_lifecycle_fields
  before insert or update on public.user_profiles
  for each row execute function public.dm_set_user_profile_lifecycle_fields();

drop trigger if exists user_profiles_lifecycle_audit on public.user_profiles;
create trigger user_profiles_lifecycle_audit
  after insert or update on public.user_profiles
  for each row execute function public.dm_audit_user_profile_lifecycle();

drop policy if exists "users can read own profile" on public.user_profiles;
create policy "users can read own profile"
on public.user_profiles for select
to authenticated
using (id = (select auth.uid()) or public.current_user_role() = 'admin');

revoke insert, update, delete on public.user_profiles from anon, authenticated;
revoke all on function public.dm_set_user_profile_lifecycle_fields() from public, anon, authenticated;
revoke all on function public.dm_audit_user_profile_lifecycle() from public, anon, authenticated;

commit;
