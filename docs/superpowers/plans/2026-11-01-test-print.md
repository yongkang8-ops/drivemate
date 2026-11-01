# Isolated Test Print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task after design review. Preserve the current-session execution method.

**Goal:** Add audited small-batch test printing to the existing warehouse UI without changing formal receipt eligibility.

**Architecture:** A separate test-job persistence model and API consume server-resolved product label snapshots. The UI reuses WarehouseProductLabel with an explicit test presentation; formal job APIs and receipt gate queries remain unchanged.

**Tech Stack:** Existing Next.js 16 / React / TypeScript / Zod / Supabase Postgres / Vitest / Playwright; no new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-11-01-test-print-design.md`

**Execution status (2026-11-01):** Tasks 1–3 implemented and locally verified. See `docs/qa/2026-11-01-test-print-qa.md` for final evidence, reviewer fixes and explicit implementation rulings. Production migration/deployment remains unauthorised. Checklist below preserves the approved implementation steps.

## Global Constraints

- 70×50mm; visible TEST — NOT FOR STOCK; unchanged product barcode.
- Up to 10 unique SKUs; 1–5 copies each; total at most 20; default copies 2.
- Existing warehouse_label_print permission, existing CSRF controls; no browser table grants.
- No production mutation, remote push or deployment in implementation phase.
- Start a dedicated local branch from the verified published baseline; preserve untracked AGENTS.md and CLAUDE.md.
- Supabase CLI must be discovered with --help; use migration new warehouse_test_print_jobs to generate the actual migration filename, then edit that generated file. Do not infer a production migration version or apply remotely.

## Review Focus

1. Creation response lost after persistence: reconcile by requestId without duplicate task.
2. Outcome response lost: identical terminal outcome retry succeeds; conflicting terminal outcome returns 409.
3. Stale scope/product or forged snapshot: resolve on server; reject invalid SKU/barcode/label readiness, never trust submitted artwork.
4. Cross-mode ID misuse: test IDs do not exist in formal storage and vice versa; formal printGate remains locked after test success.
5. Pending formal print or scope navigation during test: keep visible task context; prevent mixed output and preserve outcome recovery.

## Task 1 — Test-job domain and persistence

**Files:** create `lib/warehouseTestPrint.ts`, `tests/warehouse-test-print.test.ts`, local generated migration; modify `lib/repository.ts`, `lib/memoryRepository.ts`, `lib/supabaseRepository.ts`.

**Interfaces:** define TestPrintSelection `{sku:string; copies:number}`; TestPrintOutcome `printed|failed|cancelled`; TestPrintJob containing id, requestId, shipmentId, immutable ProductLabelPage array, status, createdBy/createdAt, outcomeBy/outcomeAt, reason. Add repository createTestPrintJob(input, actor), getTestPrintJob(id), findTestPrintJobByRequest(requestId, actor), listTestPrintJobs(shipmentId, page), recordTestPrintOutcome(id, outcome, reason, actor). Return typed success/conflict/not-found results; same actor/requestId with different payload is conflict.

- [ ] Write failing domain/repository tests:
  ```ts
  expect(validateTestPrintSelection([{sku:'A',copies:2},{sku:'B',copies:2},{sku:'C',copies:2}]).total).toBe(6);
  expect(() => validateTestPrintSelection([{sku:'A',copies:0}])).toThrow();
  expect(() => validateTestPrintSelection([{sku:'A',copies:2},{sku:'A',copies:2}])).toThrow();
  ```
  Also exercise 11 SKUs, per-SKU 6, total 21, non-integers; immutable artwork; duplicate create with identical and different payload; same/conflicting result retries; public/authenticated direct table access denied.
- [ ] Run `npm test -- tests/warehouse-test-print.test.ts` and record the expected failing assertions before implementation.
- [ ] Implement separate storage with server-only access and atomic conditional outcome update. Make requestId uniqueness actor-scoped; terminal outcome cannot overwrite existing terminal state.
- [ ] Verify targeted tests and local Postgres migration/permission/transaction tests. Assert formal label jobs, receipt sessions and inventory balances unchanged before/after all three outcomes. Preserve test records on rollback; do not add destructive down migration.

## Task 2 — Authenticated API and printable output

**Files:** create `app/api/warehouse/test-labels/route.ts`, `app/api/warehouse/test-labels/[jobId]/route.ts`, `tests/warehouse-test-print-api.test.ts`; modify `components/WarehouseProductLabel.tsx` with optional `purpose: 'production'|'test'` defaulting to production. Add a separate `prepareTestPrintBatch(job: TestPrintJob): ProductLabelPage[]` in `lib/warehouseTestPrint.ts`.

**Interfaces:** POST collection accepts `{requestId, selection:{shipmentId,palletNumbers?,cartonNumbers?}, items:TestPrintSelection[]}` only; GET collection accepts shipmentId/page or own requestId for reconciliation; GET item returns saved test job; POST item accepts `{outcome,reason}` only. Return 400 invalid, 403 auth/CSRF, 404 not found, 409 conflict, 422 label not ready, and safe 5xx errors.

- [ ] Write failing API tests for permissions/CSRF/invalid JSON, scope membership, missing/ambiguous barcode, missing label metadata, forged artwork rejection, 6-page snapshot, idempotency and cross-mode IDs.
- [ ] Run `npm test -- tests/warehouse-test-print-api.test.ts`; verify failures.
- [ ] Implement using resolveWarehouseInboundScope and buildProductLabelContent. Test-job snapshots must not be cast into WarehouseLabelPrintJob to bypass formal validation. Do not edit formal outcome routes or printGate functions.
- [ ] Run domain/API tests plus `npm test`; report all failures and conditional skips.

## Task 3 — Panel, browser QA and release handoff

**Files:** create `components/WarehouseTestPrintPanel.tsx`, `tests/warehouse-test-print.spec.ts`; modify `components/PartnerInboundWorkspace.tsx` and screen/print rules in `app/globals.css` only where needed to isolate test output.

**Interfaces:** panel receives current immutable scope identity, available label-ready products and onClose; owns selections, pending task and result UI. Test print renders saved test snapshots in its dedicated print container, waits for barcode SVG rendering, then calls window.print(). The formal batch is absent while test output is mounted.

- [ ] Write failing browser tests: 3×2 outputs 6 labels, visible test marker outside barcode, 70×50mm, Copies=1 instructions, no automatic printed result on dialog close, failed/cancelled results, result-save retry, response-lost reconciliation, refresh recovery, stale selection protection, formal pending-job guard, keyboard focus and mobile containment.
  ```ts
  await expect(page.getByRole('button',{name:'Test print',exact:true})).toBeVisible();
  // After choosing 3 SKUs with 2 copies each and creating a test job:
  await expect(page.locator('.warehouse-test-print-batch article')).toHaveCount(6);
  await expect(page.locator('.warehouse-test-print-batch')).toContainText('TEST — NOT FOR STOCK');
  // A recorded test result must leave the existing formal gate locked.
  await expect(page.getByText('Receipt locked',{exact:true})).toBeVisible();
  ```
- [ ] Run `npx playwright test tests/warehouse-test-print.spec.ts`; confirm red, implement UI, rerun green. Use only local memory/Postgres data and mocked print dialog; never send to a physical printer automatically.
- [ ] Run `npm test`, `npm run typecheck`, complete default Playwright suite and relevant Chrome/WebKit tests, then production build. Verify formal 119 SKU/706-label regression remains unchanged.
- [ ] Deliver local screenshots, James's 6-label commissioning instructions, test report with exact data-impact assertions, and separately gated migration/deployment checklist. No automatic production release.

## Review checkpoint

Confirm the separate test-record table, quantity limits and result semantics before implementation. Recommended execution: inline in the current task, one task at a time; no parallel database modifications.
