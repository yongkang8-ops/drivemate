-- Local migration artifact only. Requires separate Production approval.
-- No existing product content is inferred, backfilled, or marked print-ready.
begin;

alter table public.products add column if not exists label_profile jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.products'::regclass and conname='products_label_profile_schema_check'
  ) then
    alter table public.products add constraint products_label_profile_schema_check
      check (label_profile is null or (
        jsonb_typeof(label_profile)='object'
        and label_profile @> '{"schemaVersion":1}'::jsonb
      ));
  end if;
end $$;

comment on column public.products.label_profile is
  'Controlled supplementary-label profile. Null/unknown content is not print-ready. No manufacturer identity or fitment is inferred. Application validates the complete schema.';

commit;
