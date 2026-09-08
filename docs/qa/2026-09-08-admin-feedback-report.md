# Admin form recovery report

Date: 2026-09-08

Scope: local-only changes to `PurchaseImportPanel`, `AdminOperationsPanel`, `AdminDashboard`, and focused browser coverage. Existing section and pagination work was retained. No real business write, external authentication, commit, push, or Production action was performed.

## RED

Initial command:

```text
npx playwright test tests/admin-form-recovery.spec.ts --project=edge
```

Observed three expected behavior failures:

- Purchase validation: a delayed response for `old.xlsx` rendered `Preview passed` after `new.xlsx` had replaced it, proving the stale preview/token was not tied to current inputs.
- Account adjustment: an empty Trade account ID neither focused the field nor produced an associated validation alert.
- Dashboard refresh: an aborted `/api/admin-state` request raised an unhandled `TypeError: Failed to fetch`, so the UI did not provide a controlled read-failure state.

The focused tests also cover overlapping repeated clicks with explicit unresolved-request gates and exact request counts. These gates keep the first request pending, verify the affected button is disabled, attempt a second action, assert the request count remains exactly one, and only then release the response.

## GREEN

- Purchase uploads now invalidate both the visible preview and preview token immediately. A monotonically increasing file version prevents an old validation response from restoring them. Commit is enabled only for the current validated files. A synchronous ref lock prevents overlapping submissions, the intended commit retains one idempotency key, final commit locks both file controls, malformed/network outcomes restore controls, and success text uses response/preview quantities rather than fixed `706` or `119` values.
- Landed cost, account adjustment, and RMA inspection now have independent section-local messages, required-ID focus and associated errors, synchronous action locks, affected-button pending state, preserved input values, safe JSON handling, and uncertain-outcome guidance for network failures.
- Dashboard refresh now distinguishes a failed read while preserving already loaded records. Existing writes and exports are protected at their UI action boundaries with synchronous keyed locks, disabled affected controls, exception handling, and retained editable state on failure. Login provisioning text now reflects `setupEmailSent` accurately.

Verification:

```text
npm run typecheck
PASS

npm test -- --run
74 test files passed
376 tests passed, 1 skipped
```

Focused browser final result:

```text
npx playwright test tests/admin-form-recovery.spec.ts --project=edge
3 passed (7.9s)
```

## Gaps / boundaries

- Fault injection used intercepted local browser requests only; it created no real users, emails, landed costs, account entries, RMAs, imports, or product records.
- No API contract, permission rule, financial calculation, endpoint, CSS, or data model was changed.
- The focused browser coverage proves the representative Purchase commit, account adjustment, Dashboard product-create, stale upload, and read-refresh paths. The shared keyed boundary is applied to the other existing Dashboard action buttons, while their individual server business outcomes remain covered by the existing suite rather than new fault cases for every endpoint.

## Independent review follow-up

Four additional review cases were added test-first. The RED run reproduced each gap:

- a `200` landed-cost response with malformed JSON reported a definitive failure instead of an unknown outcome;
- `{ catalogue: [] }` was accepted as admin state and crashed at `state.tradeAccounts.filter`;
- a successful product mutation followed by an aborted refresh overwrote the stale-list warning with plain success;
- blank fitment Make dispatched instead of focusing the API-required field.

The follow-up implementation now:

- treats a successful HTTP response with malformed JSON or missing required success identifiers/totals as an unconfirmed write, while retaining explicit server-denial messages;
- accepts refreshed admin state only when metrics and every required top-level collection are present;
- returns refresh success/failure to mutation handlers and reports `saved/created, but the list could not be refreshed` when appropriate;
- validates and associates errors for Fitment SKU, Make, Model, and Year from, focusing the first missing API-required field without dispatch.

Final verification after review fixes:

```text
npx playwright test tests/admin-form-recovery.spec.ts --project=edge
7 passed (15.2s)

npm run typecheck
PASS

npm test -- --run
75 test files passed
388 tests passed, 1 skipped
```
