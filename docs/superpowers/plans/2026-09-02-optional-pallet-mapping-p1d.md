# P1D Optional Pallet Mapping Implementation Plan

> **Execution rule:** Implement task-by-task with test-driven development. Production migration, push and deployment remain separately authorised actions.

**Goal:** Make pallet mapping optional and auditable without weakening carton/SKU validation or disrupting label, receipt and putaway flows.

**Architecture:** Introduce a versioned carton-first `PackingListRevisionInputV2`, normalize legacy v1 payloads into one validated domain model, project physical and mapped pallet facts separately, and update the v20 confirmation function to persist nullable carton pallet links.

**Tech stack:** Next.js 16 App Router, React 19, TypeScript 7, Zod 4, Vitest 4, Playwright 1.62, Supabase PostgreSQL.

---

## Task 1: Versioned domain model and validation

**Files:**
- Modify `lib/prearrivalShipment.ts`
- Modify `lib/prearrivalDraftValidation.ts`
- Modify `tests/prearrival-shipment.test.ts`
- Modify `tests/prearrival-draft-validation.test.ts`

- [ ] Add RED tests for v2 without pallet mapping, partial mapping, complete mapping, excessive mapped pallet count and v1 compatibility.
- [ ] Add v1/v2 input unions and a normalized validated v2 model.
- [ ] Add `derivePalletMappingSummary()` as the single status/count projection.
- [ ] Update draft field validation to carton-first paths and optional pallet values.
- [ ] Run focused Vitest and reach GREEN.

## Task 2: API contract and repository compatibility

**Files:**
- Modify `app/api/prearrival/shipments/[shipmentId]/revisions/route.ts`
- Modify `lib/repository.ts`
- Modify `lib/memoryRepository.ts`
- Modify `lib/supabaseRepository.ts`
- Modify `tests/prearrival-revision-validation-route.test.ts`
- Modify `tests/prearrival-shipment.test.ts`

- [ ] Add RED route tests for v2 optional mapping and malformed physical pallet counts.
- [ ] Extend the Zod route schema with discriminated v2 and legacy v1 branches.
- [ ] Normalize before repository creation while retaining immutable payload semantics.
- [ ] Ensure memory and Supabase repositories read legacy snapshots and new v2 snapshots.
- [ ] Run focused repository and route tests to GREEN.

## Task 3: v20 local migration draft

**Files:**
- Create `supabase/migrations/20260905_v20_optional_pallet_mapping.sql`
- Create `tests/optional-pallet-mapping-migration.test.ts`
- Modify `tests/migration-order.test.ts`

- [ ] Write RED static-contract tests for the nullable pallet branch, physical pallet count constraint, v1 compatibility and absence of synthetic pallet values.
- [ ] Add the v20 migration with the updated atomic confirmation function.
- [ ] Verify migration ordering and SQL safety contracts.
- [ ] Do not execute the migration against Production.

## Task 4: Pre-arrival UI

**Files:**
- Modify `components/PrearrivalShipmentPanel.tsx`
- Modify `app/globals.css`
- Modify `tests/prearrival-shipments.spec.ts`

- [ ] Add RED browser tests for no mapping, partial mapping, later revision mapping and responsive layouts.
- [ ] Convert the editor to carton-first navigation.
- [ ] Add physical pallet count and computed mapping status.
- [ ] Mark pallet number optional and remove every `UNASSIGNED` projection.
- [ ] Retain accessible field errors and immutable revision recovery behavior.
- [ ] Run focused Playwright to GREEN.

## Task 5: Downstream labels, Dashboard and receiving regression

**Files:**
- Modify `lib/warehouseLabels.ts`
- Modify `components/PartnerInboundWorkspace.tsx`
- Modify `lib/warehouseDashboard.ts`
- Modify `components/PartnerDashboard.tsx`
- Modify relevant warehouse and dashboard tests

- [ ] Add RED tests proving unmapped cartons remain available for full-shipment, carton and SKU scopes.
- [ ] Disable pallet-only selection when no real mapping exists.
- [ ] Project physical and mapped pallet counts separately on Dashboard.
- [ ] Verify receipt, staging and putaway remain carton-driven.
- [ ] Run focused Vitest and Playwright to GREEN.

## Task 6: Full local QA

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Run focused Pre-arrival, Warehouse and Dashboard Playwright suites.
- [ ] Run `git diff --check` and inspect exact file scope.
- [ ] Create `docs/qa/2026-09-02-optional-pallet-mapping-p1d-local-qa.md` with exact results and remaining risks.

## Task 7: Generate the 706-unit local master-data draft

- [ ] Read the “财务模型与下单边界” task as a read-only source.
- [ ] Reconcile the final 706 saleable units, including 40 shocks.
- [ ] Exclude non-saleable printer, scanner, label, ribbon and rack items.
- [ ] Preserve real carton numbers and line allocations exactly as sourced.
- [ ] Leave all unknown `sourcePalletNumber` values null and set `physicalPalletCount` to 4.
- [ ] Generate local JSON, CSV and reconciliation report under `docs/operations/inbound/`.
- [ ] Validate JSON schema, CSV totals, per-SKU totals and the exact 706-unit grand total.
- [ ] Report any source conflict or missing carton allocation instead of fabricating data.

## Task 8: Handoff gate

- [ ] Present local QA results and clickable artifact paths.
- [ ] Report exact branch, commits and untracked user-owned files.
- [ ] Request separate authorisation before any GitHub push, Production migration or Vercel deployment.

