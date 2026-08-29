-- Local review artifact only. Do not execute against Production without separate approval.
begin;

alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;

update public.user_profiles
set role = 'partner'
where role = 'warehouse';

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('public', 'trade', 'partner', 'admin'));

commit;
