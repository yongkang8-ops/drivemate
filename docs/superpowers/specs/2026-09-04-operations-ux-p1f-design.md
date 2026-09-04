# P1F Operations UX Hotfix Design

Date: 2026-09-04

Branch: `hotfix/operations-ux-p1f-20260904`

Status: user selected Approach A; written specification awaiting final review

## 1. Objective

Resolve four verified Production UX defects without changing warehouse business rules, API contracts, permissions, audit semantics, routes, or data.

The hotfix covers:

1. Accurate active-scope wording when pallet mapping is not recorded.
2. Stable print-job presentation for UUIDs, long statuses, and action buttons.
3. Consistent private operations presentation for Inventory and Staff.
4. Fully discoverable mobile operations navigation without horizontal clipping.

## 2. Evidence and root causes

### 2.1 Active-scope wording

`PartnerInboundWorkspace` renders a fixed fallback string:

`Pallet mapping not recorded · Full shipment selected`

The text does not use `selectedCartons`, so it remains unchanged after source scope `34#` is selected.

### 2.2 Print-job card

`.inbound-job-row` uses `grid-template-columns: 1fr 1fr auto`. Its UUID and long status share limited equal-width columns, while `.inbound-job-row strong` uses `overflow-wrap: anywhere`. The combination produces narrow vertical fragments before the layout reaches its mobile breakpoint.

### 2.3 Internal page shell

The global stylesheet hides the public header, public footer, and authenticated `AuthPanel` when Dashboard, Pre-arrival, or Warehouse is present. Equivalent selectors are missing for `.inventory-location-app` and `.staff-operations-app`.

As a result, authenticated Inventory and Staff pages contain both public-site chrome and private operations chrome.

### 2.4 Mobile navigation

Warehouse already uses a two-column navigation grid below 700px. Dashboard, Pre-arrival, Inventory, and Staff instead use horizontally scrolling flex rows with `min-width: max-content`, creating clipped destinations and visible horizontal scrollbars.

## 3. Selected approach

Use a narrow behavior and stylesheet hotfix. Preserve the existing page-specific components and avoid extracting a shared `OperationsShell` in this task.

This approach keeps the change reversible and limits regression risk while making all current operations pages behave consistently.

## 4. Detailed behavior

### 4.1 Unmapped-pallet status

Create one pure formatter for the unmapped-pallet scope summary.

| Current selection | Visible text |
| --- | --- |
| No source scopes selected | `Pallet mapping not recorded · Full shipment selected` |
| One source scope selected | `Pallet mapping not recorded · Source scope 34# selected` |
| Multiple source scopes selected | `Pallet mapping not recorded · 3 source scopes selected` |

Rules:

- Use canonical parent source-scope numbers.
- Member carton aliases do not appear as independent operational scopes.
- Pallet-mapped behavior remains unchanged.
- The formatter is presentation-only and never changes request selection data.

### 4.2 Print-job card

Desktop layout:

- Job reference receives the widest flexible column.
- Status receives a bounded readable column.
- Actions remain grouped and do not compress the reference or status.
- UUIDs may wrap at sensible boundaries, but the layout must not create one-character or one-short-fragment vertical columns.

Intermediate layout:

- Below the available three-column width, the job reference and status remain in the first row.
- Actions move to a full-width second row.

Mobile layout:

- Reference, status, and actions form one vertical stack.
- The two outcome buttons remain equal-width and single-line.

No print-job status names, audit outcomes, or button behavior change.

### 4.3 Private operations shell

When authenticated Inventory or Staff application content is present:

- Hide the public header.
- Hide the public footer.
- Hide the standalone authenticated `AuthPanel`.
- Let the internal operations application occupy the full viewport width and at least the full dynamic viewport height.

Unauthenticated behavior remains unchanged:

- The public header, login form, access-required state, and public footer remain available.
- No CSS selector may hide the login form before access is granted.

The existing Dashboard, Pre-arrival, and Warehouse behavior remains unchanged.

### 4.4 Mobile navigation

At widths up to 700px:

- Dashboard, Pre-arrival, Warehouse, Inventory, and Staff navigation use a two-column grid.
- Links use equal available width with normal text wrapping where required.
- No navigation container uses horizontal scrolling.
- No destination is clipped off-screen.
- Active-page styling remains visible and consistent.

At 701px and above, existing desktop and tablet sidebars remain unchanged.

## 5. Files expected to change

- `components/PartnerInboundWorkspace.tsx`
- A small presentation helper under `lib/` if no suitable existing module exists
- `app/globals.css`
- Focused unit and browser tests under `tests/`
- `docs/qa/2026-09-04-production-full-chain-machine-qa.md` only to record the later local verification result

No database migrations, API routes, environment files, or Production data scripts are in scope.

## 6. Test-driven implementation

### 6.1 Unit behavior

Write failing tests for the scope-summary formatter:

- full shipment
- one canonical source scope
- multiple source scopes

Verify each test fails because the new behavior is absent before implementing the formatter.

### 6.2 Browser and structural behavior

Add focused regression checks for:

- source scope `34#` displaying scoped wording
- full shipment restoring full-shipment wording
- authenticated Inventory and Staff hiding public chrome
- unauthenticated Inventory and Staff retaining login chrome
- print-job reference and status having stable layout hooks
- mobile navigation using two columns without a horizontal scroll container

### 6.3 Responsive matrix

Verify these widths:

- 390px mobile
- 701px breakpoint boundary
- 768px tablet
- 880px narrow tablet or desktop
- 1040px narrow desktop
- normal desktop viewport

Required results:

- no page-level horizontal overflow
- no clipped navigation destination
- no fragmented print-job status
- no duplicated public and private chrome after authentication
- login remains usable before authentication

### 6.4 Regression suite

Run:

- focused P1F tests
- full Vitest suite
- TypeScript check
- production build
- `git diff --check`

## 7. Acceptance criteria

P1F is complete only when:

1. Source-scope wording always matches the selected canonical scope.
2. Print-job UUID, status, and actions remain readable at all tested widths.
3. Authenticated Inventory and Staff show only the private operations shell.
4. Unauthenticated Inventory and Staff still show the login route correctly.
5. Every mobile operations destination is visible without horizontal scrolling.
6. No warehouse write behavior, permissions, API request, audit record, or data value changes.
7. All focused and regression checks pass.

## 8. Release boundary

This task ends with local implementation and QA.

The following require separate authorisation:

- pushing the hotfix branch to GitHub
- creating a Vercel deployment
- promoting or deploying to Production
- changing any Supabase data or configuration

The current Production deployment remains the rollback point until a later deployment is explicitly authorised.
