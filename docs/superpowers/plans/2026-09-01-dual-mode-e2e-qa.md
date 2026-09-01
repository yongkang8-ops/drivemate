# Dual-mode End-to-end QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce truthful, repeatable pretrade and local-trading browser QA with no Production configuration changes.

**Architecture:** Mark order-dependent Playwright cases as trading-only, keep all independent API checks in the default run, correct the obsolete generic putaway expectation, and verify the pretrade short-circuit separately from trading-mode request security.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Playwright, Vitest.

---

### Task 1: Correct the API browser test matrix

**Files:**
- Modify: `tests/api-routes.spec.ts`

- [ ] Define a `tradingTest` alias controlled by both trading and GST environment flags.
- [ ] Apply it only to the 11 scenarios that create or depend on a submitted order.
- [ ] Change the legacy generic putaway scenario to expect `422` and the dedicated-workflow message.
- [ ] Keep the public-protection test active in both modes.

### Task 2: Verify the commercial and security boundaries by mode

**Files:**
- Modify: `tests/api-routes.spec.ts`

- [ ] Keep the existing route-level pretrade short-circuit tests unchanged.
- [ ] Expect `503 TRADING_DISABLED` from the order mutation in pretrade mode.
- [ ] Expect `403` from an unauthorised order mutation in local trading mode.
- [ ] Continue requiring `403` from protected non-commercial inventory APIs in both modes.

### Task 3: Verify the two-mode matrix

**Files:**
- No additional production files.

- [ ] Run default `npm exec -- playwright test --project=edge` and require zero failures.
- [ ] Run `api-routes.spec.ts` with local trading and GST flags and require zero failures.
- [ ] Run full Vitest, typecheck and build.
- [ ] Commit only scoped files and documentation. Do not push or deploy.
