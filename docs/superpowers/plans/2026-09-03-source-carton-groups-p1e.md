# P1E Source Carton Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist grouped source cartons as stable receipt scopes, report physical carton totals accurately, and append later per-carton evidence without changing stock.

**Architecture:** Add a backward-compatible schema v3 domain contract, project source scopes separately from physical cartons, and keep allocation/observation evidence in an append-only side record. Receipt identities remain the source-scope identifiers; member cartons are lookup aliases only.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 7, Zod 4, Vitest 4, Playwright 1.62, Supabase PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-09-03-source-carton-groups-p1e-design.md`

## Global Constraints

- Work only in the isolated local worktree on `feature/source-carton-groups-p1e-20260903`.
- Do not push, deploy, connect to Production, modify secrets, or write real business data.
- Preserve v1/v2 revision payloads without rewriting snapshots or inferring groups from strings.
- A carton group is one stable receipt scope. Its physical carton count does not multiply product quantity.
- Carton-detail evidence never writes stock balances, movements, receipt sessions or putaway records.
- The 706-unit source of truth is the exact-hash final PI and customer Packing List described in the spec.
- Preserve existing public routes, trade account behavior, role boundaries and English UI register.

---

### Task 1: Schema v3 domain, route and draft validation

**Files:**
- Modify: `lib/prearrivalShipment.ts`
- Modify: `lib/prearrivalDraftValidation.ts`
- Modify: `app/api/prearrival/shipments/[shipmentId]/revisions/route.ts`
- Test: `tests/prearrival-shipment.test.ts`
- Test: `tests/prearrival-draft-validation.test.ts`
- Test: `tests/prearrival-revision-validation-route.test.ts`

**Interfaces:**
- Produces `PackingListRevisionInputV3`, `PackingListCartonScopeInput`, and `deriveCartonStructureSummary()`.
- `deriveCartonStructureSummary(input)` returns `{ sourceScopeCount, physicalCartonCount, cartonGroupCount }`.
- Normalized cartons expose `kind`, `physicalCartonCount`, and `memberCartonNumbers` while v1/v2 default to one physical carton.

- [ ] Write a failing domain test with one single carton and groups `7#8#9#` and `10#11#`; assert 3 scopes, 6 physical cartons and unchanged SKU quantity.
- [ ] Run the focused test and verify it fails because schema v3 is unsupported.
- [ ] Add failing validation tests for duplicate members, a member duplicated as a single scope, member-count mismatch, group count below 2 and blank members.
- [ ] Implement the v3 discriminated types, normalization, independent structure summary and validations; keep v1/v2 behavior unchanged.
- [ ] Extend Zod and field-path validation for v3 and verify malformed route requests return 400 with field errors.
- [ ] Run focused tests and commit only Task 1 files.

### Task 2: Downstream scope projections and overlap protection

**Files:**
- Modify: `lib/warehouseLabels.ts`
- Modify: `lib/warehouseInboundScope.ts`
- Modify: `lib/warehouseReceiving.ts`
- Modify: `lib/repository.ts`
- Modify: `lib/memoryRepository.ts`
- Create: `supabase/migrations/20260906_v21_warehouse_receipt_scope_protection.sql`
- Create: `tests/sql/warehouse-receipt-scope-protection.sql`
- Create: `tests/sql/warehouse-receipt-concurrency-setup.sql`
- Test: `tests/warehouseLabels.test.ts`
- Test: `tests/warehouse-receiving.test.ts`
- Test: `tests/warehouse-prearrival-receiving.test.ts`
- Test: `tests/warehouse-receipt-api.test.ts`

**Interfaces:**
- A `WarehouseExpectedReceipt` carton includes `{ sourceCartonNumber, kind, physicalCartonCount, memberCartonNumbers, sourcePalletNumber? }`.
- Member-number UI lookup locates exactly one parent scope. `resolveWarehouseInboundScope()` only accepts canonical source scopes on operational API requests, rejecting member-only or parent-plus-member submissions.
- `assertReceiptScopeAvailable()` rejects overlap with an already confirmed receipt unless the call is an idempotent replay.

- [ ] Write failing tests proving group label quantities remain 10 and member lookup identifies the parent group without adding a new receipt scope.
- [ ] Write failing tests proving an unknown member and parent-plus-member selection are rejected.
- [ ] Write a failing repository test: confirm a group, then submit the parent, member alias or full-shipment overlap under a new idempotency key; assert no second receipt and no second stock movement.
- [ ] Implement group metadata propagation, canonical parent-scope resolution and overlap checks in memory repository and shared validation.
- [ ] Add a v21 database wrapper that validates current confirmed source scopes and serializes confirmation per shipment; execute sequential and concurrent tests on a disposable local PostgreSQL/Supabase image.
- [ ] Preserve exact replay behavior for the same idempotency key and run focused tests.
- [ ] Commit only Task 2 files.

### Task 3A: Required generic v3 database projection

**Files:**
- Create: `supabase/migrations/20260907_v22_source_carton_group_projection.sql`
- Test: `tests/source-carton-groups-migration.test.ts`
- Modify: `tests/migration-order.test.ts`
- Create: `tests/sql/source-carton-groups-v3-projection.sql`

**Interfaces:**
- `shipment_cartons` remains the stable source-scope projection; `carton_count` stores physical carton count and `scope_kind` distinguishes `carton | carton_group`.
- `shipment_carton_members` stores normalized member identifiers with shipment-level uniqueness.
- `dm_confirm_packing_list_revision` accepts schema v3 while delegating v1/v2 unchanged.

- [x] Write failing migration contract tests for generic scope/member projection, v1/v2 delegation and migration order.
- [x] Add v22 tables, constraints and transaction support for schema v3 without supplier, freight-provider or file-format coupling.
- [x] Execute initial through v22 on a disposable local Supabase PostgreSQL runtime.
- [x] Verify generic identifiers, physical-carton totals, optional pallet mapping, rollback safety, no stock side effects and v1/v2 compatibility.
- [x] Run full local QA, independent review and commit only Task 3A files.

### Deferred Task 3B: Append-only per-carton detail evidence

Deferred until a real per-member allocation, carton-loss/damage traceability need, or warehouse unopened-carton lookup requirement exists. It will contain the previously planned immutable `packing_allocation | observed_contents` versions, private GET/POST API, audit trail and later right-side drawer. It is not a dependency for label printing, group receipt, staging, putaway or inventory.

### Task 4A: Required Operations UI and responsive group workflow

**Files:**
- Modify: `components/PrearrivalShipmentPanel.tsx`
- Modify: `components/PartnerInboundWorkspace.tsx`
- Modify: `components/PartnerDashboard.tsx`
- Modify: `lib/warehouseDashboard.ts`
- Modify: `lib/warehouseHistory.ts`
- Modify: `app/globals.css`
- Test: `tests/prearrival-shipments.spec.ts`
- Test: `tests/warehouse-inbound-workspace.spec.ts`
- Test: `tests/warehouse-dashboard.test.ts`
- Test: `tests/warehouse-history.test.ts`

**Interfaces:**
- UI consumes the Task 1 carton structure summary and Task 3A v3 source-scope contract.
- Operational submissions always emit canonical parent scope identifiers.

- [ ] Write failing browser/component tests for carton/group fields, 35-vs-38 summary labels, group total copy and Warehouse group selection.
- [ ] Implement the existing-system UI: explicit labels above inputs, inline errors, stable state feedback and member lookup without adding another design system.
- [ ] Add dashboard and history source-scope/physical-carton projections without changing inventory arithmetic.
- [ ] Verify keyboard operation and 390/701/768/880/1280px layouts; run focused Playwright.
- [ ] Commit only Task 4A files.

### Deferred Task 4B: Per-carton evidence UI

Deferred with Task 3B. It will add the right-side detail drawer, packing/observed modes, unsaved-close confirmation, evidence completeness status and version-history events only after the underlying evidence subsystem is justified.

### Task 5: Authoritative 706-unit v3 draft and full local QA

**Files:**
- Create: `docs/operations/inbound/2026-09-03-gwm-706-unit-inbound-master-data-v3.json`
- Create: `docs/operations/inbound/2026-09-03-gwm-706-unit-inbound-master-data-v3-lines.csv`
- Create: `docs/operations/inbound/2026-09-03-gwm-706-unit-inbound-master-data-v3-reconciliation.md`
- Modify: `tests/inbound-master-data-draft.test.ts`
- Create: `docs/qa/2026-09-03-source-carton-groups-p1e-local-qa.md`

**Interfaces:**
- The new draft uses schema v3 and exposes separate `packingListDataReady`, `productBarcodeReadiness`, and `productionImportAuthorized` fields.

- [ ] Add failing draft assertions for the exact 35 scopes, 38 cartons, 2 groups, 119 SKUs, 706 units, 4 physical pallets, no mappings and 40 shock absorbers.
- [ ] Generate a new v3 draft from the existing audited source values without modifying the prior draft or source workbooks.
- [ ] Set Packing List data readiness true, barcode readiness unknown until Production is checked, and Production import authorization false.
- [ ] Run all Vitest tests, typecheck, Next.js production build, focused Playwright and `git diff --check`.
- [ ] Record exact pass/fail/skip counts, local database execution status, responsive evidence and residual risks in the QA report.
- [ ] Commit the new draft, test and QA report; do not push or deploy.
