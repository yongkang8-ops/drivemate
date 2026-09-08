# DriveMate 全站体验与稳定性收口

Approved by user 2026-09-08. Baseline eb8df7c. This document records the approved conversation plan and local execution contract.

## Global constraints

- Local implementation and tests only. No push, deployment, Production writes, physical print confirmation, or migrations.
- Keep existing routes, APIs, business rules, role boundaries and step-up MFA. No framework/component-library replacement.
- Admin uses business sections, not an all-forms landing page. Warehouse and Trade users retain their appropriate workspace.
- No passwords, MFA secrets or authentication tokens in URLs, logs, persisted UI state or documentation.
- All changes need regression evidence; skipped/unavailable/physical acceptance is never reported as passed.
- Keep print dimensions/barcode payloads and immutable job semantics unchanged. Never infer Printed from dialog closure.

## Task 1: Inventory and baseline

Inventory all 15 original routes and mounted controls, purposes/preconditions/results/recovery/write effects/evidence. Separate confirmed defects, UX gaps, risks and unimplemented capabilities. Freeze implementation scope, retain issue/test ledger. Baseline unit tests 351 passed, 1 skipped; 72 files.

## Task 2: Staff entry and unified workspace

Add /staff/login; defaults admin/partner -> /partner, warehouse_staff -> /warehouse, trade -> /portal. Supported same-origin authorized deep links retain context; reject external/loop/unauthorized destinations. Password setup retains first-login priority and appropriate completion route. Common role-aware nav/account/public-site controls, legacy /admin anchors and routes remain supported. Admin sections: overview, purchasing, products+fitment, costs, accounts, orders+returns, pricing+compliance, reports. Overview only by default. Retain existing components/state and APIs.

## Task 3: Context and feedback

Consistent back/forward, filters/pagination/scroll, explicit shipment and scope context, discard confirmation on leaving dirty editors, beforeunload warning. Visible labels, useful errors, pending and duplicate-submission guards. No blind write retries, no offline queue/autosave. Complete paginated list visibility (25/50/100), current-page select-all, latest-request-wins. Drawer keyboard/focus and password handoff protections preserved.

## Task 4: Visual consistency

Preserve brand/light style; unify controls, spacing, typography, notices, mobile navigation, focus, long identifiers, 200% zoom and reduced motion. No page-wide horizontal overflow; wide tables may have labeled internal scrolling. Print CSS isolated. Only existing capability repaired; do not add business functions.

## Task 5: Integration QA and delivery

All public and protected routes; role/session/first-password/MFA matrix; happy/error/empty/slow/offline/repeated-click/conflicting-selection cases. Existing auth suites run in a dedicated isolated browser config. Test two shipments with different content locally plus 119-SKU/706-item regression. Edge/Chrome and WebKit; widths 375/390/701/768/880/1280/1440, landscape/zoom/keyboard. Unit/type/build/browser evidence and screenshot review. No unexplained failures; physical scan/print/receipt remains pending. Update acceptance guide/questionnaire only against final verified UI. Single candidate release, separate Production authorization and rollback capture required.

## Progress

- Task 1: source route/control inventory and frozen scope complete; final execution evidence is maintained separately.
- Tasks 2–4: implementation, targeted RED/GREEN and integrated local verification complete.
- Task 5: local automatic verification, screenshot review and report/manual/questionnaire complete. Runtime candidate frozen at 01d91e5; final test/document packaging is a separate local commit. Production release and the explicitly documented provider/physical/native-browser checks remain separately gated.
