# Label v4 System Integration Implementation Plan

> Status addendum (2026-09-07): The local implementation-phase restrictions and progress below are historical. The owner subsequently authorized v23 backup/migration and 119 label-profile backfill, now completed and verified in `docs/qa/2026-09-07-v23-production-execution.md`. Current task authorizes scoped local commit only. GitHub push and Vercel Production deployment remain separate pending approvals; neither deployment nor build may replay the database operations.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline for these sequential, shared-interface tasks. Preserve the existing linked worktree. TDD is mandatory. Do not dispatch parallel implementation writers.

**Goal:** Integrate approved v4 product labels with validated, persistent content; fix carton lookup feedback and moderately improve existing other-label surfaces.

**Architecture:** Add nullable controlled product label metadata; derive readiness without guessing; freeze versioned payloads at job creation and render preview/print through shared components. Legacy jobs preserve their previous rendering. Other labels keep their own identifiers and business state.

**Tech Stack:** Next.js 16.3.2, React 19.2.8, TypeScript, Zod 4, Supabase/Postgres, Vitest, Playwright, JsBarcode.

**Spec:** ../specs/2026-09-06-label-v4-system-scope.md

## Global Constraints
- Local implementation/QA only; no Production access or writes, push, deploy or real printing.
- Product 70x50mm; bin 100x50mm. Existing products.barcode and DMLOC identifiers are unchanged.
- No inferred Position or vehicle makes; incomplete metadata affects only selected products' new label readiness.
- Existing print results, receipt/putaway gates and role/MFA boundaries remain unchanged.
- Source worktree is linked and clean except generated AGENTS.md/CLAUDE.md; leave them untracked.
- Base c32567c; work on feature/label-v4-and-scope-feedback-20260906. Keep incremental scope records; commits only include deliberate task files.

## Task 1: Product label data contract and persistence

**Files:** Create lib/productLabelProfile.ts, tests/productLabelProfile.test.ts, tests/product-label-profile-api.test.ts, supabase/migrations/20260908_v23_product_label_profiles.sql. Modify lib/catalogue.ts, lib/validators.ts, lib/supabaseRepository.ts, components/AdminDashboard.tsx types where needed.

**Interfaces:** Product.labelProfile?: ProductLabelProfile | null; input create/update accepts the same. ProductLabelProfile {schemaVersion:1, displayName:string, vehicleMakes:string[], partReference:string, position:{status:'specified',value:string}|{status:'not_applicable'}|{status:'unknown'}}. Export productLabelProfileSchema and getProductLabelProfileIssues(profile:unknown): string[].

- [x] Add failing tests that parse real update/create input and demonstrate metadata is retained, unknown Position is not treated as not_applicable, and malformed fields fail.
```ts
expect(productMasterUpdateSchema.parse({labelProfile: profile}).labelProfile).toEqual(profile);
expect(getProductLabelProfileIssues({...profile, position:{status:'unknown'}})).toContain('position');
```
- [x] Run npm test -- tests/productLabelProfile.test.ts; confirm missing behavior before implementation.
- [x] Implement strict profile schema: schemaVersion 1, printable ASCII fields, field length limits, unique trimmed make values, discriminated Position. Validate before memory-repository mutation; deep-clone profile on read/write. Null explicitly clears; omitted profile preserves.
- [x] Wire existing create/update validators and product input/output types; persist label_profile in Supabase insert/update/catalogue mapping, preserving older null profiles. Prepare nullable JSONB column migration without backfill or new privileges.
- [x] Add local API tests for create/update/read roundtrip, clear vs omitted, malformed body and unauthorised warehouse writes. Exercise real memory repository; Supabase tests intercept only the transport if needed.
- [x] Run relevant tests, npm test, npm run typecheck; record what SQL has/has not been executed.

## Task 2: Shared v4 labels, maintenance and immutable print jobs

**Files:** Create components/ProductLabelProfileFields.tsx, components/WarehouseProductLabel.tsx, lib/warehouseLabelContent.ts, tests/warehouse-label-v4.test.ts and tests/warehouse-label-v4.spec.ts. Modify components/AdminDashboard.tsx, components/PartnerInboundWorkspace.tsx, components/ProductLabelPrintBatch.tsx, lib/productLabelBatch.ts, lib/repository.ts, lib/memoryRepository.ts, lib/supabaseRepository.ts, app/api/warehouse/labels/route.ts, app/globals.css. Update affected local test fixtures, not real data.

**Interfaces:** DrivemateRepository.getWarehouseLabelProducts(skus:string[]) returns products limited to sku/barcode/labelProfile. ProductLabelSnapshot {version:'unit-product-v4',sku,productBarcode,profile,companyName,website}; builders return per-SKU issues or a ready snapshot. ProductLabelPage supports explicit v4 snapshot or legacy sku/barcode. Absent version means legacy only; unknown version is rejected.

- [x] Write failing route tests: new jobs contain complete immutable snapshot; client-injected content ignored; incomplete selection returns affected SKUs without creating a job.
```ts
expect(created.items[0].payloadSnapshot.labelContent.version).toBe('unit-product-v4');
expect((await POST(requestWithMissingProfile)).status).toBe(422);
```
- [x] Add protected metadata controls to existing product editor (English name, makes, reference, Position status/value); do not create a new editor module. Drafts save, readiness is shown. No automatic 119-SKU writes.
- [x] Extend dedicated label reads and GET preview; POST rebuilds from server data and freezes full content plus version. Keep reprint snapshots unchanged.
- [x] Implement one shared v4 component for preview and batch; use layout effects for barcode before window.print. Preserve legacy output explicitly. Incomplete or too-long layout does not silently truncate or shrink text below readable limits.
- [x] Test variable/long names, arbitrary vehicle brands, Position absent/unknown, legacy/new jobs, stale/master changes and 706-page output with local fixtures. Retain count and audit protections.
- [x] Run unit, browser and production build locally; log any migration/data-population release prerequisites.

## Task 3: Carton lookup input guidance and feedback

**Files:** Create lib/warehouseScopeLookup.ts, tests/warehouseScopeLookup.test.ts. Modify components/PartnerInboundWorkspace.tsx, app/globals.css, tests/warehouse-inbound-workspace.spec.ts.

**Interfaces:** resolveWarehouseScopeLookup(input, cartons, knownProductIdentifiers) returns empty/not_found/wrong_kind/matched plus canonical scope. Known carton/member match wins; no broad SKU inference from arbitrary vendor carton formats.

- [x] Add failing tests for empty input, valid member, unknown carton and known SKU; unsuccessful lookup leaves existing selection unchanged.
```ts
expect(resolveWarehouseScopeLookup('DM-GWM-0106', cartons, ['DM-GWM-0106']).status).toBe('wrong_kind');
```
- [x] Explain carton examples in label/help, mark invalid input with aria-invalid and associated error, display success/loading/error conspicuously. Keep button and Enter behavior identical; do not add product search.
- [x] Browser test unknown input, valid carton/member, correct feedback and no selection change/no write on error.
- [x] Run targeted unit/browser tests and update old misleading message assertion.

## Task 4: Other label consistency within existing capabilities

**Files:** Create components/WarehouseLocationLabel.tsx and tests/warehouse-other-labels.test.ts. Modify components/InventoryLocationPanel.tsx, lib/warehouseLabels.ts, app/globals.css; document docs/operations/label-template-capabilities.md.

**Interfaces:** Shared location component consumes only immutable locationCode/barcode, retaining 100x50mm and DMLOC encoding. Template metadata exposes purpose/availability without suggesting non-product templates qualify for receipt print gates.

- [x] Add failing rendered-markup/behavior tests for full location identifier, barcode preservation, and no product status/quantity on shelf labels.
```ts
expect(markup).toContain('BNE-R01-L01-S01');
expect(markup).toContain('DMLOC:BNE-R01-L01-S01');
```
- [x] Improve location heading/hierarchy and barcode quiet zones through a shared preview/print component without changing location lifecycle or print audit.
- [x] Correct carton/dispatch field definitions: distinguish expected from received, source group from physical carton, and internal shipment from carrier tracking. Document that these two have no operational print route and require a later approved workflow, not fake availability or new placeholder pages.
- [x] Local layout checks verify long bin codes; existing location print, cancel/reprint and protected staging tests stay green.

## Task 5: Integrated QA and release handoff

**Files:** Update related test fixtures; write docs/qa/2026-09-06-label-v4-system-integration.md and task status in this plan.

- [x] Run npm test, npm run typecheck, npm run build.
- [x] Run local browser suite in explicit memory mode, including 375/701/768/880/1024/1440 widths and new label/source lookup cases. Never reuse an unidentified server or copy Production environment secrets.
- [x] Check 706 output count and SKU/barcode quantities; required business text, actual CSS page dimensions, legible black title, no overflow or extra pages.
- [x] Review full diff for unexpected role/MFA/gate/production changes, stale snapshot fallback and incorrect barcode usage.
- [x] Deliver local QA, pending migration/master-data review, and Australia physical print checklist; do not push/deploy.

## Progress
- Baseline: 62 files, 308 passed, 1 existing skipped; c32567c. Linked worktree reused, dedicated local branch created.
- Execution: sequential inline due to shared types, API payloads, editor state and shared styles. No parallel implementation writers.
- Tasks 1-5: local implementation and QA complete. 343 unit tests passed (1 existing skipped); 124 browser tests passed (11 existing conditional skips); TypeScript, production build and standard git diff --check passed.
- Independent read-only review found one mixed-version batch gap; reproduced with a failing test, then corrected with bidirectional job/item version validation.
- No migration execution, production reads/writes, push or deployment. SQL remains a reviewed local artifact; actual metadata population and physical printing remain release prerequisites.
- QA report: docs/qa/2026-09-06-label-v4-system-integration.md. Capability scope: docs/operations/label-template-capabilities.md.
