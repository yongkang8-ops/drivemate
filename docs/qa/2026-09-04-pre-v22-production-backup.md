# Pre-v22 Production Logical Backup

Date: 2026-09-04

Production project: `gajrgqiwvgjrrbildwme`

Backup schema: `dm_pre_v22_backup`

Local v22 SHA-256: `20A5DF6BC0743BDF29D336A611E85B0CE68C6A19F2B7A00553406B81C65FAFAA`

## Snapshot contents

| Object | Rows |
|---|---:|
| `shipments` | 1 |
| `shipment_packing_list_versions` | 0 |
| `shipment_pallets` | 6 |
| `shipment_cartons` | 35 |
| `shipment_carton_lines` | 119 |
| `function_inventory` | 2 |
| `migration_versions` | 12 |
| `metadata` | 1 |

All eight backup tables have Row Level Security enabled. Access for `public`, `anon` and `authenticated` was revoked from the backup schema and tables.

## Function baseline

| Expected signature | Production baseline | Backup result |
|---|---|---|
| `public.dm_confirm_packing_list_revision(uuid,uuid)` | exists | definition, owner, language, security-definer flag, config and ACL captured |
| `public.dm_assert_warehouse_receipt_scope(uuid,jsonb)` | absent | absence explicitly recorded in `function_inventory` |

## Migration baseline

The Production migration registry contains 12 versions and ends at `20260904` (v19). Versions `20260905` (v20), `20260906` (v21) and `20260907` (v22) are not registered.

Production also lacks the v20 `shipments.physical_pallet_count` column. This confirms that v22 cannot be executed directly: the required migration order is v20, then v21, then v22, with each version executed and registered as one controlled migration chain.

## Scope confirmation

- No Production migration was executed.
- No existing business table or function was modified.
- No GitHub push or Vercel deployment was performed.
- Products, barcodes, inventory, orders, customers, employees, environment variables, SMTP, DNS, GST and payment configuration were not changed by this backup task.
