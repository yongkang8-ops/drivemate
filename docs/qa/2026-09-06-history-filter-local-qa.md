# P1 History Filter Hotfix — local closeout

Date: 2026-09-06 (China).
Branch: `hotfix/history-filter-p1-20260906`.
Base: `e6a32cb11cdd8a6fc2eccba1d320004d62edad18`.
Worktree: `C:\Users\yongk\.config\superpowers\worktrees\drivemate-web\history-filter-hotfix-20260906`.

## Status

**Filter/query correctness: passed local QA. Production: not changed. Full responsive UI acceptance: not complete.**

The product-label batch patch remains uncommitted in its original worktree/branch. Nine label implementation/test files were fingerprinted before this task and compared after implementation; all hashes match. No product-label patch was moved, stashed, committed or included here.

## Reproduction and root cause

The initial browser regression failed with `Expected: "" / Received: "C001"` for a multiple-scope selection. The original effect depended on `cartonNumber` while unconditionally setting it back to the first selected carton. Action/date/timezone changes also triggered the reset. Pending fetches had no cancellation/stale-result guard; network errors had no catch and the empty-state footer could claim the view loaded after a failure.

## Scoped changes

- `components/ReceiptHistoryPanel.tsx`: source selection resets only when the parent context changes; equivalent source sets use a stable context key. Single source defaults to that source; multiple sources default to all selected sources.
- Clear filters clears dates/action/narrower source selection but retains parent Shipment/source context and display timezone.
- The scope summary reflects the effective source filter.
- Fetch cancellation plus an active-request guard prevent stale results/errors from replacing the current query. Previous-query rows are not displayed under newly selected filters.
- Invalid/incomplete calendar dates and reversed ranges stay editable and are not sent as requests. Failure is distinct from empty results, with a retry for load errors.
- `app/api/warehouse/history/route.ts`: backward-compatible optional repeated `sourceScope` parameters carry the parent's source context. Result events/rows are intersected with that context, without duplicating shared multi-source events. A narrower carton outside the context is rejected. Existing single-carton queries and permissions remain supported.
- No database migration, repository mutation, new dependency, role change, navigation redesign, print or receipt logic change.

The API's existing date-boundary interpretation is unchanged; timezone remains the display formatting choice. This hotfix does not redefine reporting-day accounting.

## Verification

| Check | Result |
| --- | --- |
| Clean independent baseline | 59 files; 289 passed, 1 existing skipped |
| Red browser reproduction | Fails on forced first-source selection before implementation |
| Red API context tests | Fail on unrelated-source inclusion and out-of-context filter before implementation |
| Final `npm.cmd test` | 60 files; 292 passed, 1 existing skipped |
| `npx.cmd playwright test tests/history-filter-hotfix.spec.ts tests/warehouse-history.spec.ts --reporter=line` | 7 passed (functional scope; layout exception below) |
| `npm.cmd run build` | Passed; 60 static pages generated |
| `npm.cmd run typecheck` | Passed |
| `git diff --check` | Passed; LF/CRLF notices only |

Browser cases cover default selected-source union, second-source selection, combined action/date/timezone controls, clear semantics, parent-context changes, delayed responses, network retry, invalid dates and a real local API/repository cancellation-audit read. Local memory fixtures only; no Production test records were created. Cancelled fixture jobs remained cancelled after reading/filtering.

The controlled external-response fixtures test client failure/race handling. The additional in-memory API integration test exercises actual routes, saved job snapshots and history projection, without an external database or physical print.

## Known pre-existing tablet layout issue — explicitly NOT passed

The initial mixed functional/responsive test failed at 768px with a populated audit row. Inspection identified the unchanged `.inbound-history-table` six-column minimum widths and six-column filters; the existing mobile card rules activate only below 700px. The narrower tablet content area cannot fit them.

This patch does not alter `app/globals.css` (verified against the base commit), so the layout fix is deferred to the already requested navigation/editing/UI work. The test records the 768px observation and marks it as a known follow-up rather than asserting it passes. Desktop 1440px and mobile 375px fit; tablet 768px does not. No claim of full responsive acceptance is made.

Stable visual evidence:

- [Desktop selected source](<D:/AI HUB/Codex agent/Australia car parts project/deliverables/2026-09-06-history-filter-qa/history-1440.png>)
- [Mobile selected source](<D:/AI HUB/Codex agent/Australia car parts project/deliverables/2026-09-06-history-filter-qa/history-375.png>)
- [Known tablet layout defect](<D:/AI HUB/Codex agent/Australia car parts project/deliverables/2026-09-06-history-filter-qa/history-768-known-layout-issue.png>)

## Handoff

No commit, push, deployment, Production request or Production data change was performed. Generated local AGENTS.md/CLAUDE.md files are not part of the patch. The original product-label patch is untouched.

Next task: unified navigation and editor targeting, including the now-confirmed populated History tablet layout. Keep commits/releases independently reviewable; obtain separate Production release authorization. Do not create fictitious receipts or stock to validate UI.

Method: `using-git-worktrees` isolated the patch; `systematic-debugging` reproduced and localized the reset; `test-driven-development` supplied failing regressions; `verification-before-completion` required fresh tests/build and explicit disclosure of the tablet exception.
