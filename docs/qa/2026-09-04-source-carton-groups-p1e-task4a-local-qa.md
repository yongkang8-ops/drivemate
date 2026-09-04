# P1E Task 4A local QA — Operations UI and responsive carton-group workflow

Date: 2026-09-04

Branch: `feature/source-carton-groups-p1e-20260903`

Scope: local code and memory-repository test data only

## Implemented contract

- New Packing List working copies use schema v3.
- Existing v1/v2 confirmed revisions remain unchanged; a new correction working copy upgrades their single cartons to explicit v3 single-carton scopes.
- Pre-arrival exposes single-carton and carton-group fields, physical carton count, member carton numbers, and separate source-scope/physical-carton/group summaries.
- Warehouse can select canonical source scopes or find a scope by scanning/entering a member carton number.
- Member lookup resolves to one canonical parent scope. Label, receipt and putaway state continue to use the parent identifier; member identifiers do not become receivable child scopes.
- Dashboard and Receipt history distinguish source scopes from physical cartons without changing expected or inventory quantities.
- Pallet filters and canonical source-scope filters are mutually exclusive UI selections; full-shipment selection remains available.

## Test evidence

- Red tests first:
  - missing carton-group editor controls;
  - missing member-to-parent Warehouse lookup;
  - missing history scope summarizer.
- Vitest: 57 files passed; 273 tests passed; 1 test skipped (274 total).
- Focused Playwright: 38 tests passed across Pre-arrival, Warehouse, Dashboard and Receipt history.
- TypeScript: `tsc --noEmit` passed.
- Next.js production build: compiled successfully; 60/60 static pages generated.
- `git diff --check`: passed.

## Responsive and visual review

Browser review used the existing DriveMate operations visual system; no new design system was added.

Validated viewport widths:

- 390px: no document-level horizontal overflow; editor and lookup controls stack vertically.
- 701px: no document-level horizontal overflow after switching the Packing structure/detail work area to one column.
- 768px: no document-level horizontal overflow.
- 880px: no document-level horizontal overflow.
- 1280px: two-column desktop information hierarchy remains intact.

The review found and fixed a real 701–880px overflow where the group editor expanded the document to 905px. Source-scope cards were also changed to a stacked layout so long identifiers and the Group badge do not wrap into unreadable vertical text.

## Quantity and safety assertions

- A group `7#8#9#` with three physical cartons and 10 expected units is saved and displayed as one source scope, three physical cartons and 10 units.
- Member `8#` resolves to canonical parent `7#8#9#`.
- The label print POST submits `cartonNumbers: ["7#8#9#"]`; it never submits `8#` as a separate operational scope.
- Unknown member identifiers produce a contained inline message and do not change the active scope.

## Boundaries and residual work

- No GitHub push, Vercel deployment or Production Supabase access occurred.
- No real Packing List, label job, receipt, inventory movement, employee, order or customer record was created.
- Deferred Task 3B/4B per-carton evidence remains intentionally out of scope.
- The next required P1E task is Task 5: generate and reconcile the authoritative 706-unit schema-v3 inbound master-data draft, then run the final full local QA package.
