# DriveMate Private Staff Module Design

Date: 2026-08-31
Status: Approved visual direction, pending written specification review
Target route: `/admin/staff`

## 1. Purpose

Build a private Staff management module for DriveMate administrators and partners. The module must make staff account lifecycle, security state and operational access easy to understand without exposing public account registration or sensitive authentication material.

The first operational employee role is `warehouse_staff`. The module also displays `partner` and the protected top-level `admin` account.

## 2. Confirmed interaction model

The page uses the approved **Operations register** structure:

1. Staff summary metrics.
2. Searchable and filterable staff register.
3. Right-side drawer for account details and management.
4. The drawer becomes a full-screen panel on narrow screens.

The following confirmed rules apply:

- Account details open in a right-side drawer.
- Account creation uses the same drawer.
- After account creation, the drawer switches in place to the one-time password handoff state.
- The one-time password handoff cannot be closed until the administrator confirms secure delivery.
- The protected `admin` account appears in the list but is read-only.
- Security audit history appears inside an account drawer, not as the primary page layout.

## 3. Users and permissions

### Administrator

The administrator can:

- View all Staff accounts and security states.
- View Staff audit history.
- Create `warehouse_staff` and `partner` accounts.
- Change an eligible account between `warehouse_staff` and `partner`.
- Reset an eligible account password.
- Reset an eligible account MFA configuration.
- Disable and re-enable eligible accounts.

All write operations use the existing Step-up MFA flow. The UI must automatically resume the requested operation once after successful MFA verification.

The administrator cannot manage an `admin` account through this module.

### Partner

The partner receives a read-only view containing:

- Staff name and email.
- Role.
- Lifecycle status.
- General access type.
- Last login time.
- Account creation date.

The partner view does not show:

- Create account controls.
- Password or MFA management details.
- Account management actions.
- Security audit history.
- One-time passwords.

### Warehouse staff

`warehouse_staff` cannot open `/admin/staff`.

## 4. Page structure

### Private navigation

The Staff module appears only in authenticated internal navigation. It does not appear in the public header, public footer or Trade Portal navigation.

The internal navigation label is `Staff` and links to `/admin/staff`.

### Page heading

- Title: `Staff management`
- Description: `Create, secure and maintain access for warehouse staff and partners.`
- Primary action for administrators: `Create staff account`
- Partners see a `Read-only partner view` indicator instead of the primary action.

### Summary metrics

The page displays five metrics:

1. `Total accounts`: all `warehouse_staff`, `partner` and `admin` profiles.
2. `Pending first login`: accounts with `pending_first_login`.
3. `Active`: accounts with `active` status.
4. `Disabled`: accounts with `disabled` status.
5. `Expiring soon`: pending temporary passwords that expire within 48 hours.

Expired temporary passwords remain included in `Pending first login`, while the register displays an explicit `Expired` security state.

### Staff register

Columns:

- Staff member: display name and email.
- Role.
- Status.
- Security or access summary.
- Last login.
- Created date.

Filters:

- Search by display name or email.
- Filter by role.
- Filter by lifecycle status.

The initial version filters the complete API result in the browser. Server pagination is deferred until the account count justifies it.

Dates display in the user's local browser timezone and include the timezone abbreviation when space allows. The underlying API values remain ISO timestamps.

## 5. Account drawer

### Drawer header

Displays:

- Account classification.
- Display name.
- Email address.
- Close control.

### Overview tab

Displays:

- Role.
- Lifecycle status.
- Last login.
- Created date.
- Password readiness.
- MFA state when the viewer is an administrator.
- Temporary password expiry when applicable.
- Disabled date and reason when applicable.

Eligible administrator actions:

- `Change role`
- `Reset password`
- `Reset MFA`
- `Disable account`
- `Re-enable account`

The action list changes according to account state. Password reset is unavailable while an account is disabled; the account must first be re-enabled.

### Audit history tab

Administrator only. Events show:

- Human-readable action.
- Reason where required.
- Actor.
- Date and time.
- Relevant before and after state without secrets.

The UI never renders passwords, MFA secrets, service keys, raw cookies or tokens from an audit record.

### Protected administrator account

The top-level `admin` account drawer displays:

- `System administrator` classification.
- Lifecycle and security status.
- Last login and creation date.
- Audit history.
- An explanation that management is disabled in this module.

It does not render role, password, MFA reset, disable or re-enable controls.

## 6. Create account flow

### Input state

Fields:

- Full name.
- Personal work email.
- Role: `Warehouse staff` or `Partner`.

The page explains that the system generates a strong one-time password valid for seven days and does not email or store it in readable form.

### Submission state

1. Validate all fields in the browser.
2. Submit `POST /api/admin/staff` through the existing sensitive fetch provider.
3. If the current session is not AAL2, open Step-up MFA.
4. After successful MFA, automatically retry the creation once.
5. Disable duplicate submission while the request is active.

### One-time password handoff

On success, the drawer replaces the form with:

- Account name, email and `Pending first login` status.
- One-time password.
- Expiry date and time.
- Copy control.
- Secure-delivery warning.
- Required confirmation checkbox.
- `Finish and close` button, disabled until confirmation.

Security rules:

- The password exists only in component memory for the current success state.
- It is never written to `localStorage`, `sessionStorage`, console output, analytics or error reporting.
- Closing the completed handoff clears the password from component state.
- Reloading or reopening the account cannot retrieve the password.
- If the password is lost, the administrator must use `Reset password` to generate a new one.

## 7. Management action flows

### Change role

- Select `warehouse_staff` or `partner`.
- Enter a required business reason.
- Complete Step-up MFA if necessary.
- On success, show the new role and reauthentication requirement.

### Reset password

- Enter a required reason.
- Complete Step-up MFA if necessary.
- On success, use the same locked one-time password handoff state as account creation.

### Reset MFA

- Explain that all registered factors will be removed.
- Enter a required reason.
- Complete Step-up MFA if necessary.
- Confirm success in the drawer.

### Disable account

- Explain that DriveMate access is blocked immediately.
- Enter a required reason.
- Complete Step-up MFA if necessary.
- On success, show `Disabled`, the date, actor and reason.

### Re-enable account

- Confirm the action.
- Complete Step-up MFA if necessary.
- On success, show the lifecycle state restored by the server.
- The user must sign in again before gaining access.

## 8. Loading, empty and error states

### Loading

- Use stable table-shaped skeleton rows.
- Do not flash an empty state before the request completes.
- Respect reduced-motion settings.

### Empty

- Administrator: explain that no Staff accounts exist and show `Create staff account`.
- Partner: explain that no Staff accounts are available, without a creation control.

### Collection error

- State that Staff records could not be loaded.
- Confirm that no changes were made.
- Provide `Try again`.
- Display a stable support reference, not a raw Supabase error.

### Action error

- Keep the drawer and entered reason open unless the request definitely completed.
- State whether account permissions changed.
- Allow retry when safe.
- Do not display provider stack traces or authentication internals.

### Session error

- Disabled account: clear local access state and show that the account is disabled.
- Reauthentication required: return to Staff login with an explicit sign-in message.
- Pending first login: redirect to `/password-setup` before exposing internal workspace content.

## 9. Component boundaries

Recommended components:

- `StaffManagementPage`: page composition and viewer permission state.
- `StaffSummaryMetrics`: derived metric presentation.
- `StaffRegister`: search, filtering and row selection.
- `StaffDrawer`: accessible drawer shell and close rules.
- `StaffAccountOverview`: account status and eligible actions.
- `StaffAuditTimeline`: administrator-only audit rendering.
- `StaffAccountForm`: account creation fields and validation.
- `StaffPasswordHandoff`: one-time password delivery state.
- `StaffActionForm`: reason and role inputs for management operations.

The page should not become another monolithic dashboard component. Data fetching and action state should live in focused hooks or small service helpers.

## 10. API integration

Existing Task 3 endpoints:

- `GET /api/admin/staff`
- `POST /api/admin/staff`
- `GET /api/admin/staff/[userId]`
- `PATCH /api/admin/staff/[userId]`

PATCH actions:

- `disable`
- `reenable`
- `change_role`
- `reset_password`
- `reset_mfa`

The page must use `useSensitiveFetch` for all writes. Role enforcement remains mandatory in the server routes; hiding controls is not treated as authorization.

## 11. Visual and responsive rules

- Reuse DriveMate's existing light theme, deep teal navigation, white work surfaces and compact status labels.
- Use one radius system matching the Operations Desk.
- Use Phosphor icons only where an icon materially improves recognition.
- Avoid decorative animation. Motion is limited to drawer and feedback transitions.
- Maintain visible keyboard focus.
- The drawer traps focus while open, closes with Escape when not handoff-locked, and returns focus to its trigger.
- On narrow screens, the drawer occupies the full viewport width.
- The table converts to labelled account rows on mobile rather than forcing unreadable horizontal compression.
- All production UI copy is English.

## 12. Accessibility

- Drawer uses dialog semantics with an accessible title.
- Close, copy and management actions have explicit accessible labels.
- Status is communicated with text, not color alone.
- Loading and action results use appropriate live regions without repeated announcements.
- Confirmation checkboxes have complete labels.
- Destructive actions require an explicit confirmation step.
- Contrast meets WCAG AA for text, controls and focus indicators.

## 13. Testing and acceptance

### Automated tests

- Administrator can load the register and audit data.
- Partner receives the read-only interface without management controls or audit data.
- Warehouse staff and trade accounts cannot open the module.
- Search and filters produce correct results.
- Administrator account remains read-only.
- Create form validation and duplicate-submit prevention.
- Step-up MFA resumes each sensitive action once.
- One-time password appears only after successful create or reset.
- Handoff cannot close before confirmation.
- Closing handoff clears the password from UI state.
- Temporary password expiry displays correctly.
- Loading, empty, collection error and action error states.
- Responsive drawer and keyboard interaction.
- Direct restricted API calls remain rejected by server tests.

### Browser acceptance

- Desktop register and drawer match the approved Operations register prototype.
- Mobile layout remains usable at 390 px width.
- No password appears in browser storage or console output.
- Partner view contains no hidden enabled management controls.
- Admin protected account cannot initiate a mutation.

## 14. Out of scope

- Production migration or deployment.
- Creation of any real Staff account.
- Warehouse capability split, which remains Task 5.
- Public Staff account applications.
- Emailing one-time passwords.
- Server-side pagination before account volume requires it.
- Managing or creating top-level `admin` accounts.

## 15. Approved visual reference

The approved browser prototype is the `Operations register` option with:

- Summary metrics.
- Searchable staff table.
- Right-side account drawer.
- Embedded audit timeline.
- Shared create and one-time password handoff drawer.
- Partner read-only and explicit non-ideal states.
