# DriveMate Staff and Warehouse Role Acceptance Matrix

**Date:** 2026-08-31
**Environment:** Local Next.js application, memory repository, Microsoft Edge automation
**Production writes:** None
**Production deployment:** None

## Acceptance result

The current Staff lifecycle, step-up MFA, role boundaries, warehouse permissions and Trade Portal compatibility meet the approved Task 6 acceptance rules in local QA.

One product defect was found and fixed during QA: disabled and reauthentication-required session messages were discarded by the shared login component. `AuthPanel` now shows fixed, safe messages for both server codes without exposing provider errors.

## Role matrix

| Area | Admin | Partner | Warehouse staff | Trade | Evidence | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Ordinary AAL1 login | Allowed | Allowed | Allowed | Allowed | `auth-session-step-up.test.ts` | Pass |
| System administration `/admin` | Allowed | Denied | Denied | Denied | `staff-role-acceptance.spec.ts` | Pass |
| Operations dashboard `/partner` | Allowed | Allowed | Denied | Denied | `staff-role-acceptance.spec.ts` | Pass |
| Staff module `/admin/staff` | Manage | Read only | Denied | Denied | `staff-role-acceptance.spec.ts`, `staff-management-ui.spec.ts`, `staff-admin-api.test.ts` | Pass |
| Warehouse operations `/warehouse` | Allowed | Allowed | Allowed | Denied | `staff-role-acceptance.spec.ts`, `warehouse-staff-access.spec.ts` | Pass |
| Location and pre-arrival management | Allowed | Allowed | Denied | Denied | `staff-role-acceptance.spec.ts`, `warehouse-permission-boundaries.test.ts` | Pass |
| Routine label, receipt, staging, putaway and history | Allowed | Allowed | Allowed | Denied | `warehouse-routine-aal1.test.ts`, warehouse Edge flows | Pass |
| Inventory adjustment, location lifecycle, dispatch and RMA receipt | Allowed | Allowed where assigned | Denied | Denied | `warehouse-permission-boundaries.test.ts`, `capability-route-coverage.test.ts` | Pass |
| Staff create, disable, role, password and MFA actions | Allowed after AAL2 | Denied | Denied | Denied | `staff-admin-api.test.ts`, `staff-management-ui.spec.ts` | Pass |

## Authentication and account lifecycle

| Scenario | Evidence | Result |
| --- | --- | --- |
| Admin and Partner can view daily pages at AAL1 without a global MFA wall | `auth-session-step-up.test.ts`, `staff-role-acceptance.spec.ts` | Pass |
| Sensitive mutation returns `mfa_required` before writing | `mfa-step-up-route.test.ts`, `staff-admin-api.test.ts` | Pass |
| Existing factor challenge resumes the pending action once | `mfa-step-up-dialog.spec.ts` | Pass |
| First sensitive action can enroll an authenticator | `mfa-step-up-dialog.spec.ts` | Pass |
| Invalid authenticator code leaves the action paused | `mfa-step-up-dialog.spec.ts` | Pass |
| Expired session states that the pending action was not submitted | `mfa-step-up-dialog.spec.ts` | Pass |
| Temporary password is generated strongly and expires after exactly seven days | `staff-admin-service.test.ts` | Pass |
| Temporary password is returned only after create/reset and is cleared after secure handoff | `staff-admin-api.test.ts`, `staff-management-ui.spec.ts` | Pass |
| No plaintext password or MFA secret column exists | `staff-account-migration.test.ts` | Pass |
| Expired initial password is rejected before DriveMate cookies are issued | `staff-lifecycle-auth.test.ts` | Pass |
| Pending first login redirects to `/password-setup` before workspace content | `staff-first-login-ui.test.ts`, `staff-role-acceptance.spec.ts` | Pass |
| First password change activates the pending Staff profile | `staff-lifecycle-auth.test.ts`, `account-access-polish.spec.ts` | Pass |
| Self-service recovery uses the DriveMate confirmation and password setup callback | `password-reset-route.test.ts`, `auth-recovery.test.ts` | Pass |
| Administrator password reset uses MFA and a locked one-time handoff | `staff-management-ui.spec.ts` | Pass |
| Disabled and reauthentication-required sessions are rejected and DriveMate cookies are cleared | `auth-session-step-up.test.ts`, `staff-role-acceptance.spec.ts` | Pass |
| Trade customer session remains outside Staff MFA policy | `auth-session-step-up.test.ts`, `portal-admin-flow.spec.ts` | Pass |

## Warehouse workflow

| Scenario | Evidence | Result |
| --- | --- | --- |
| Unit Product print confirmation is required before receipt | `warehouse-label-print.spec.ts`, `warehouse-receipt-api.test.ts` | Pass |
| Cancelled printing does not unlock receipt | `warehouse-label-print.spec.ts` | Pass |
| Counted quantity receipt writes to `BNE-RECEIVING-STAGING` | `warehouse-label-print.spec.ts`, `warehouse-receiving.test.ts` | Pass |
| Scan-led putaway uses the system staging source | `warehouse-inbound-workspace.spec.ts` | Pass |
| Only saved active `DMLOC` destinations can receive putaway | `warehouse-inbound-workspace.spec.ts`, `warehouse-putaway-api.test.ts` | Pass |
| Receipt and putaway history remains read only and timezone aware | `warehouse-history.spec.ts` | Pass |
| Direct calls to restricted warehouse APIs are denied for `warehouse_staff` | `warehouse-permission-boundaries.test.ts` | Pass |

## Browser execution profiles

Authentication screens and role rejection states must run without automatic local access:

```powershell
npx playwright test --config=playwright.auth.config.ts
```

Result: `15 passed`.

The Auth profile also asserts that the redesigned login surface emits no React hydration mismatch warning in Edge.

Operations and warehouse flows run with the local memory workspace:

```powershell
npx playwright test tests/mfa-step-up-dialog.spec.ts tests/staff-management-ui.spec.ts tests/warehouse-staff-access.spec.ts tests/warehouse-label-print.spec.ts tests/warehouse-inbound-workspace.spec.ts tests/warehouse-history.spec.ts tests/portal-admin-flow.spec.ts --project=edge
```

Result: `19 passed`.

## Final local verification

```powershell
npm test -- --run
npm run typecheck
npm run build
git diff --check
```

Results:

- Vitest: `50` files passed, `207` tests passed, `1` intentional skip.
- TypeScript: passed.
- Next.js Production build: passed and includes `/admin/staff`, all Staff APIs and all warehouse routes.
- Diff whitespace check: passed.
- Client-sensitive pattern scan: no `localStorage`, `sessionStorage`, debug `console.log`, `mfa_secret`, `password_secret` or `service_role` use in the Staff/Auth client scope.

## Historical browser-suite exclusions

The unfiltered historical Edge suite produced `48 passed` and `13 failed`. The failures are retained as future trading-enabled coverage and are not current-phase acceptance failures:

1. Nine order, dispatch, cancellation and trade-state cases assume live trading.
2. One generic inventory Putaway case uses the retired non-receipt-scoped route.
3. Warehouse-state and CSV-export assertions depend on an order that current Pre-trade rules intentionally reject.
4. One public order request expects an authorization response before the current trading-disabled response.

These tests must not be made to pass by enabling GST, online trading, payment, real dispatch, or the retired generic Putaway path. They should be reactivated under a separately approved trading-enabled test profile when commercial launch is authorized.

## Remaining production gates

Local QA does not prove Production readiness. Before Production activation:

1. Review and explicitly stage the accumulated Task 1-6 change set.
2. Create a Production logical backup.
3. Execute the approved v19 migration only after separate authorization.
4. Push the release branch and deploy Vercel Production only after separate authorization.
5. Complete formal Production login, MFA and Staff module acceptance with the existing administrator.
6. Create the first real warehouse employee only as an independent authorized Production data write.
