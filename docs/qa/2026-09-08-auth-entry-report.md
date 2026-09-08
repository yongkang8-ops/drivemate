# Auth entry implementation report

Date: 2026-09-08  
Branch/baseline: `feature/experience-stability-20260908` / `eb8df7c2b2b1c0fa5ed9b69722c61e6e46e7b14a`  
Scope: local-only authentication entry stabilization; no commit, push, deploy, migration, real account creation, or real authentication write.

## Outcome

- Added generic `/staff/login` using the existing `AuthPanel` UI and existing `/api/auth/*` contracts.
- Generic entry uses the refreshed, server-verified session role for destinations: admin/partner -> `/partner`, warehouse_staff -> `/warehouse`, trade -> `/portal`. Unknown/disabled roles receive no destination.
- Protected-route `AuthPanel` behavior remains in place: a successful authorized login stays on the deliberately opened route.
- `next` accepts only the seven approved exact routes, role-authorized destinations, an explicit reviewed query-key allowlist, bounded plain context values, and one harmless anchor. External/protocol-relative URLs, encoded traversal, unsupported/login/password paths, arbitrary parameters, token/credential fields (including camelCase), and compound/hash token payloads are rejected.
- First-password priority remains. Both generic entry and protected direct routes carry a safe intended business route through `/password-setup`; password completion hands off to `/staff/login` with that safe route.
- Sign-in and password setup guard repeated submission, catch network/non-JSON failures, preserve fields on recoverable failure, and clear password state on success. No write is automatically replayed.

## Files owned and changed

- `app/staff/login/page.tsx` (new)
- `components/StaffLoginPanel.tsx` (new)
- `components/AuthPanel.tsx`
- `components/PasswordSetupForm.tsx`
- `lib/workspaceRouting.ts` (new)
- `playwright.auth.config.ts` (reused; dedicated port changed to `3242`, new suite included)
- `tests/auth-entry.spec.ts` (new)
- `tests/workspace-routing.test.ts` (new)
- `tests/account-access-polish.spec.ts`
- `tests/staff-first-login-ui.test.ts`
- `tests/staff-role-acceptance.spec.ts`
- this report

Other modified/untracked files in the shared worktree belong to the root task or other scoped work and were not reverted or claimed here.

## TDD evidence

### RED

1. `npm test -- --run tests/workspace-routing.test.ts`
   - Failed suite because `../lib/workspaceRouting` did not exist. This was the expected initial missing-feature failure.
2. `npx playwright test tests/auth-entry.spec.ts --config=playwright.auth.config.ts`
   - `9 failed, 1 passed`.
   - Failures showed missing `/staff/login`, missing role/deep-link redirects, missing recoverable non-JSON handling, missing duplicate guards, and missing safe password-first handoff.
   - The one pass confirmed the existing protected-route behavior already stayed on `/prearrival` after authorized sign-in.
3. Added allowlist adversarial cases, then ran `npm test -- --run tests/workspace-routing.test.ts`.
   - `3 failed, 22 passed`: camelCase `accessToken`, camelCase `refreshToken`, and an unreviewed context key were incorrectly accepted by the earlier blocklist implementation.
4. Protected first-password deep-link regression proof:
   - A first attempt could not start because root's `3100` server held the shared `.next/dev` lock; no process was killed.
   - After serialization, temporarily restoring the old explicit-`entryNext` behavior and running the single browser case produced the intended failure: expected encoded `/prearrival?shipment=DM-9&view=receiving#carton-2`, received `/password-setup`.

### GREEN

1. `npm test -- --run tests/workspace-routing.test.ts tests/staff-first-login-ui.test.ts tests/auth-panel-design.test.ts tests/warehouse-staff-ui-access.test.ts tests/auth-recovery.test.ts tests/password-setup-security.test.ts`
   - `6 passed` files, `39 passed` tests, `0 failed`, `0 skipped`.
2. `npm run typecheck`
   - Passed with no TypeScript errors.
3. `npx playwright test --config=playwright.auth.config.ts`
   - Final stable run: `26 passed`, `0 failed`, `0 skipped` in 24.8s on the `auth-edge` project, local port `3242`.
   - Includes the three legacy auth suites plus the new auth-entry suite.
4. `git diff --check`
   - Passed; PowerShell/Git printed only existing Windows LF-to-CRLF conversion warnings, not whitespace errors.

An earlier all-auth run also passed 25/25 but logged a transient React hydration warning while `app/layout.tsx` was being edited concurrently by the root task. A stable serialized rerun did not reproduce it. The final 26-test run was clean apart from Node's environment warning: `The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.`

## How to run

From the worktree root, with no other Next dev server using this worktree:

```powershell
npm test -- --run tests/workspace-routing.test.ts tests/staff-first-login-ui.test.ts tests/auth-panel-design.test.ts tests/warehouse-staff-ui-access.test.ts tests/auth-recovery.test.ts tests/password-setup-security.test.ts
npm run typecheck
npx playwright test --config=playwright.auth.config.ts
```

The Playwright config starts and stops a local intercepted-auth server at `http://127.0.0.1:3242`. It contains no real environment credentials and the tests intercept external auth responses; no real users are created.

## Limits and remaining gates

- Existing `/api/auth/*` contracts, Supabase settings, MFA policy, and role authority were unchanged.
- No real Supabase session/account was used. Production cookie behavior and production redirects remain unverified until a separately authorized staging/Production gate.
- No full repository unit suite or production build is claimed by this subtask; root is integrating concurrent admin/shared-shell changes and owns final integrated regression/build evidence.
- Browser coverage here used the configured Desktop Edge project. Cross-browser/device/zoom acceptance remains part of root Task 5.
- No commit was created. Root review and integrated QA are the next required task before any commit or release decision.

## Independent review follow-up

Completed after root review on 2026-09-08:

- Password setup success now removes the complete raw query string and recovery hash from browser history. The already-sanitized `continueHref` remains the only carried destination; a rejected `next` produces plain `/staff/login`.
- A failed `/api/auth/session` request no longer removes the production sign-in form. The user sees a recoverable error and can deliberately sign in; demo access is enabled only by the existing explicit local demo flag, not by `NODE_ENV` alone.
- The `next` allowlist now supports PaginatedTable keys for `reorder`, `products`, `fitment`, `batches`, `pricing`, `rfq`, `lookups`, `accounts`, `roles`, `applications`, `orders`, `movements`, `documents`, `purchasePreview`, `staff`, and reserved `locations` integration. `Page` must be a positive safe integer; `Size` must be `25`, `50`, or `100`. Unknown IDs, invalid numbers/sizes, and secret-like arbitrary fields remain rejected; harmless section anchors remain supported.

Follow-up RED evidence:

- Routing unit run: `4 failed, 32 passed`; the four reviewed pagination links were rejected before implementation.
- Focused browser run: `2 failed`; session network failure removed the form, and password success retained the rejected raw query. Both failures matched the review findings.

Follow-up final GREEN evidence:

- `npx playwright test --config=playwright.auth.config.ts`: `28 passed`, `0 failed`, `0 skipped` in 24.9s.
- Focused authentication unit run: `6 passed` files, `50 passed` tests, `0 failed`, `0 skipped`.
- `npm run typecheck`: passed.
- `git diff --check`: passed with only LF-to-CRLF informational warnings.
- The Playwright-managed `3242` server exited normally after the run.
