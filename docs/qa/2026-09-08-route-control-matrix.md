# DriveMate route and control inventory — 2026-09-08

## Scope and evidence boundary

This is the Task 1 inventory and Task 5 evidence ledger for the 15 original App Router page routes in this checkout. It covers the original route surfaces observed at inventory time, including controls rendered by nested operational components; implementation work may subsequently change those files and must be reconciled against this ledger in Task 5. It is a source audit only: **no route below is claimed as live-browser validated by this document**. Existing automated tests are pointers, not fresh pass evidence. Physical print, scan, receipt and device acceptance remain pending.

Source cross-check: `deliverables/2026-09-07-human-acceptance-v2/04_全部用例文字版.md` (manual cases F01–F11, S01–S15, D01–D15, Q01–Q08). The manual correctly distinguishes read-only, real-data writes, conditional writes and capability gaps; those gates remain in force.

Legend: **R** read/navigation only; **L** local UI state only; **W** creates or mutates persisted business/auth data; **P** physical or external side effect; **C** capability/condition dependent. “Recovery” means the operator-safe next action after error/unknown outcome, not an automatic retry contract.

## Route summary (all 15 original page routes)

| Route | Mounted control surface | Purpose and access precondition | Data effect | Primary existing evidence | Manual cross-check | Pending evidence |
|---|---|---|---|---|---|---|
| `/` | `app/page.tsx`; global `app/layout.tsx`; `RevealSection` | Public landing, catalogue search and public/trade navigation; no session required | R; search submits `q` only | `tests/public-visual-integrity.spec.ts`, `tests/account-access-polish.spec.ts` | F01, F07, Q04–Q07 | All target widths/zoom/keyboard; search URL/back/forward; broken asset/link and slow-load states |
| `/catalogue` | `CatalogueBrowser` | Search released catalogue; public | R API `/api/catalogue`; query is client state | `tests/catalogue-retry.spec.ts`, `tests/public-visual-integrity.spec.ts` | F02, F07, Q02/Q04/Q05/Q08 | Result/empty/service-error distinction, retry, long PN/mobile; released-data truth |
| `/open-account` | `TradeAccountApplicationForm` | Submit a real workshop application; consent and real contact authority required | W `/api/trade-account-applications`; Turnstile external verification when configured | `tests/public-account-application.spec.ts`, `tests/pretrade-routes.test.ts` | F03, F06 | Real consent/Turnstile/email path, duplicate-submit handling, validation/error recovery; no synthetic ABN submission |
| `/portal` | `RoleGate(trade)` + `TradePortalWorkspace` | Trade vehicle/parts, order, documents and returns; valid trade session/account; positive order/RMA cases require real business prerequisites | R/W/C across trade state, lookup, orders, cancellation, document access, RMA | `tests/portal-admin-flow.spec.ts`, `tests/orders.test.ts`, `tests/trading-gate.test.ts`, `tests/account-access-polish.spec.ts` | F04, F07–F10 | Role/session/tenant isolation; pre-trade gating; real lookup/order/document/RMA; slow/offline/duplicate/conflict cases |
| `/password-setup` | `PasswordSetupForm` | Complete recovery/first-password setup using valid recovery context | W auth password; reads access token from URL hash, then clears it | `tests/password-setup-security.test.ts`, `tests/staff-first-login-ui.test.ts`, `tests/auth-recovery.test.ts` | S11 plus auth acceptance | Expired/used/invalid link, history/log secret exclusion, correct completion route by role |
| `/partner` | `RoleGate(partner)` + `PartnerDashboard` | Operational overview for authorised partner/admin-compatible session | R dashboard queries; filter/timezone local/URL state | `tests/partner-dashboard.spec.ts`, `tests/partner-dashboard-api.test.ts`, `tests/warehouse-dashboard.test.ts` | S01, Q01–Q05 | Role matrix, two-shipment separation, latest-request-wins, pagination/completeness, route/back/refresh persistence |
| `/prearrival` | `RoleGate(partner)` + `PrearrivalShipmentPanel` | Create/correct/confirm authoritative packing-list revisions; authorised partner and real source data | W revision create/confirm; L editor selection | `tests/prearrival-shipments.spec.ts`, `tests/prearrival-shipment.test.ts`, `tests/prearrival-draft-validation.test.ts`, `tests/prearrival-revision-validation-route.test.ts`, `tests/navigation-edit-history.spec.ts` | S02–S05, D15, Q05/Q08 | Dirty-leave warning, duplicate/slow/unknown submit, two shipments, full 119-SKU/706-item regression, error focus and mobile editor |
| `/warehouse` | `RoleGate(warehouse_staff)` + `PartnerInboundWorkspace`, which mounts label preview/batch, receipt, putaway and history surfaces | Label → physical outcome → receipt → putaway → history; valid warehouse session/capability and confirmed packing-list scope | R/W/P/C: print jobs, receipt, inventory movements; browser print alone is not Printed | Warehouse label/receipt/putaway/history suites listed below | S06–S10, F10/F11, Q01–Q08 | Physical print/scan/receipt; scope isolation across two shipments; repeated click/network unknown; browser/width/zoom/keyboard; 119/706 regression |
| `/inventory` | `RoleGate(partner)` + `InventoryLocationPanel` | Location browse/create/edit/status/label-print audit; authorised partner/admin-compatible session and evidence for mutations | R/W/P: locations, notes/status, print jobs/outcomes/reprints | `tests/inventory-locations.spec.ts`, `tests/inventory-locations.test.ts`, `tests/inventory-locations-api.test.ts`, `tests/warehouse-location.test.ts` | S15, F11, Q04–Q08 | Unsaved-editor navigation, duplicate codes, print dialog/outcome integrity, keyboard/modal, pagination and slow/offline |
| `/admin` | `RoleGate(admin)` + `PurchaseImportPanel` + `AdminOperationsPanel` + `AdminDashboard` | Admin purchasing/master data/cost/account/order/compliance/report controls; valid admin session; evidence/MFA/business approval for sensitive writes | R/W/C; many financial/master/account mutations and downloads | `tests/admin-master-data.test.ts`, `tests/purchase-import.test.ts`, `tests/portal-admin-flow.spec.ts`, `tests/sensitive-mutation-coverage.test.ts`, `tests/mfa-step-up-dialog.spec.ts` | D01–D15, F10/F11, Q04–Q08 | Section routing/default overview, destructive confirmation, dirty state, duplicate prevention, complete error recovery, AAL matrix, download/browser QA |
| `/admin/staff` | `RoleGate(partner)` + `StaffManagementPage` and staff drawer/form/action/handoff components | Partner read-only staff register; admin create/disable/enable/reset/change-role actions according to API/session result | R/W/C auth/admin records; one-time password is transient sensitive output | `tests/staff-management-ui.spec.ts`, `tests/staff-management-page.test.ts`, `tests/staff-admin-api.test.ts`, `tests/staff-lifecycle-auth.test.ts`, `tests/staff-role-acceptance.spec.ts` | S11–S14, Q02/Q04/Q06–Q08 | Exact partner/admin authorization, drawer focus/Esc/scroll, one-time password leakage checks, expired action/duplicate submit/mobile keyboard |
| `/privacy` | `LegalDocument` + global layout links | Public privacy content | R | `tests/public-visual-integrity.spec.ts` | F05, Q04/Q07 | Content/legal owner review, public contact readiness, responsive/link QA |
| `/terms` | `LegalDocument` + global layout links | Public website terms | R | `tests/public-visual-integrity.spec.ts` | F05, Q04/Q07 | Legal review, responsive/link QA |
| `/trade-terms` | `LegalDocument` + global layout links | Public trade terms | R | `tests/public-visual-integrity.spec.ts`, account consent coverage | F03/F05/F06, Q04/Q07 | Legal/business approval, consent-version consistency, responsive/link QA |
| `/delivery-returns-warranty` | `LegalDocument` + global layout links | Public delivery, returns and warranty principles | R | `tests/public-visual-integrity.spec.ts` | F05, Q04/Q07 | Legal/operations review and final production wording; responsive/link QA |

## Shared controls and route-entry behaviour

| Named control/family | Purpose / precondition | Action and expected result | Recovery | Effect | Source / evidence / pending |
|---|---|---|---|---|---|
| Brand logo; `Catalogue`, `Delivery`, `Account Support`; `Trade Login`; `Open Trade Account` | Global navigation | Move to home/catalogue/home anchors/portal/application | Back or use global navigation; 404/empty anchor is a defect | R | `app/layout.tsx:36-45`; F01/Q05 pending |
| Footer `Privacy`, `Website Terms`, `Trade Terms`, `Delivery, Returns & Warranty` | Public policy navigation | Open corresponding legal route | Back/global navigation | R | `app/layout.tsx:55-59`; F05 pending |
| Footer `Staff login` | Staff entry | **Currently opens `/admin`**, then the current-route `RoleGate` asks for admin access | Back to public site; use role workspace manually if authenticated | R/auth | `app/layout.tsx:60`; confirmed source defect against approved `/staff/login` design; live routing pending |
| `RoleGate` / `AuthPanel` family | Protected route gate; session/role required | Authenticate and expose children only when allowed | Show useful access/session error and retry/login; never expose protected children | Auth state | `components/RoleGate.tsx:19-31`; auth unit/browser suites; role/deep-link matrix pending |
| Global public shell on protected routes | Navigation/account chrome | Same header/footer remains around protected workspaces | Back/global links | R | Page source; consistent role-aware chrome is planned, not yet evidenced |

## Public, catalogue, application and password controls

| Route/control family (named controls) | Purpose / precondition | Action / result | Recovery | Effect | Evidence and pending |
|---|---|---|---|---|---|
| `/`: `VIN, Part Number, vehicle or engine` + `Search catalogue` | Public query | GET navigation to `/catalogue?q=...` | Edit query/back; empty query behaviour must remain understandable | R | `app/page.tsx:31-34`; F07 pending |
| `/`: `Browse released catalogue`, `Open Trade Account`, `Trade Login` | Public conversion paths | Navigate to catalogue/application/portal | Back/global nav | R | `app/page.tsx:51,76`; F01 pending |
| `/catalogue`: `Search released catalogue` | Filter fetched released items by PN/SKU/vehicle/engine/name | Immediate filtered list/count; no write | Clear/edit term | L/R | `components/CatalogueBrowser.tsx:60-65`; catalogue retry spec; empty/result pending |
| `/catalogue`: `Try again` | Only after service error | Reload page and refetch | Preserve/copy query before reload if needed | R | `components/CatalogueBrowser.tsx:63`; slow/offline/recovery pending |
| `/catalogue`: `Open Trade Portal` | Only on no released match | Navigate to `/portal`; approved user may make real request | Back to catalogue | R | `components/CatalogueBrowser.tsx:64`; no-match/manual F02 pending |
| `/open-account`: business/contact/needs fields | Real authorised workshop details | Collect workshop/business name, ABN, contact name/email/phone, postcode, notes | Inline native/API validation; correct fields, do not fabricate | L until submit | `components/TradeAccountApplicationForm.tsx:33-35`; F03/F06 pending |
| `/open-account`: Privacy and Trade Terms checkboxes/links; Turnstile | Informed consent and anti-bot prerequisite | Links open policies; both consents enable submit; configured Turnstile supplies token | Read policies, retry verification; do not repeatedly submit | L/external | `components/TradeAccountApplicationForm.tsx:31-37`; real challenge pending |
| `/open-account`: `Submit application` | Real workshop authority, valid fields, consents, challenge | POST once; success/failure status should identify outcome | If unknown, search admin application record before retry | W | public application spec; F06 real chain pending |
| `/password-setup`: `New password`, `Confirm password`, `Set password` | Valid unused recovery context; passwords match policy | POST password setup; clear URL hash; show completion | Expired/invalid link must request a new admin reset without exposing token | W auth | `components/PasswordSetupForm.tsx:42-107`; security tests; live first-login pending |
| `/password-setup`: completion `Staff login` | Password successfully set | **Currently links `/admin`** | Navigate to appropriate workspace manually | R | `components/PasswordSetupForm.tsx:75-76`; role-aware completion planned/pending |

## Trade portal controls

| Named control/family | Purpose / precondition | Action / result | Recovery | Effect | Evidence / pending |
|---|---|---|---|---|---|
| `Vehicle & Parts`, `Orders`, `Documents` anchors | Move within trade workspace | Hash navigation to section | Back/anchor nav | R | `app/portal/page.tsx:20`; Q05 pending |
| `Rego`, `VIN`, `Search keyword`, `PO / job number`; `Search matching parts` | Real vehicle/part need; trade session | POST `/api/vehicle-lookup`; render explainable matches/no-match | Correct identifiers; on unknown outcome review request state before repeat | W/C (lookup may be recorded) | `TradePortalWorkspace.tsx:121-164,320-351`; F07 pending; random VIN/Rego prohibited |
| Result `Add` buttons | Released/available result and trading enabled | Add item to local quote/order pad; repeated-add semantics must be clear | Correct/remove quantity path required before submit; currently pending audit | L | `TradePortalWorkspace.tsx:466-470`; F08 positive flow pending |
| `Submit order` | Trading enabled, real customer, products/inventory, non-empty lines | POST `/api/orders` once; show order ID/state | If timeout/unknown, inspect Orders/admin before retry | W | `TradePortalWorkspace.tsx:193-222,426-430`; orders/trading tests; current Pre-trade positive case pending |
| Order `Cancel` | Existing cancellable order and real cancellation need | POST cancel; state and reservation should update | Refresh/order lookup before repeating | W | `TradePortalWorkspace.tsx:227-246,513-520`; F08 pending |
| Document `Download`/`View` buttons | Document belonging to current trade account | Fetch document and open/download | Show blocked-popup/fetch error; retry only read | R/download | `TradePortalWorkspace.tsx:250-269,555-559`; F09 tenant isolation pending |
| Return: `Dispatched order`, `Reason`, `Return lines: SKU, quantity`, `Submit return request` | Real dispatched order and return facts | POST `/api/rma`; create traceable RMA | Correct fields; if unknown search account/admin before retry | W/C | `TradePortalWorkspace.tsx:277-300,586-630`; F10 positive chain pending |

## Partner dashboard and pre-arrival controls

| Named control/family | Purpose / precondition | Action / result | Recovery | Effect | Evidence / pending |
|---|---|---|---|---|---|
| Dashboard workspace links | Open Dashboard, Pre-arrival shipments, Inbound operations, Put away, Receipt history, Inventory & locations, Staff management | Navigate/deep-link to intended workspace/view | Back/global/side navigation | R | `PartnerDashboard.tsx:147-154`; navigation specs; full role/viewport matrix pending |
| `Display timezone` | Choose Brisbane/UTC presentation | Refetch/reformat dashboard times | Restore Brisbane default | L/R | `PartnerDashboard.tsx:171-177`; Q02/time truth pending |
| `Refresh snapshot` | Read current operational snapshot | Refetch dashboard; disabled while loading | Error state/retry; latest result must win | R | `PartnerDashboard.tsx:177`; slow/repeated pending |
| `Find shipment, SKU or reference` + `Filter` | Narrow dashboard | Update query/filter and visible cards | Clear/change filter | L/R | `PartnerDashboard.tsx:203-209`; completeness/back persistence pending |
| `Open pre-arrival`, shipment `nextAction`, `Review operation`, `Open receipt history` | Context-aware navigation | Route to named operational record/view | Back must preserve source context | R | `PartnerDashboard.tsx:221-283`; two-shipment deep links pending |
| Pre-arrival workspace/shipment anchors and `Shipment` selector | Choose explicit shipment and section | Load selected shipment; URL/context must agree | Reload known shipment; never assume first/default shipment after error | R | `PrearrivalShipmentPanel.tsx:692-727`; two-shipment test pending |
| `Create first Packing List`, `Open working copy`, `Create revision` | Real authoritative source, appropriate packing-list state | Open local editor/revision workflow | Close/reload with dirty confirmation; preserve confirmed version | L until save | `PrearrivalShipmentPanel.tsx:758-839`; draft tests; dirty navigation pending |
| Source scope cards; `Add source scope`; `Remove source scope` | Edit packing structure | Select/add/remove draft carton/group | Validation and discard confirmation; never change confirmed history silently | L | `PrearrivalShipmentPanel.tsx:795-811`; 119/706 regression pending |
| Packing fields: physical pallets; pallet number; scope type; source scope number; physical cartons; member cartons; line SKU/name/qty/unit cost/flags | Reconcile source data | Update working copy with field-level validation | Focus first error; correct source; reload confirmed data if abandoned | L | `PrearrivalShipmentPanel.tsx:853+`; validation tests; long data/mobile pending |
| `Save Packing List draft` / confirm action family | Create immutable pending revision then confirm | POST revision, then POST confirm; warehouse unlocks only after confirmed response | Unknown result: reload shipment status before any retry; corrected revision path | W | endpoints at `PrearrivalShipmentPanel.tsx:549-581`; concurrency/idempotency and 119/706 pending |
| `Start corrected revision`; `Reload shipment status` | Recover from pending/reconciliation state | Open correction or refetch authoritative state | Remain locked until state is known | L/R then possible W | `PrearrivalShipmentPanel.tsx:850-852`; conflict/slow/offline pending |

## Warehouse inbound controls (mounted on `/warehouse`)

| Named control/family | Purpose / precondition | Action / result | Recovery | Effect | Evidence / pending |
|---|---|---|---|---|---|
| View links: label print / receive stock / put away / receipt history | Switch explicit operational stage while retaining shipment | URL/view updates; appropriate panel mounts | Back/forward and selected-shipment check | R/L | `PartnerInboundWorkspace.tsx:30-66`; navigation/history specs; full deep-link pending |
| `Shipment` selector | Choose explicit confirmed shipment | Load that shipment/scope | Re-select; do not carry another shipment's selection/results | R/L | lines 183-187, 837-839; two-shipment isolation pending |
| Packing-list gate `Prepare source data` | Shipment lacks confirmed packing list | Navigate to matching `/prearrival?shipmentId=...` | Back after confirmation; remain locked otherwise | R | lines 196-225; prearrival/warehouse gate tests |
| Scope: pallet/source-scope checkboxes, `Full shipment`, carton/group lookup + `Find scope` | Select receipt/print scope | Resolve selected source scope; member carton selects parent group | Invalid lookup leaves selection unchanged; reselect/reload on error | L/R | lines 845-863; scope lookup tests; conflicting selection/latest-request pending |
| `Preview labels` | Label-ready selected scope | Show sample preview only; creates no job | Return/change scope/master data | L | line 884; screenshot/print-layout pending |
| `Print labels` | Label-ready scope, no pending operation | Create saved label job and open browser print output | If dialog closes, remain awaiting outcome; inspect job before retry | W/P | lines 884-888; label suites; physical TSC/Edge pending |
| `Cancel print`; `Confirm printed` | Existing pending job; confirm only after actual physical result | Record cancelled/printed; receipt unlocks only for Printed | Inspect job/history; never infer Printed from dialog closure | W/P | line 886; automated job-state tests; physical outcome pending |
| `Reprint reason`; `Reprint labels` | Printed job and genuine reprint need | New audit event retains original artwork | Require reason; inspect audit on unknown | W/P | line 888; legacy-artwork/reprint physical pending |
| `Open label print` / `Open receipt history`; `View receipt history` | Recover from unmet stage or inspect audit | Switch view | Back/view tabs | R/L | lines 894,910; Q05 pending |
| Receipt mode `Scan each unit` / `Counted quantity` | Printed scope and receipt unlocked | Switch local capture mode | Reset/re-scan only before submit | L | line 900; keyboard/scanner/device pending |
| `Scan product barcode` | Physical item in selected scope | Enter recognises `products.barcode` and increments/selects matching line | Unknown/out-of-scope error; verify label/scope, do not substitute PN | L | line 901; real scanner pending |
| `Actual counted quantity`, `Difference type`, `Difference reason`, `Add receipt line` | Counted mode, recognised SKU; discrepancy requires truthful reason | Stage a receipt line | Correct staged line before submit | L | line 902; boundary/keyboard pending |
| `Confirm receipt` | Real count complete and validation satisfied | POST receipt once; create receipt/inventory staging effects | Unknown result: inspect receipt history before retry | W/P/C | line 904; receipt API/concurrency tests; physical 706-unit receipt pending |
| Putaway controls (location scan/resolve, quantity/move confirm) | Confirmed staging stock and real destination location | Create inventory movement to location | Resolve location and inspect history before retry | W/P/C | `WarehousePutawayPanel`; putaway suites; real scan/physical pending |
| History filters/pagination/edit navigation | Existing warehouse events | Read/filter audit and navigate to relevant source/editor | Clear filters/retry fetch; historical facts immutable | R | `ReceiptHistoryPanel`; history specs/tests; full pagination/latest-request pending |

## Inventory/location controls

| Named control/family | Purpose / precondition | Action / result | Recovery | Effect | Evidence / pending |
|---|---|---|---|---|---|
| Search/status/type filters and location selection | Find warehouse location | Filter/read details | Clear filters/retry | R/L | `InventoryLocationPanel`; location tests; complete pagination pending |
| Create location fields + create action | Real approved location code/type/description | POST location | Correct duplicate/invalid fields; inspect list before retry | W/C | inventory location API/spec tests; real-data acceptance pending |
| Location status action | Genuine operational status change | PATCH status | Confirm current stock/records; refresh before repeat | W/C | API tests; dependency/confirmation UX pending |
| `Edit`/details; `Physical description`; `Notes`; `Save location notes`; `Close editor` | Evidence-backed metadata correction | Open editor, save PATCH, or close | Dirty-close warning required; reload on error | L/W | `InventoryLocationPanel.tsx:470-472`; unsaved/back pending |
| Location label selection/print | Selected locations | Create print audit/job and browser output | Stay pending until explicit result | W/P | inventory/warehouse label tests; physical layout pending |
| `Cancel print`; `Confirm printed` | Pending location label job | Record actual outcome | Inspect job before retry | W/P | `InventoryLocationPanel.tsx:481-482`; physical pending |
| Reprint label checkboxes; `Reprint reason`; `Reprint selected labels` | Printed job, selected items, real reason | Create reprint job/audit | Require reason/selection; inspect audit | W/P | `InventoryLocationPanel.tsx:487-491`; physical/audit pending |

## Administration controls

The original `/admin` source observed during inventory mounts all three large components together (`app/admin/page.tsx:19-22`). Therefore the groups below were simultaneously present rather than routed sections; this is a confirmed high-priority baseline experience and accidental-write risk against the approved “Overview only by default” requirement.

| Named control/family | Purpose / precondition | Action / result | Recovery | Effect | Evidence / pending |
|---|---|---|---|---|---|
| Admin module links: Dashboard, Overview, Purchasing, Products, Inventory, Orders, Accounts, Compliance, Pricing, Reports, Staff | Navigate sections/routes | Hash or route navigation | Back/global/section nav | R | `app/admin/page.tsx:21`; section/deep-link/mobile pending |
| PI `.xlsx`, supplement `.json`; `Preview & validate` | Authoritative source file | Validate hash/totals and issue preview token; no commit | Correct source/format; preserve original file | R/server validation | `PurchaseImportPanel.tsx:12-13`; purchase-import tests; future supplier compatibility D15 pending |
| `Commit approved preview` | Reviewed valid preview, authorised real import, MFA as required | Persist import once with idempotency key | Unknown result: inspect import run before retry | W | same source; test evidence exists, real future import conditional |
| `Refresh admin state` | Read latest state | Refetch admin aggregate | Error/retry | R | `AdminDashboard.tsx:239-240,713-715`; slow/error pending |
| Exports: inventory, reorder alerts, orders, movements, documents, lookups, batches, applications, trade accounts | Authorised reporting | Fetch/download selected export | Show download/fetch failure; retry read only | R/download | `AdminDashboard.tsx:758-784`; content/tenant/browser download pending |
| Product `Edit`; SKU select; barcode; OEM PN; reorder point/quantity; status; label profile fields; `Save SKU master` | Evidence-backed correction to selected SKU | PATCH selected product/master profile; readiness recalculates | Keep existing value, show field errors; refresh selected SKU | W/C | `AdminDashboard.tsx:826-897`, `ProductLabelProfileFields`; master/profile tests; real correction/MFA pending |
| `Clear label draft` and label preview/readiness family | Clear unsaved label profile only | Reset local draft; must not mutate saved profile | Reload selected SKU | L | mounted `ProductLabelProfileFields`; D07 pending |
| Bulk SKU rows; `Import SKU masters` | Real new master-data rows in documented format | POST batch import | Identify failed rows; inspect records before repeat | W/C | `AdminDashboard.tsx:906-915`; admin master tests; duplicate/partial failure pending |
| New SKU fields; `Create SKU master` | Actual new product data | POST one new draft/active/paused SKU | Correct validation; search SKU before retry | W/C | lines 926-972; D08 pending |
| Fitment SKU/make/model/year/engine/confidence; `Create fitment rule` | Evidence-backed fitment relationship | POST rule | Never promote likely to exact; inspect before repeat | W/C | lines 984-1039; fitment tests; evidence workflow pending |
| Bulk fitment rows; `Import fitment rules` | Approved fitment dataset | POST batch import | Failed-row reporting; inspect before repeat | W/C | lines 1048-1058; fitment tests; partial/duplicate pending |
| Trade account `Pause` / `Reactivate` | Formal account decision, no conflicting transactions | PATCH status | Confirm account/history; refresh before repeat | W/C | lines 1257-1269; D12 pending |
| Application `Approve`; `Provision login` | Verified real application; authorised email | Approve then create/login handoff once | Check application/account first; do not duplicate identity/email | W/auth/C | lines 1342-1353; portal-admin tests; real mail delivery pending |
| Order `Cancel` | Real cancellable order | POST cancellation | Refresh/order lookup before retry | W/C | lines 1393-1398; order tests; positive business case pending |
| Landed cost: Shipment ID, status, allocation basis, AUD cost fields; `Save cost version` | Complete approved evidence, currency/allocation confirmed | Save version via sensitive request/MFA | If unknown, query version/history before retry | W financial/C | `AdminOperationsPanel.tsx:134-185`; sensitive mutation tests; traceable retrieval/real evidence pending |
| Payment/adjustment: account ID, entry type, AUD amount, reference; `Post account entry` | Approved finance evidence | Append one ledger entry | Inspect ledger before repeat; never use test amount | W financial/C | `AdminOperationsPanel.tsx:200-237`; D13 pending |
| RMA inspection: RMA ID, outcome, credit AUD; `Record inspection` | RMA physically received/quarantined | Persist inspection/credit result | Verify RMA stage and record before repeat | W financial/inventory/C | `AdminOperationsPanel.tsx:252-281`; F10 chain pending |
| Pricing/compliance review/approve families | Existing eligible SKU and evidence | Sensitive approve/review endpoints where surfaced | Leave blocked reason visible; do not alter GST/trading gate to enable | W/C | API/sensitive coverage tests; D14 notes visible capability may be incomplete; positive UI evidence pending |

## Staff administration controls

| Named control/family | Purpose / precondition | Action / result | Recovery | Effect | Evidence / pending |
|---|---|---|---|---|---|
| Staff workspace/admin links | Navigate operational/admin areas according to viewer role | Partner sees read-only route; admin additionally sees Administration | Back/navigation | R | `StaffManagementPage.tsx:203-210`; role/chrome pending |
| `Create staff account` | Admin only; real personal work email and approved role | Open create drawer; submit creates pending-first-login user and one-time password | Cancel closes; unknown create requires register/email lookup before retry | W/auth/C | lines 218-245; staff tests; real email/MFA pending |
| `Try again` | Collection load failure | Refetch staff list | Preserve no-change guarantee | R | line 225; recovery spec pending |
| `Search name or email`; role/status filters | Find staff record | Client filter only | Clear filters | L | lines 230-235; long email/empty/filter keyboard pending |
| Staff row/open account | View detail and audit | GET detail and open drawer | Retry list/detail; return focus to trigger | R | `StaffRegister`, `StaffDrawer`; drawer focus/Esc pending |
| Account actions: disable, enable/reactivate, reset password, change role | Admin only, reason/confirmation/MFA as applicable | PATCH exact user; keep history; reset produces one-time handoff | Inspect user/audit before retry; cancellation leaves unchanged | W/auth/C | `StaffAccountOverview`, `StaffActionForm`; lifecycle/API tests; duplicate/expired/MFA pending |
| Password handoff copy/reveal/finish family | Immediately deliver one-time password to authorised admin only | Transient display/copy; closing should make it unavailable | Generate a new reset through controlled action if lost | Sensitive transient | `StaffPasswordHandoff`; security/leakage and clipboard/mobile pending |
| Drawer close/cancel/Esc/focus | Safely leave read/create/action detail | Close non-locked drawer; return focus; prevent background interaction | Complete/cancel locked step explicitly | L | `StaffDrawer`; Q06 pending |

## Legal document controls

`/privacy`, `/terms`, `/trade-terms` and `/delivery-returns-warranty` mount `LegalDocument`. They contain document text and inherit only shared header/footer links; there are no route-specific buttons, forms or persisted actions. F05 requires identity/contact/terms consistency and explicitly does not replace legal review. Current copy includes pre-production qualifiers, so final legal/operations approval remains pending.

## Existing browser configuration boundary

- `playwright.config.ts:5-18` intentionally excludes the auth-dependent suites from the general browser run.
- Those excluded suites **already have** the dedicated `playwright.auth.config.ts:5-25` configuration and separate server/base URL. They must be run through that existing config during Task 5; they are not “missing tests.”
- The three suites excluded by the general config are exactly `account-access-polish.spec.ts`, `auth-panel-redesign.spec.ts` and `staff-role-acceptance.spec.ts`; all three are included by the existing auth config. That auth config also includes `auth-entry.spec.ts`. Exact execution/pass counts require fresh command evidence.
- Current configs provide Edge projects; Task 5 also requires WebKit and the specified width/landscape/zoom/keyboard matrix. A config entry is not evidence that every route/control/state was exercised.

## High-priority failure-risk ledger

| Priority | Concrete source-backed risk | Classification | Required evidence / disposition |
|---|---|---|---|
| P0 | Staff entry and password-setup completion hard-link to `/admin` (`app/layout.tsx:60`; `components/PasswordSetupForm.tsx:75-76`). A warehouse or partner user can land on the wrong gate/workspace. | Confirmed defect against approved plan | Implement `/staff/login` and role-aware safe destination later; verify public-entry, fresh session, first-password, allowed deep link, rejected external/loop/unauthorised target |
| P0 | `/admin` mounts purchase import, financial/RMA mutations, master data and dashboard together (`app/admin/page.tsx:19-22`), contrary to “Overview only by default.” Dense simultaneous forms raise accidental-write and context-loss risk. | Confirmed UX/safety gap | Section routing with legacy anchors; default overview; dirty-state/confirmation/MFA/repeated-click tests before release |
| P0 | Print flows separate browser dialog from explicit `Confirm printed`, but physical acceptance is absent. Incorrect operator confirmation would unlock receipt despite no usable label. | Operational risk, controls partly implemented | TSC/Edge physical print, barcode scan, cancel/close/confirm/reprint audit; never infer Printed |
| P0 | Real receipt/order/account/financial actions can produce durable inventory, account or ledger effects. A timeout or repeated click without record lookup can duplicate/contradict business state. | High-impact risk | Pending/busy/idempotency plus unknown-outcome recovery evidence on every sensitive family; inspect history/state before retry |
| P1 | `RoleGate` authenticates the current route (`components/RoleGate.tsx:19-31`) and does not itself implement role-aware post-login routing/deep-link retention. | Confirmed architecture gap for Task 2 | Full role/session/first-password/MFA/deep-link matrix |
| P1 | `/admin/staff` declares `RoleGate expectedRole="partner"` (`app/admin/staff/page.tsx:13`) while UI conditionally permits admin mutation. This may be deliberate partner-read/admin-manage compatibility, but exact authorization depends on `AuthPanel`/API semantics. | Risk requiring verification, not asserted bug | Prove partner read-only, admin manage, warehouse/trade denied at UI and API |
| P1 | Pre-arrival and warehouse maintain substantial local editor/scope state; route/back/shipment changes can cross context or discard edits unless guarded. | UX/data-integrity risk | Two distinct shipments, dirty editor, back/forward/refresh, latest-request-wins and conflicting-selection tests |
| P1 | Manual guide identifies currently conditional/unimplemented long-chain capabilities (positive ordering, documents, RMA receive/inspect, dispatch/delivery, adjustments/transfers/counts, universal supplier import, pricing/compliance publication). API/component existence cannot be treated as usable UI coverage. | Capability boundary | Record `待条件`/`能力缺口`; no fabricated feature or pass claim |
| P1 | Public legal/support wording includes pre-production/future qualifiers and lacks final legal evidence. | Content/legal gate | Legal/operations review before trading; do not claim legal approval |

## Task 5 execution ledger (all currently pending here)

1. Fresh unit, typecheck and production build evidence; reconcile exact counts with the plan baseline rather than reusing the stated 351/1/72 as a fresh result.
2. General browser suite plus the **existing dedicated** `playwright.auth.config.ts` suites; Edge/Chrome-equivalent and WebKit. No unexplained failures or skips.
3. All 15 routes: public/protected, role/session/first-password/MFA, happy/error/empty/slow/offline/repeated-click/conflicting-selection states.
4. Two shipments with different content, explicit deep links and back/forward/refresh; 119-SKU/706-item regression.
5. Widths 375/390/701/768/880/1280/1440, landscape, 100/125/150/200% zoom, keyboard/focus/Esc/reduced-motion; no page-wide horizontal overflow. Wide tables may use labelled internal scrolling.
6. Screenshot review tied to exact route/state/width, plus downloads and long PN/email/UUID/date/currency rendering.
7. Physical label/location print, real barcode scanning, receipt and putaway remain pending until controlled operational acceptance. No browser-only test may mark these passed.
8. Update the human acceptance guide/questionnaire only after the final verified UI. Production deployment, migration, real-account/data actions and rollback capture require separate authorization.

## Scope freeze

This inventory records existing capability and risks. It does not authorize new business functions. The approved implementation scope is experience stability: staff entry/workspace routing, context preservation, explicit feedback/recovery and visual consistency while preserving APIs, print dimensions/barcode payloads, immutable job semantics and legacy routes/anchors. Production remains untouched.
