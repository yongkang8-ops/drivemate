# P0 Product Barcode Master Backfill — Local QA

Date: 2026-09-04

Scope: local artifacts and disposable PostgreSQL only

Production writes: none

## Outcome

The authoritative 119-SKU inbound draft now has a deterministic internal Code 128 mapping:

- `DM-GWM-0001` → `DMPGWM0001`
- `DM-GWM-0119` → `DMPGWM0119`
- 119 manifest rows
- 119 unique SKU values
- 119 unique barcode values
- no GS1, EAN or retail GTIN claim

The generator source is the exact v3 inbound draft with SHA-256:

`88BE3FEBC029BD4B575504BBEC691EE84A198FEFF52D1181390D2B2B93E255F0`

## Generated artifacts

| Artifact | SHA-256 |
|---|---|
| `docs/operations/product-master/2026-09-04-gwm-product-barcode-backfill.csv` | `C551FB9BC24EBB7D6D151A1147413AC63CAE5E9BDA77469025D47C3C93371983` |
| `supabase/operations/20260904_p0_product_barcode_backfill.sql` | `49F8FE4F703551CFA7A48D4E25E20F5D35366683F992900B0249B5E2AF9EBECC` |
| `supabase/operations/20260904_p0_product_barcode_backfill_rollback.sql` | `351E015A354EABA7AAA8DDF3A1583073FE3789C8BFD99063B696C9E2B6629859` |

## Automated tests

`npm.cmd test -- tests/product-barcode-backfill.test.ts`

- 1 test file passed
- 6 tests passed
- validates canonical mapping, authoritative row count, duplicate rejection, malformed SKU rejection, atomic SQL guards, rollback guards and artifact generation

## Disposable PostgreSQL execution

The generated SQL was executed against a fresh local PostgreSQL 17 database containing 119 matching products and one active admin actor.

| Scenario | Result |
|---|---|
| First backfill | 119 products updated; 119 unique barcodes; 119 audit rows |
| `updated_at` | updated for all 119 products |
| Idempotent rerun | succeeds; audit count remains 119 |
| Unauthorised rollback | rejected by the explicit rollback lock |
| Authorised rollback before warehouse use | 119 barcodes cleared; 119 rollback audit rows |
| Rollback after one receipt-line reference | rejected; transaction rolled back |

The disposable database container was removed after the checks.

## Repository regression status

| Check | Result |
|---|---|
| TypeScript | passed |
| Vitest | 58 files passed; 286 passed; 1 skipped |
| Next.js Production build | passed; 60 pages generated |
| Playwright | 83 passed; 11 intentionally skipped |
| Sensitive public-code scan | passed |

The existing `verify:staging` smoke stage still reports nine failed assertions: two stale Warehouse copy expectations and seven downstream assertions caused by protected demo/write requests returning `403` or `503`. This P0 task does not modify application routes, Warehouse UI, authentication or smoke-test configuration, so those verifier discrepancies remain a separate existing QA-maintenance item and are not changed here.

## Production execution gate

The backfill SQL has not been run against Production. Before Production execution:

1. create the separately authorised logical backup;
2. rerun the Product and pallet read-only preflight;
3. execute the backfill as the active `lee@drivemateparts.com.au` admin actor;
4. verify 119 exact SKU matches, 119 non-empty unique barcodes and 119 audit rows;
5. only then proceed to the separately authorised v22 migration and application deployment.

The rollback artifact is a reference only. It remains deliberately locked and requires a separate explicit authorization plus a transaction-local unlock. It also refuses rollback after a generated barcode appears in receipt or label-print history.
