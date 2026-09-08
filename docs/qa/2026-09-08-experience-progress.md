# Execution ledger — experience-stability-20260908

Plan: docs/superpowers/plans/2026-09-08-experience-stability.md
Branch: feature/experience-stability-20260908; base eb8df7c.

## Constraints and coordination

Local only. Keep unrelated AGENTS.md/CLAUDE.md. No external writes, no migrations.
Ruling: use existing linked worktree on a new branch, rather than creating another checkout — preserves dependencies and approved baseline; rollback is local Git history.
Ruling: serialize Next dev/browser configs despite different ports — all use .next/dev lock; avoids false hydration/build evidence.
Ruling: preserve admin editors mounted while switching semantic hidden sections — preserves draft state and API behavior; costs initial rendering, to be checked during QA.
Ruling: use existing playwright.auth.config.ts for excluded suites, not claim tests absent — source inspection found the dedicated config; coverage must be verified by running it.

| Tasks sharing interface | Contract | Resolution |
| --- | --- | --- |
| Auth / shell | AuthPanel callback retained; shared frame wraps it | Agent owns AuthPanel; root owns RoleGate/layout |
| Admin / pagination | Existing cells/actions preserved | Root owns both; no server changes |
| Inventory / final QA | Static inventory is not executed acceptance | Document evidence pending until final tests |
| UX / printing | Screen-only styles cannot alter label payload/dimensions | Print regressions mandatory |
| Tasks 1–5 consistency | Tests must cover behavior, not count skipped as pass | Status below is evidence-scoped |

## Evidence and progress

- Baseline: 72 unit files, 351 passed, 1 skipped (2026-09-08).
- Task 1 static surface inventory: 15/15 original routes, mounted control families; docs/qa/2026-09-08-route-control-matrix.md. Browser evidence pending.
- Admin RED: experience-admin.spec.ts 2 expected failures (unrelated forms visible), 1 pre-existing draft-preservation pass.
- Admin initial GREEN: 3/3. Navigation visibility extension GREEN; catalogue pagination RED due missing pager.
- Purchase preview RED: actual render lacks QA-PART-24 because rows.slice(0,12). GREEN: full 24-row render passes under default 25-page size.
- Auth entry: commit 82a2469, focused auth browser 28/28 and auth unit 50/50 passed; scoped independent review approved after three corrections. Final integrated auth rerun still required.
- Admin async feedback: dedicated browser 7/7 passed and independent scoped review approved after four corrections. Later root dirty-guard changes require another regression.
- Initial integrated Edge run: 164 discovered, 152 passed, 11 explicitly skipped by local trading gates, 1 failed due old Account session hidden assertion. Assertion updated to approved visible account bar; NOT a final passing suite.
- Visual inspection performed on initial /admin 1440/375, /warehouse 768 and /admin/staff 375 screenshots. Found tablet scope text compression; adjusted screen-only layout. Initial screenshots/report preserved outside repository in deliverables/2026-09-08-experience-stability-evidence/edge-initial.
- Recovery RED: 5/5 failed (Warehouse/Pre-arrival initial offline, Staff malformed successful response, Staff dirty close, Trade lookup offline). First GREEN 4/5, fifth test selector found a pagination status rather than operation status; selector corrected, final rerun pending.
- Additional RED: location pager missing (1 failure); administrator/public dirty exits produced zero prompts (2 failures); production administrator markup included executable sample import rows (unit 1 failure). Implementations added; production-default unit now 2/2 passed.
- Review corrections: retain unrelated uncertain Trade request identities, missing document URL is error, Pre-arrival detail failure enables retry, saved print outcome does not falsely claim unlocked when scope refresh fails.
- Shared navigation guard under cross-browser review. An earlier page.goto-only history test was insufficient; replaced with real Next Link entry and fallback tests. Do not claim final Back/Forward acceptance until Edge+WebKit results and review are available.
- Local trading-only config added for the 11 default skips plus explicit Trade UI tests; no Production trading/GST settings changed.
- New useListFilters persists explicit non-secret Staff/Location filters in URL and resets page on user filter changes; refresh/back checks pending.
- Final integrated QA, visual review, guide update and release candidate: NOT COMPLETE.

## Outstanding scope

Shared navigation tests/visual review; dirty navigation and loss recovery; slow/stale responses; pending write guards; all long-list paging/filter state; remaining public/portal surfaces; full auth/roles/unit/type/build/multibrowser/two-shipment/print regression; final independent review and manual package update.

## Subsequent integrated audit (supersedes earlier pending implementation notes)

- Native cross-document links adopted after actual Edge/WebKit failures of the client-router/history blocker. No global history monkeypatch. See navigation decision ADR.
- Auth lifecycle purges protected children and password fields before browser caching; revalidates on persisted pageshow. Dedicated auth suite 30/30 passed before adding the password-recovery pending regression; final 31-case rerun pending.
- MFA now invalidates deferred actions on cancellation/pagehide, ignores old generation callbacks, recovers network failures, traps keyboard focus and returns focus after the caller's disabled fieldset is released. MFA 7/7 passed. Read-only independent review approved cancellation/generation scope.
- Staff drawer sequential typing exposed a focus-reset bug; stable callback refs fixed it. Chrome targeted typing/new-SKU sibling-draft checks passed.
- Dashboard search/timezone URL restoration, stale-response exclusion and complete worklist pagination: three new RED cases, then all 12 context tests passed.
- Original 24 Edge/WebKit history+scope tests passed. Added native Back scroll test exposed asynchronous session/document shrink; Edge+WebKit scoped 2/2 passed after restoration. Restoration stores viewport numbers only; fallback keys use supported-context validation. Three additional source review concerns fixed; final 26-case history run in progress.
- Full unit run with the actual authoritative PI path: 77 files, 396 passed, zero skipped. Workbook is read only; no production data written.
- Integrated Edge 205-case run: 190 passed, 11 local trading-gate skips, 4 failures. Two genuine validation-focus failures fixed; two stale broad status locators narrowed, and old purchase-batch expectation moved to its approved Purchasing section.
- Follow-up 29-case run: 27 passed, 2 scope-fault fixture failures. One-shot HTTP fault was masked by development Strict Mode's repeated initial effect. Fault fixture now remains unavailable until explicit operator retry; both scope HTTP recovery cases passed (2/2). This is distinct from claiming a one-shot fault reproduced in Production.
- Source audit found initial Warehouse HTTP scope errors lacked retry (both all-scope and selected-scope requests). Added initial error flag without changing print/receipt permission gates.
- New manual guide and feedback questionnaire are candidate drafts, explicitly NOT deployed or accepted. Exact native browser zoom, physical mobile keyboard, real printer/scanner, SMTP/Auth provider and physical warehouse operations remain distinct external/field checks.
- Final full Edge, auth, trading, Chrome/WebKit, build and artifact freeze still required. No push/deploy/migration has occurred.

## Final-pass follow-ups

- History + scope + list scroll: final 26/26 passed, no skips (1.1m).
- Auth including recovery pending: 31/31 passed (31.9s); public hydration guard added subsequently, so one more auth pass is required.
- Trading-enabled local configuration: 32/32 passed (19.7s). Covers all 11 tests skipped by the default pre-trade configuration; no Production flags changed.
- Chrome/mobile-WebKit first integration: 134/138 passed, 4 failures. One test interception teardown race fixed by waiting for intercepted responses before disposing context. Three public-form/catalogue cases exposed interaction before hydration/URL restoration; added useHydrated disable guards to public controlled inputs (application, catalogue, login, password setup). A no-JavaScript SSR test first failed with enabled inputs; subsequent 10-case Chrome+WebKit focused run passed.
- Reference for the initialization fix: https://playwright.dev/docs/navigations#hydration. Do not wait away the missing-handler issue in tests; prevent input until handlers are attached.
- Screenshot review found pagination disabled buttons visually identical to enabled buttons. Computed-style RED confirmed opacity 1; screen-only disabled treatment added. Functional disabled state remains native and print CSS is unaffected.
- Official Playwright navigation documentation states actual BFCache restoration is unsupported by its normal navigation automation. Auth cache-purge tests explicitly dispatch lifecycle events; native Back tests cover document navigation and scroll, not actual cached-browser heap restoration. Actual browser-cache behavior stays a documented field acceptance boundary.

## Candidate closeout

Final authoritative results: `2026-09-08-experience-final-report.md`. Runtime source frozen after Catalogue viewport reuse; no later application changes.

- Units: 399/399, 78 files, zero skips. TypeScript: pass.
- Edge complete: 198 passed, 11 pre-trade conditional skips, zero failure/flaky.
- Auth three browsers: 93/93. Trading three browsers: 96/96, including every default skipped case.
- Chrome + mobile WebKit experience: 142/142. Earlier dedicated history: 26/26; its affected flows also pass in final broad suites.
- Production build: compile/typecheck successful on default attempt, Windows native worker error at 31 workers; unchanged source passes all 61 static outputs with process-local CIRCLE_NODE_TOTAL=3 (2 workers). Root cause of the native exit is not asserted proven. No Next/Vercel config change.
- Production-mode local read-only smoke: all 16 page routes HTTP200; anonymous admin-state/admin-staff/warehouse-state API403. Temporary local server stopped afterward.
- Independent reviewers approved their bounded source scopes, including final hydration, initial scope recovery, validation focus and public viewport allowlist changes.
- Candidate guide/questionnaire and final evidence matrix prepared; actual provider, device, native-cache and physical-operation limits explicitly not marked passed.
- Remaining external task: separate publication authorization, then deployed-domain/log/current-admin read-only validation, followed by human/physical acceptance. No Production writes, push or deployment executed here.
