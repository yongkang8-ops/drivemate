# Auth entry implementation brief

Part of approved experience-stability work. Work ONLY on components/AuthPanel.tsx, components/PasswordSetupForm.tsx, new /staff/login page and component, lib/workspaceRouting.ts and focused auth tests/config. Root owns layout/footer/shared shell/admin components. Do not edit them.

Requirements:
- Generic /staff/login accepts approved existing staff sessions, defaults admin and partner /partner, warehouse_staff /warehouse; a trade identity gets /portal, never staff privileges.
- Keep AuthPanel used in protected routes: success stays on deliberately opened authorized business route. New generic entry redirects according to server-verified session role.
- Optional next only allows known same-origin authorized routes (/partner,/prearrival,/warehouse,/inventory,/admin,/admin/staff,/portal) with safe context params/hash; reject protocol-relative, external, encoded traversal, unsupported paths, login/password loops, credentials/token fields. Never log credentials or put them in redirects.
- Password-first-login priority stays; retain safe intended route through password setup where feasible without persisting secrets. Password completion must offer correct staff/trade entry without relaxing server authority.
- Sign-in and password setup must guard duplicate clicks, catch network/non-JSON failures, give recoverable errors and preserve fields on errors; clear secret input state after success. Do not automatically replay ambiguous writes.
- Existing /api/auth/* contracts and Supabase settings unchanged. Root will change public footer link to /staff/login.
- TDD: demonstrate failing browser/unit tests before implementation. Unit tests for destination authorization and hostile URLs; browser tests for genuine UI redirects/error/repeated-click/recovery using local intercepted external Auth responses (do not create real users).
- Own dedicated auth browser config if needed, no real environment credentials; tell root how to run. Avoid simultaneous build/dev conflict. Use local port 3242 distinct from root tests.
- Use apply_patch. No subagents. Do not commit until root requests; report full results in docs/qa/2026-09-08-auth-entry-report.md; short final summary only.

Role permissions remain: /admin admin only; /admin/staff admin or partner; /partner,/prearrival,/inventory admin or partner; /warehouse admin/partner/warehouse_staff; /portal trade. Disabled/unknown roles get no destination. Read AGENTS.md and relevant Next docs before code. Preserve unrelated edits.
