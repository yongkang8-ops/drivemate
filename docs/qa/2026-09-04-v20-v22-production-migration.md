# Production v20–v22 Migration QA

Date: 2026-09-04

Production project: `gajrgqiwvgjrrbildwme`

Pre-migration backup: `dm_pre_v22_backup`

## Migration registration

| Version | Name | LF-normalized SHA-256 | Registered statements |
|---|---|---|---:|
| `20260905` | `v20_optional_pallet_mapping` | `4B20B2CC53B650B18B72E7FAB00EA731D164B12DE607701874FD8B522D4CFA52` | 1 |
| `20260906` | `v21_warehouse_receipt_scope_protection` | `24F23766D383A092DA6B15858F9352CA89A37CD5BF0B1E601F3F40220F06569E` | 1 |
| `20260907` | `v22_source_carton_group_projection` | `20A5DF6BC0743BDF29D336A611E85B0CE68C6A19F2B7A00553406B81C65FAFAA` | 1 |

Each migration body and its `supabase_migrations.schema_migrations` registration were committed in the same database transaction. The registry now contains 15 versions and ends at `20260907`.

## v20 verification

- `shipments.physical_pallet_count` exists.
- `shipments_physical_pallet_count_positive` exists.
- `dm_confirm_packing_list_revision(uuid,uuid)` exists.
- Existing data remained at one shipment, six pallet rows, 35 carton/source-scope rows and 119 carton lines.

## v21 verification

- `warehouse_receipt_sessions.request_fingerprint` exists.
- `dm_normalize_warehouse_scope_identifier(text)` exists.
- `dm_assert_warehouse_receipt_scope(uuid,jsonb)` exists.
- The v20 confirmation function is retained as `dm_confirm_packing_list_revision_v20(uuid,uuid)`.
- Existing receipt sessions have no null request fingerprints.
- The public confirmation wrapper is executable by `service_role` and not by `anon`.

## v22 verification

- `shipment_cartons.scope_kind` exists and all 35 historical rows remain `carton`.
- `shipment_pallets.normalized_pallet_number` exists.
- `shipment_pallets_normalized_number_unique` exists.
- Six pallet rows produce six distinct normalized identifiers; duplicate groups: 0.
- `shipment_carton_members` exists with Row Level Security enabled.
- `shipment_carton_members` contains zero rows because no schema-v3 Packing List has been confirmed in Production.
- The v21 confirmation and receipt-scope functions remain as internal compatibility functions.
- The public confirmation wrapper remains executable only by `service_role`; `anon` and `authenticated` have no execution permission.
- `service_role` has no direct execution permission on the internal v21 functions.
- `anon` and `authenticated` have no `SELECT` permission on `shipment_carton_members`.

## Data preservation

All pre-existing shipment table row counts still match `dm_pre_v22_backup`:

| Table | Rows after migration |
|---|---:|
| `shipments` | 1 |
| `shipment_packing_list_versions` | 0 |
| `shipment_pallets` | 6 |
| `shipment_cartons` | 35 |
| `shipment_carton_lines` | 119 |

The 119 Product barcodes remain populated. No Packing List revision, receipt, stock movement, order, customer or employee record was created or changed by this migration task.

## Scope confirmation

- No GitHub push or Vercel deployment was performed.
- No environment variable, SMTP, DNS, GST or payment configuration was changed.
- The 706-unit schema-v3 Packing List has not been imported or confirmed.
