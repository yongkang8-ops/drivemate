-- Remove privileges inherited at table creation without changing schema defaults.
-- Test print history may be read, created and finalised, but never deleted or truncated.
revoke all privileges on table public.warehouse_test_print_jobs from service_role;
grant select, insert, update on table public.warehouse_test_print_jobs to service_role;
