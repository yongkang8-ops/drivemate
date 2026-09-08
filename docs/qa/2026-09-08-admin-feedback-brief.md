# Admin form recovery subtask

Worktree feature/experience-stability-20260908. User approved full stabilization, local-only, existing business API/data rules unchanged. Root already added section prop to AdminOperationsPanel/AdminDashboard and pagination to all AdminDashboard tables; retain those edits.

Own components/PurchaseImportPanel.tsx, components/AdminOperationsPanel.tsx, components/AdminDashboard.tsx, focused tests/admin-form-recovery.spec.ts, optional narrow lib or hook for async form feedback. Do not edit other files/CSS or spawn agents. No commit yet.

Task: TDD robust pending/failure handling for visible existing admin writes. Prevent double-submit synchronously (use ref, not only React state). Catch network and malformed JSON, restore controls, preserve user inputs on failure. No automatic retry; on uncertain write outcome state 'Result could not be confirmed. Check saved records before retrying.' Read errors distinguished from empty collections. Server denial leaves form correct. Fields should have associated validation errors/summary and focus invalid field when missing required; no new business constraints beyond API's required fields. Do not alter financial math/permissions/endpoints.

Purchase: changing either upload invalidates old validated preview token and old preview immediately. Inflight old validation response must not overwrite newly selected inputs. Commit remains disabled unless validation belongs to current files. Use actual server/previews quantities, not hardcoded706 or119 in success/match wording. One idempotency key per intended commit; never auto resend unknown outcomes. Keep file controls unavailable during final commit. On malformed/error clear busy and show useful status.

AdminOperations: cost save, account adjustment, RMA inspection independent status tied to visible section (shared global old message must not show wrong operation in another section). Keep values on error, disable affected submit. Empty required IDs cannot dispatch. Current section-only presentation preserved.

AdminDashboard: protect all existing actions from overlapping duplicate submission; catch fetch errors at UI action boundary; read refresh failure must not claim no records. Prefer small helpers around existing handlers; avoid rewriting data model. Preserve all editable state and paginate table behavior. Audit success texts against actual response (e.g. setupEmailSent false must not say sent). Do not implement new APIs or known prototype features.

Use TDD local browser fault injection and exact request-count assertions; no real users/email/cost writes. Use existing main config port3100 only after root says lock free. Add output report docs/qa/2026-09-08-admin-feedback-report.md with RED/GREEN and any gaps. Root current fullsuite running, start with source/unit work and notify before browser runs.
