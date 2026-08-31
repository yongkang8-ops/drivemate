# Pre-arrival First Packing List P0 Hotfix Local QA

Date: 2026-08-31

Branch: `hotfix/prearrival-first-packing-list-20260831`

Baseline: `2caa931 feat: add staff lifecycle and warehouse permissions`

Environment: local Next.js development and Production build with `DRIVEMATE_REPOSITORY=memory`. All Shipment, Packing List, label, receipt and putaway records used by this QA were in-memory test data.

## Scope verified

- Existing Shipment remains visible when no Packing List revision exists.
- Packing List readiness is explicit: `not_started`, `draft`, `confirmed`.
- Pre-arrival shows a usable first-Packing-List state instead of a not-found error.
- The working copy supports multiple pallets, cartons and SKU lines.
- First confirmation creates immutable Packing List v1.
- Warehouse remains unavailable before confirmation and links to the selected Shipment in Pre-arrival.
- Warehouse label scope loads after confirmation.
- Existing print, receipt, history and putaway workflows remain available.
- No Production Supabase, Vercel Production, SMTP, DNS, GST, payment, order or customer data was changed.

## Automated verification

### Vitest

Command:

```powershell
npm test
```

Result:

```text
Test Files  50 passed (50)
Tests       208 passed | 1 skipped (209)
```

### TypeScript

Command:

```powershell
npm run typecheck
```

Result: exit code `0`.

### Next.js Production build

Command:

```powershell
npm run build
```

Result:

```text
Compiled successfully
Finished TypeScript
Generating static pages 60/60
```

The build includes `/prearrival`, `/warehouse`, `/api/prearrival/shipments`, revision creation and confirmation routes, and warehouse label, receipt and putaway routes.

### Focused Playwright regression

Command:

```powershell
npx playwright test tests/prearrival-shipments.spec.ts tests/warehouse-inbound-workspace.spec.ts tests/warehouse-label-print.spec.ts tests/warehouse-history.spec.ts tests/warehouse-smoke.spec.ts --project=edge
```

Result:

```text
12 passed
```

Covered behavior:

- empty Packing List fixture and readiness API;
- first Packing List with 2 pallets, 3 cartons and 4 SKU lines;
- Packing List v1 confirmation and Warehouse label-queue unlock;
- existing v2 revision flow;
- access control on Pre-arrival APIs;
- Warehouse locked state before confirmation;
- print confirmation gate;
- counted-quantity receipt into `BNE-RECEIVING-STAGING`;
- receipt history;
- putaway destination validation and confirmed putaway.

## Browser and visual acceptance

Evidence folder:

`docs/qa/evidence/2026-08-31-prearrival-first-packing-list-hotfix/`

| Evidence | Result | Observation |
| --- | --- | --- |
| `01-prearrival-empty-desktop.png` | Pass | Shipment reference, setup requirement and primary action are visible without a generic error. |
| `02-prearrival-editor-desktop.png` | Pass | Pallet/carton structure and labelled SKU/quantity fields are readable; add and remove controls are grouped by responsibility. |
| `03-warehouse-locked-desktop.png` | Pass | Warehouse explains the missing prerequisite and offers one direct action to Pre-arrival. No label or receipt controls are exposed. |
| `04-warehouse-locked-mobile.png` | Pass | Status title, explanation and primary action remain readable at 390 x 844. |
| `05-prearrival-empty-mobile.png` | Pass | Shipment state and setup action stack cleanly; the existing workspace navigation remains horizontally scrollable. |
| `06-prearrival-confirmed-desktop.png` | Pass | Confirmed v1 state exposes label preparation and the SKU table has `clientWidth=585`, `scrollWidth=585`, so no desktop horizontal overflow remains. |
| `07-warehouse-unlocked-desktop.png` | Pass | Confirmed source data loads the existing pallet selection, product label queue and physical-print gate. |

## Security and data-boundary checks

- The public and unauthorised Pre-arrival API request remains `403`.
- Test reset remains guarded by `isTestResetEnabled()` and is not available in hosted Production.
- `getWarehouseExpectedReceipt()` still requires a confirmed Packing List.
- Warehouse does not call the label scope route for an unconfirmed Shipment.
- No secret, cookie, MFA value or Production credential was read or logged.
- No schema migration is required for this Hotfix.

## Residual observations

1. Playwright prints a tooling warning because `NO_COLOR` and `FORCE_COLOR` are both present. This does not come from application behavior.
2. Next.js reports the existing `scroll-behavior: smooth` route-transition advisory. It predates this P0 and does not affect the tested workflow; it can be handled in a separate maintenance change.
3. The existing internal sidebars still display Phase 1/sample wording in some confirmed-state screens. This is outside the bounded P0 and should be reviewed separately because the project now intends to use real operational workflows.
4. Packing List Excel import and China-side source integration remain out of scope. The new first-Packing-List state is a complete manual fallback, not a replacement for a future import path.

## Local QA conclusion

The original production symptom is covered by failing-then-passing tests. The local implementation meets the bounded P0 acceptance criteria and is ready for a separately authorised GitHub push and Vercel Preview deployment. It has not been promoted to Production and has not written Production data.
