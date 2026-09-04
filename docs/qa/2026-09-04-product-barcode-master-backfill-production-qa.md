# Product Barcode Master Backfill — Production QA

Date: 2026-09-04

Production project: `gajrgqiwvgjrrbildwme`

Authorised source commit: `56cca49521aa7ffcf38870a6575e94b55d664fa9`

Executed SQL SHA-256: `49F8FE4F703551CFA7A48D4E25E20F5D35366683F992900B0249B5E2AF9EBECC`

## Logical snapshot

Schema: `dm_pre_product_barcode_backfill`

| Check | Result |
|---|---:|
| Snapshot product rows | 119 |
| Snapshot products with nonblank barcode | 0 |
| Relevant pre-backfill product audit rows | 119 |
| Snapshot metadata rows | 1 |
| Snapshot tables with RLS enabled | 3 |

The snapshot metadata retains its database execution time, source commit and SQL SHA-256.

## Backfill verification

| Check | Result |
|---|---:|
| Authoritative mapping rows | 119 |
| Exact SKU-to-barcode matches | 119 |
| Mapping issues | 0 |
| Products with nonblank barcode | 119 |
| Distinct normalized barcodes | 119 |
| Normalized duplicate barcode groups | 0 |
| Products updated after snapshot | 119 |
| Backfill audit rows | 119 |
| Backfill audits with the active `lee@drivemateparts.com.au` admin actor | 119 |

Canonical range:

- `DM-GWM-0001` → `DMPGWM0001`
- `DM-GWM-0119` → `DMPGWM0119`

These are DriveMate internal Code 128 identifiers. They are not represented as GS1, EAN or retail GTIN values.

## Scope confirmation

- v22 was not executed; `shipment_cartons.scope_kind` and `shipment_carton_members` remain absent.
- No GitHub push or Vercel deployment was performed.
- Inventory, orders, customers, employees, environment variables, SMTP, DNS, GST and payment configuration were not changed.
- The rollback reference was not executed.

## Next gate

The Product barcode and pallet-normalization preconditions are now satisfied. Production backup/v22 migration, GitHub push and Vercel Production deployment remain separately authorised actions.
