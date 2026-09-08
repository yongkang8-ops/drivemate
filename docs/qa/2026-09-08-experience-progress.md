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
- Auth work ongoing in auth_entry agent; independent review pending.
- Final integrated QA, visual review, guide update and release candidate: NOT COMPLETE.

## Outstanding scope

Shared navigation tests/visual review; dirty navigation and loss recovery; slow/stale responses; pending write guards; all long-list paging/filter state; remaining public/portal surfaces; full auth/roles/unit/type/build/multibrowser/two-shipment/print regression; final independent review and manual package update.
