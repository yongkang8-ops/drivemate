# Navigation lifecycle decision — 2026-09-08

Approved local implementation decision: cross-page links use the shared StableLink native anchor. Existing same-page section and warehouse view handlers retain their stateful navigation. No API, permission, password, print, or Production behavior changes are authorized by this decision.

## Evidence and tradeoff

The prior real Next Link history tests exposed a WebKit native Navigation API cancellation failure: cancelling Back retained the visible URL but the next accepted Back navigated to about:blank. The fallback capture-popstate implementation then failed Edge dirty Back/Forward: diagnostic logging showed the editor guard being removed during routing before its popstate handler ran. The expanded prior suite was 8 passed / 6 failed, so that implementation was not accepted.

Cross-page native navigation gives the browser responsibility for beforeunload before React editors are removed. One shared dirty-reader registry produces one warning, including when multiple editors are dirty. The tradeoff is a document load for cross-page links; no cross-page in-memory draft preservation is promised after the user accepts leaving. Same-page section changes continue to preserve mounted editors and avoid unload warnings.

This removes the Navigation API dependency and all global history monkeypatches. The browser owns the confirmation wording; only local dirty state is read, with no draft, password, or token persistence.

## Verification

- Native-link focused run: 12/12 passed, 6 Edge and 6 WebKit. Covered Back cancel/accept, Forward cancel/accept, clean Back/Forward, same-page warehouse view draft preservation, multiple mounted editors, cancelled refresh, and one prompt per native-link exit.
- Test setup uses actual application links. Artificial history seeding was removed; cross-page same-document assertions were intentionally removed to match this decision.
- Warehouse same-document shipment changes use local entry indices and current state refs. Cancelling restores the history position with history.go, preserving Forward entries; no global history methods are replaced.
- The expanded run initially passed 13/14. WebKit trace showed a third confirmation during immediate Forward after accepting a shipment change: old receipt counts stayed dirty until the asynchronous scope response. The accepted switch now clears the discarded receipt draft synchronously before loading.
- Final expanded run: 14/14 passed, 7 Edge and 7 WebKit, exit 0, 30.5 seconds (root run 76377; experience-history-results.json). Includes shipment Back cancellation with original history position preserved, acceptance, and immediate Forward while the next scope may still be loading.
- History state helper unit tests: 3/3 passed. TypeScript check with --noEmit --incremental false exited 0 after the synchronous-clear fix.
- No commit, push, deployment, or Production action performed.

This closes the bounded navigation change only. Overall experience-stability QA and release acceptance remain with the root task and are not declared complete here.

## Scope context extension

The subsequent Task 3 extension stores explicitly selected canonical source scopes in repeated cartonNumber/palletNumber URL parameters. scope=all distinguishes an intentional full-shipment selection from the existing first-pallet default. Shipment changes remove the old scope parameters. Initial load and history restoration validate identifiers against the selected shipment's authoritative scope response; unknown or mixed scope context displays a recoverable error and disables print/receipt actions.

Only /warehouse login destinations accept these new keys, with length and control-character checks; supplier identifiers containing an encoded # are retained. No API or business-record changes are involved. The same local history-position/dirty-draft protection now covers scope changes.

- Scope browser RED: 6/6 failed before implementation (missing URL context and missing invalid-scope protection).
- Routing and scope/helper unit checks: 42/42 passed; TypeScript exited 0 after implementation.
- Expanded scope+history plus asynchronous list-scroll restoration: 26/26 passed (Edge + WebKit), 1.1 minutes, `experience-history-results.json`.

## Scroll and browser-cache safety

Native Back can arrive before asynchronous session validation and list data have rebuilt the document height. The new RoleGate hook restores saved viewport coordinates only after authorised content is large enough. History entry data is preferred; a tab-scoped sessionStorage coordinate fallback handles WebKit history-state replacement. Keys pass the supported workspace-context allowlist; unknown query parameters are never placed in storage. No input values, business records, passwords or authentication material are cached.

Wheel/touch/keyboard interaction, context changes, cancellation or the five-second maximum ends the pending restoration. A changed URL/hash cannot receive an older section's deferred scroll. Source review findings concerning rAF cancellation, stale fallback preference and unsafe keys were fixed before the final 26-case run.

AuthPanel clears protected children and credentials on pagehide and revalidates cached pages before redisplaying protected operations. Dedicated lifecycle-event tests and native history tests cover different layers; they do not prove every real browser cache policy or external session-provider condition.
