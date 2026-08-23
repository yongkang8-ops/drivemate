# Pre-trade Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Production operational for non-commercial workflows while GST and live trading remain disabled.

**Architecture:** A small `tradingGate` module owns the two-flag activation rule. Runtime readiness, release verification and commercial mutation routes consume that rule so UI readiness and server enforcement cannot drift.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Vercel environment variables.

---

### Task 1: Trading Gate

**Files:**
- Create: `lib/tradingGate.ts`
- Create: `tests/trading-gate.test.ts`

- [x] Write tests proving pre-trade is disabled, GST alone is insufficient, and both flags enable trading.
- [x] Run the focused test and confirm it fails because the module does not exist.
- [x] Implement the minimal two-flag gate and rerun the focused test.

### Task 2: Runtime and API Enforcement

**Files:**
- Modify: `lib/runtimeReadiness.ts`
- Modify: `tests/runtime-readiness.test.ts`
- Modify: `app/api/orders/route.ts`
- Modify: `app/api/orders/[orderId]/dispatch/route.ts`
- Create: `tests/pretrade-routes.test.ts`

- [x] Add failing tests for Production pre-trade readiness and commercial API blocking.
- [x] Add early `503` responses to order submission and dispatch.
- [x] Keep cancellation available and rerun focused tests.

### Task 3: Release Gate and Public Copy

**Files:**
- Modify: `scripts/verify-release-readiness.mjs`
- Modify: `app/page.tsx`
- Modify: `.env.example`
- Modify: `DEPLOYMENT.md`

- [x] Make smoke-token and write-smoke requirements conditional on trading mode.
- [x] Require GST only when trading is enabled.
- [x] Replace premature `Tax invoice` public wording with `invoice`.
- [x] Document the activation sequence and required variables.

### Task 4: Verification and Production Configuration

- [x] Run focused tests, full tests, typecheck and build.
- [x] Set `DRIVEMATE_BASE_URL=https://drivemateparts.com.au`.
- [x] Set `DRIVEMATE_ACCOUNTS_EMAIL=accounts@drivemateparts.com.au`.
- [x] Set `DRIVEMATE_TRADING_ENABLED=false`.
- [x] Audit Production variables without exposing secrets.
- [x] Do not deploy Production or change DNS in this task.
