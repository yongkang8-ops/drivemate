# Warehouse Open Operations Empty States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Warehouse module accessible before Packing List confirmation while keeping all write operations protected by existing business prerequisites.

**Architecture:** Convert `LockedInboundWorkspace` into a navigable client-side shell that reuses the normal four-view model. Render explanatory empty states for Label print, Receive stock and Put away, and reuse `ReceiptHistoryPanel` for read-only audit history.

**Tech Stack:** Next.js 16 App Router, React 19 Client Components, TypeScript, Playwright, Vitest.

---

### Task 1: Add failing browser regression coverage

**Files:**
- Modify: `tests/warehouse-inbound-workspace.spec.ts`

- [ ] **Step 1: Add one regression test for open Warehouse module navigation**

Reset the memory repository with `packingList=empty`, open `/warehouse`, and assert that Label print, Receive stock, Put away and Receipt history do not carry `aria-disabled="true"`.

- [ ] **Step 2: Exercise each module**

Click each link and assert the matching heading and prerequisite guidance. Assert that `Print labels`, `Confirm receipt` and `Confirm put away` are absent. Assert that Receipt history renders `No audit events match this view`.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
npm exec playwright test tests/warehouse-inbound-workspace.spec.ts --project=edge --grep "keeps every Warehouse module accessible"
```

Expected: FAIL because the locked workspace currently marks all four links disabled and cannot render module views.

### Task 2: Implement open empty states

**Files:**
- Modify: `components/PartnerInboundWorkspace.tsx`

- [ ] **Step 1: Add local view state to `LockedInboundWorkspace`**

Use the existing `WorkspaceView` union and default to `label_print`.

- [ ] **Step 2: Keep all four navigation links active**

Use the same active-link treatment as the confirmed workspace. Do not set `aria-disabled` on the module links.

- [ ] **Step 3: Render module-specific empty states**

Keep the selected Shipment bar and render concise next-step guidance for Label print, Receive stock and Put away. Reuse the existing Pre-arrival link for source-data preparation.

- [ ] **Step 4: Render Receipt history without a carton pre-filter**

Pass `{ shipmentId, cartonNumbers: [] }` to `ReceiptHistoryPanel` so the existing read-only endpoint is used without any write side effect.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the Task 1 command again. Expected: PASS.

### Task 3: Run regression and rendered QA

**Files:**
- No production files beyond Task 2.

- [ ] **Step 1: Run relevant Warehouse browser suites**

```powershell
npm exec playwright test tests/warehouse-inbound-workspace.spec.ts tests/warehouse-history.spec.ts tests/warehouse-smoke.spec.ts --project=edge
```

- [ ] **Step 2: Run full unit and type validation**

```powershell
npm test
npm run typecheck
```

- [ ] **Step 3: Run the production build**

```powershell
npm run build
```

- [ ] **Step 4: Inspect rendered desktop and mobile states**

Verify page identity, meaningful DOM, no framework overlay, clean console, active module interactions, no clipping and no page-level horizontal overflow.

- [ ] **Step 5: Commit only the scoped files**

```powershell
git add docs/superpowers/specs/2026-09-01-warehouse-open-operations-empty-states-design.md docs/superpowers/plans/2026-09-01-warehouse-open-operations-empty-states.md tests/warehouse-inbound-workspace.spec.ts components/PartnerInboundWorkspace.tsx
git commit -m "fix: keep warehouse modules accessible"
```

Do not push or deploy without separate approval.
