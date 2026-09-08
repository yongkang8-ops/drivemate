# Navigation and Warehouse history report

Date: 2026-09-08. Status: initial bounded navigation regression passed; subsequent scope-URL extension awaits its expanded browser result. Overall project QA remains open.

## Approved implementation

- Cross-page links use components/StableLink.tsx, a native anchor preserving href, class, target, accessibility attributes, and browser behavior. Ten existing files changed their Link import; their other link behavior was retained.
- Same-page administration sections and warehouse views retain their existing stateful handlers. Fragment navigation stays within the document.
- hooks/useUnsavedChanges.ts maintains one native beforeunload listener for all mounted dirty readers. It does not intercept links, patch history methods, or use the Navigation API. This avoids double confirmation. confirmWorkspaceExit exposes the same registry for explicit programmatic teardown such as sign-out; root owns the AuthPanel integration and its separate test.
- Warehouse owns indices only for its own view/shipment history entries, preserving opaque Next history fields. Its restore handler reads current dirty/busy state, uses history.go to restore the original position after cancellation, and permits same-shipment view changes without losing the receipt draft.
- An accepted shipment change clears the discarded receipt draft before starting the next asynchronous load, so immediate Forward cannot prompt for old counts belonging to the previous shipment.
- No credential or draft persistence, API changes, production writes, commits, pushes, or deployment.

The accepted tradeoff is a document load for cross-page navigation. In-memory drafts are not promised after the user accepts leaving. The browser controls native warning wording. See 2026-09-08-navigation-decision.md for the decision and failed predecessor evidence.

## Verification

- Final complete focused browser run: 14 passed, 0 skipped, 0 unexpected, 0 flaky; 30.540516 seconds. Seven Edge and seven WebKit cases. Root run 76377, exit 0, machine-readable evidence experience-history-results.json.
- Covers dirty cross-page Back and Forward cancellation then acceptance; clean history; multiple mounted dirty editors; cancelled refresh and native link exit with one warning; same-page view retention; initial shipment normalization; preserved history fields; dirty shipment Back cancellation, acceptance, and immediate Forward.
- History helper unit tests: 3/3 passed.
- TypeScript: npx tsc --noEmit --incremental false exited 0 after the final receipt-clear change.
- The previous 13/14 run exposed a real WebKit race: the trace recorded a third confirmation during immediate Forward while old receipt counts remained dirty. The final source fixes this synchronously; the test retains immediate Forward rather than waiting away the failure.

## Handoff boundary

Final root verification supersedes the pending counts below: history/scope/scroll 26/26 passed; affected internal and public Catalogue flows also passed in the final 198-case Edge pass and 142-case Chrome/WebKit pass. See `2026-09-08-experience-final-report.md` for exact configuration counts, overlaps and native BFCache limitations.

Subsequent scope extension: explicit canonical cartonNumber/palletNumber and scope=all URL context now restores selected scope after document navigation or reload, validates incoming identifiers, and applies dirty history cancellation to same-shipment scope changes. Shipment switching clears old scope parameters. Routing/scope/history helper units pass 42/42 and TypeScript exits 0. The new browser cases first failed 6/6 as expected before implementation; the complete 24-case scope+history run is pending root execution. The earlier 14/14 recorded above is not a claim about this extended snapshot.

Source is frozen for root's broader regression, review, and release acceptance. The focused GREEN does not claim overall experience-stability completion, physical printing/scanning acceptance, or Production readiness. Root is the sole browser/server executor for subsequent QA.
