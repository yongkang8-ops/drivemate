# Shared Auth Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current horizontal login toolbar with the approved Structured split pattern across every RoleGate-backed DriveMate workspace.

**Architecture:** Keep `AuthPanel` as the single authentication surface used by Staff, Partner, Admin, Warehouse and Trade workspaces. Restructure only its presentation layer and notice state while preserving the existing API calls, role inheritance, password-change redirect and MFA step-up provider. Global CSS provides one responsive form and notice system, with a compact authenticated-session variant retained for the Staff management route.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, native CSS, Phosphor icons, Vitest source contracts, Playwright Edge.

---

### Task 1: Lock the approved shared layout contract

**Files:**
- Create: `tests/auth-panel-design.test.ts`
- Modify: `components/AuthPanel.tsx`

- [ ] **Step 1: Write the failing layout contract test**

Assert that `AuthPanel.tsx` contains `auth-copy`, `auth-form`, `auth-field`, `auth-field-heading`, `auth-forgot-link`, `auth-submit`, visible `Email address` and `Password` labels, and a semantic `<form>` submission handler. Assert that the old secondary-button treatment is not used for password recovery.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- --run tests/auth-panel-design.test.ts`

Expected: FAIL because the approved classes and field labels do not yet exist.

- [ ] **Step 3: Implement the Structured split markup**

Keep the existing authentication methods intact. Replace the unauthenticated action grid with a vertical form containing two labelled fields, place `Forgot password?` beside the Password label, use a full-width submit button and preserve `autoComplete`, input types and accessible names.

- [ ] **Step 4: Run the contract test and verify GREEN**

Run: `npm test -- --run tests/auth-panel-design.test.ts`

Expected: PASS.

### Task 2: Add semantic authentication notices

**Files:**
- Modify: `components/AuthPanel.tsx`
- Test: `tests/auth-panel-design.test.ts`

- [ ] **Step 1: Extend the test with the four notice tones**

Assert that the component defines `info`, `success`, `warning` and `error`, renders `auth-notice--${notice.tone}`, uses `aria-live="polite"`, and includes one Phosphor icon for each tone.

- [ ] **Step 2: Run the test and verify RED**

Expected: FAIL because the component currently stores only a message string and renders a generic badge.

- [ ] **Step 3: Implement typed notice state**

Replace the message string with `{ tone, text }`. Map session checks and neutral guidance to `info`, completed login/reset/sign-out states to `success`, required email/password-setup actions to `warning`, and authentication/configuration failures to `error`. Render the matching Phosphor icon and keep responses free of secrets.

- [ ] **Step 4: Run the test and verify GREEN**

Expected: PASS.

### Task 3: Apply the global responsive visual system

**Files:**
- Modify: `app/globals.css`
- Test: `tests/auth-panel-design.test.ts`

- [ ] **Step 1: Add failing CSS contract assertions**

Require the desktop split grid, a form width cap, label-above-input fields, link-style password recovery, full-width submit button, four semantic notice colors and the existing mobile breakpoint collapsing `.auth-panel` to one column.

- [ ] **Step 2: Run the test and verify RED**

Expected: FAIL because the current CSS uses a three-column horizontal toolbar and generic pill status.

- [ ] **Step 3: Replace only the shared authentication CSS**

Use the existing DriveMate teal and neutral tokens, 6px control radius, 44px control height and WCAG-readable text. Keep motion to hover, focus and active feedback only. Preserve the compact `.staff-management-route > .auth-panel.is-authenticated` override, updating selectors only where the new structure requires it.

- [ ] **Step 4: Run the test and verify GREEN**

Expected: PASS.

### Task 4: Verify real interaction states in Edge

**Files:**
- Create: `tests/auth-panel-redesign.spec.ts`

- [ ] **Step 1: Add browser tests for shared layouts and notices**

Mock `/api/auth/session`, `/api/auth/login` and `/api/auth/password-reset`. Verify Staff and Trade headings, visible labels, password recovery link hierarchy, a full-width submit action, warning for missing email, success after recovery request and error after rejected login.

- [ ] **Step 2: Run the browser test and verify RED before implementation is complete**

Run: `npx playwright test tests/auth-panel-redesign.spec.ts --project=edge`

Expected: FAIL against the old structure or missing notice tones.

- [ ] **Step 3: Complete any minimal markup or CSS corrections**

Fix only issues demonstrated by the browser test. Do not change authentication endpoints, role logic or API payloads.

- [ ] **Step 4: Run browser verification and verify GREEN**

Expected: all new Edge cases pass with no Next.js error overlay or page runtime error.

### Task 5: Run full local QA

**Files:**
- Verify only.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- --run tests/auth-panel-design.test.ts tests/staff-management-page.test.ts tests/warehouse-staff-ui-access.test.ts`

- [ ] **Step 2: Run full validation**

Run: `npm test -- --run`

Run: `npm run typecheck`

Run: `npm run build`

Run: `git diff --check`

- [ ] **Step 3: Present the local browser acceptance URL**

Keep Production unchanged. Report the exact test results and provide the local Staff and Trade login routes for human acceptance.
