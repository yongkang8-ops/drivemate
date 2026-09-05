# DriveMate Production full-chain machine QA

Date: 2026-09-04

Production deployment: `dpl_CbrVnXitXAmkSzHzfmsV5rsCHG7M`

Git commit: `64e1c6f962edc2add2d32780392a837471c8fd90`

Target shipment: `c49dad78-2ffc-406a-ac50-3c1e4ffec434` / `AJG-YJ-GWM-202608-01-PACKING`

## Authorised write scope

- Create and confirm the authoritative schema-v3 Packing List v1.
- 119 SKUs, 706 units, 35 source scopes, 38 physical cartons, two carton groups.
- Four physical pallets, with pallet-to-carton mapping not recorded and available for later revision.
- Do not confirm physical label printing.
- Do not create receipts, putaway movements, inventory movements, or Staff accounts.

## Pre-write verification

- `tests/inbound-master-data-draft.test.ts`: 10 passed.
- TypeScript: passed.
- Production shipment state: `not_started` with no confirmed revision.
- Browser working-copy reconstruction: 35 source scopes.
- Reverse comparison before confirmation: zero field mismatches.
- Reconstructed totals: 119 lines and 706 units.
- Screen summary: 35 source scopes, 38 physical cartons, two carton groups, four unmapped physical pallets.

## Production write result

- Packing List v1 confirmed once at 2026-09-04 21:30 China Standard Time.
- The confirmed revision is shown as immutable in Pre-arrival.
- Post-write screen readback matched all 119 SKU lines and all 706 units.
- 119 non-empty product barcodes were resolved, with 119 unique barcode values.
- Warehouse projected 35 canonical receipt scopes and 38 physical cartons.
- Member cartons `7#`, `8#`, `9#` resolve under group `7#8#9#`.
- Member cartons `10#`, `11#` resolve under group `10#11#`.
- Full-shipment label quantity is 706.
- Receipt remains locked because physical label printing has not been confirmed.
- Staging, putaway and physical-location inventory remain zero.

## Dashboard projection

- Active inbound shipments: 1.
- Print confirmation required: 1.
- Units in `BNE-RECEIVING-STAGING`: 0.
- Open receipt exceptions: 0.
- Shipment card shows Packing List v1, four physical pallets, 35 source scopes, 38 physical cartons, two groups and 706 expected units.

## Label read-only verification

- Full-shipment preview reports 706 fixed-size Unit Product labels.
- Member carton lookup `8#` resolves to canonical source group `7#8#9#` with 10 labels.
- Returning to Full shipment restores all 35 canonical scopes and 706 labels.
- No print job was created and no physical print outcome was recorded.

## Authorised cancelled-print verification

- Selected canonical source scope `34#` only.
- The selected scope resolved to SKU `DM-GWM-0100`, barcode `DMPGWM0100`, quantity two and two requested labels.
- Created print job `8fc64fac-76a1-44af-9d09-19600fcf2bcb`.
- The application invoked the Windows/browser print flow and entered `Awaiting physical confirmation`.
- No label output was confirmed as physically printed.
- Recorded the job outcome as `Cancelled`.
- Receipt history shows `Label print cancelled` for the same job and source scope.
- `Receive stock` remains disabled and no receipt-confirmation control is available.
- Dashboard remains at one print confirmation required, zero staging units and zero receipt exceptions.

## UI and workflow observations

1. The Pre-arrival editor correctly validates missing source-scope and SKU fields and focuses the first invalid field.
2. The manual editor can represent schema-v3 carton groups, but entering 35 scopes and 119 lines manually is operationally expensive. A controlled CSV/XLSX import or paste workflow remains a justified P1 improvement.
3. Long Packing Lists produce a tall source-scope rail while the detail panel is above the current scroll position, leaving a large blank content area during lower-scope navigation. Sticky or independently scrollable scope navigation should be considered.
4. `/inventory` and `/admin/staff` still include the public header, account card and public footer around the internal application shell; `/partner`, `/prearrival` and `/warehouse` use a dedicated internal shell.
5. On narrow mobile widths, internal navigation is horizontally scrollable and the final destinations are partially clipped.
6. The session check briefly renders the Staff login shell before the authenticated workspace appears.
7. The print-job status card gives too little width to its UUID and long status. `Awaiting physical confirmation` wraps into an unusually tall narrow column and needs a more stable responsive layout.
8. The optional pallet-filter summary still says `Full shipment selected` when source scope `34#` is selected. Although it refers to the absent pallet filter, the wording is misleading in the active scoped workflow.

## Staff and location read-only verification

- Staff register loads the existing system administrator and opens the right-side account drawer.
- Administrator detail correctly prevents disable, role reassignment and reset actions from the Staff module.
- The create-account drawer exposes full name, personal work email and `warehouse_staff` / `partner` roles without creating an account.
- The current system administrator is reported as `MFA: Not Enrolled`; a real sensitive Staff write will therefore need to prove the MFA enrolment and step-up path.
- Inventory location search filters the 10-location register correctly.
- The notes-only location editor loads the immutable location code and barcode with editable description and notes. It was closed without saving.
- A single selected location produces the expected 100 × 50 mm `DMLOC` label preview without creating a location-label print job.

## Remaining full-chain gates

- The authorised cancelled-print path above is complete; a positive physical-print outcome is still pending.
- `Printed` must not be recorded until a physical label output has actually been checked.
- Receipt and putaway must not be recorded against this real shipment before physical arrival and handling.
- Staff account creation requires a separate Production write authorisation and, where enforced, administrator step-up MFA.

## P1F local hotfix verification

Verification date: 2026-09-05.

Branch: `hotfix/operations-ux-p1f-20260904`.

Code under test: `ed51387c0bf6f65c0c59e9359cbc82103c460a87` (base `64e1c6f`). Subsequent documentation-only commits do not change this tested code.

Result: PASS for the approved four-item local P1F scope, with the non-blocking observations below. This is not Production acceptance or unrestricted whole-site certification.

### Verification evidence

| Check | Result |
| --- | --- |
| Scope formatter focused Vitest (prior completed QA run on the same code) | 3/3 passed |
| Full Vitest, rerun 2026-09-05 | 59 files passed; 289 tests passed, 1 skipped |
| Five focused Playwright specs, rerun 2026-09-05 | 55/55 passed in Edge; 55.8 seconds |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run build` | Passed; Next.js 16.3.2, 60/60 static pages generated |
| `git diff --check` | Passed |
| Task-by-task specification and quality review | All four tasks approved after correction of review findings |
| Independent final cumulative code review, `64e1c6f..ed51387` | Approved; no blocking issue |

The five browser specs were `warehouse-label-print`, `partner-dashboard`, `prearrival-shipments`, `inventory-locations`, and `staff-management-ui`. They use local in-memory fixtures and mocked Staff responses. Receipt and print-confirmation actions inside those tests affect local fixtures only.

### Scope and responsive results

- Full shipment / single source scope / multiple source scopes / return to full shipment: correct copy and quantities; pallet-mapped behavior unchanged.
- Printing card: reference, status and actions contained at 390, 701, 768, 880, 1040, 1440 and 1600px. 1440/1600px show three columns; 390px outcome buttons have equal widths.
- Dashboard, Pre-arrival, Inventory and Staff navigation: all links visible and horizontally contained at 390, 701, 768, 880, 1040 and 1440px. Mobile layout has two columns; 701px and above retain sidebars.
- Warehouse mobile navigation was independently checked as the unchanged two-column reference.
- Authenticated Inventory and Staff: public header/footer/account panel hidden; private application fills the viewport. Staff drawer geometry and focus-return tests pass.
- Unauthenticated Inventory and Staff: public login shell remains visible. Because the default local development configuration enables demo access, these two structural tests disable JavaScript to test the SSR/CSS boundary. They do not prove a new live Production authentication session. No authentication implementation changed.
- Staff unauthenticated spacing: desktop 24px/48px covered by regression tests; mobile bottom padding independently measured as 32px.
- Existing empty-state, validation-error recovery, stale-response, cancelled-print, Staff read-only and MFA-resume fixture tests passed in the focused suite.

### Visual inspection and retained evidence

Local screenshots were captured for all five pages at 390/1440px, plus label previews at 1440/1600px and signed-out Staff at 390px. Screenshots are retained locally under `test-results/p1f-visual/` (ignored by Git and not included in deployment).

Visual inspection covered the desktop Inventory shell, mobile Staff/Dashboard/Pre-arrival/Warehouse pages and desktop label preview. All ten authenticated page/viewport measurements had document scroll width equal to viewport width, and public header/footer display was `none`.

### Non-blocking observations and remaining work

1. At 1440/1600px, the summary panel is 260px wide and the fixed 70mm label preview is 264.5625px wide, extending 2.28125px beyond each panel edge. Summary client/scroll widths are 258/261px. Label content remains readable; no page-level overflow occurs. Physical print size has not been changed. A future screen-only preview containment refinement can address this.
2. Four mobile CSS groups and viewport test probes repeat similar declarations. Consolidation is a later maintainability improvement, not part of this narrow hotfix.
3. The Inventory content-height assertion could be strengthened with a taller viewport or computed min-height assertion. Current CSS is correct.
4. Historical Production observations above remain baseline findings. P1F resolves items 4, 5, 7 and 8 locally. Import/paste efficiency, long source-scope navigation and session-loading presentation remain separate future work.

### Release and data boundary

- No GitHub push, Vercel deployment, Production login or Supabase write occurred during P1F implementation and local QA.
- The last verified Production baseline in this report remains `64e1c6f` / `dpl_CbrVnXitXAmkSzHzfmsV5rsCHG7M`; Production was not re-queried or updated in this local closeout.
- No physical label was marked Printed, no receipt or putaway was created for the real shipment, and no real Staff account was created.
- Next step: separately authorised release of this reviewed local branch, followed by Production read-only acceptance. Real receiving/putaway remains dependent on actual labels and goods handling.
