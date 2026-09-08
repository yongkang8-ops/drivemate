# Admin initial load and action UI QA

Date: 2026-09-08

Scope: Task 3 local UI feedback and existing admin-button coverage only. No API, schema, permission, financial, or business-rule changes.

## Initial admin state recovery — TDD

RED was run by the root task with the focused Chrome command. The initial `/api/admin-state` network failure produced only the empty Next route announcer as an alert; no business error or Retry action was present, while default zero metrics and empty-row copy remained visible.

Minimal implementation in `AdminDashboard.tsx` adds loading, ready, and initial-error presentation states:

- initial failure shows a scoped alert and `Retry admin state`;
- zero metrics and empty tables are not rendered before a successful load;
- successful Retry reveals the real state;
- after any successful load, later refresh failure preserves the loaded data and its existing stale-data warning.

GREEN was run by the root task in Chrome together with two root-owned regression cases: 3/3 passed in 8.2 seconds. The focused initial-load case passed.

## Existing admin action UI coverage

`tests/experience-admin-actions.spec.ts` adds browser-level UI wiring coverage for:

- bulk SKU import and bulk fitment import, including parsed request rows;
- Pause and Reactivate trade-account actions, including PATCH paths and status payloads;
- admin order Cancel, including the existing POST cancel path;
- RMA inspection, including selected outcome, AUD-to-cents payload, and presence of an idempotency key.

The root task ran the three action tests in Chrome: 3/3 passed in 8.7 seconds. Combined result for this file: 4/4 passed.

These action tests interact with the real rendered UI and inspect requests at intercepted existing endpoints. Their responses are deliberately fulfilled in the browser test. They verify UI-to-endpoint wiring and payload construction; they do **not** claim real API persistence or replace the separate existing API-route tests.

## Non-browser verification

```text
npm run typecheck
PASS

npm test -- --run
76 test files passed
392 tests passed, 1 skipped
```

No test server or browser command was started by this subtask agent. No real admin record, account, order, RMA, email, commit, push, deployment, or Production state was created or changed.
