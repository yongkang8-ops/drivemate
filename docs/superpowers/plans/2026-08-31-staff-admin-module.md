# Private Staff Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved private `/admin/staff` Operations register with administrator management, partner read-only access, secure one-time password handoff and complete non-ideal states.

**Architecture:** Keep the Next.js route as a small server composition and place interactive behavior in focused client components under `components/staff/`. Put deterministic filtering, metrics and permission rules in a pure `lib/staffUi.ts` module so they can be tested without a browser. Reuse Task 3 APIs and the existing `MfaStepUpProvider` sensitive-fetch contract; no new database schema or Production writes are part of this task.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 7, native CSS, Phosphor Icons, Vitest, Playwright, existing Supabase-backed Staff API.

---

## File map

- Create `app/admin/staff/page.tsx`: private route metadata and `RoleGate` composition.
- Create `components/staff/StaffManagementPage.tsx`: collection loading, filter state, drawer state and API orchestration.
- Create `components/staff/StaffSummaryMetrics.tsx`: five approved metrics.
- Create `components/staff/StaffRegister.tsx`: searchable and filterable table/mobile rows.
- Create `components/staff/StaffDrawer.tsx`: accessible drawer shell, focus handling and close lock.
- Create `components/staff/StaffAccountOverview.tsx`: account details, actions and protected-admin state.
- Create `components/staff/StaffAuditTimeline.tsx`: administrator-only audit history.
- Create `components/staff/StaffAccountForm.tsx`: create form.
- Create `components/staff/StaffPasswordHandoff.tsx`: one-time password state with secure-delivery confirmation.
- Create `components/staff/StaffActionForm.tsx`: change-role, disable, reset-password, reset-MFA and re-enable confirmation forms.
- Create `lib/staffUi.ts`: pure UI types, filters, metrics, labels and permission helpers.
- Modify `app/admin/page.tsx`: add the private Staff route to admin internal navigation.
- Modify `app/partner/page.tsx`: add a private operations navigation entry for Staff.
- Modify `app/globals.css`: approved Operations register, drawer, state and responsive styles.
- Create `tests/staff-ui-model.test.ts`: pure UI-model tests.
- Create `tests/staff-management-page.test.ts`: route and source-contract tests.
- Create `tests/staff-management-ui.spec.ts`: mocked-browser interaction and responsive tests.

## Task 1: Pure Staff UI model

**Files:**
- Create: `lib/staffUi.ts`
- Create: `tests/staff-ui-model.test.ts`

- [ ] **Step 1: Write failing tests for metrics, filtering and permissions**

```ts
import { describe, expect, it } from "vitest";
import {
  canManageStaffAccount,
  filterStaffAccounts,
  staffSummary,
  type StaffCollectionAccount,
} from "../lib/staffUi";

const accounts: StaffCollectionAccount[] = [
  {
    userId: "admin-1",
    email: "lee@drivemateparts.com.au",
    displayName: "Li Yongkang",
    role: "admin",
    accountStatus: "active",
    mustChangePassword: false,
    requiresReauthentication: false,
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
  },
  {
    userId: "worker-1",
    email: "operator01@drivemateparts.com.au",
    displayName: "Warehouse Operator 01",
    role: "warehouse_staff",
    accountStatus: "pending_first_login",
    mustChangePassword: true,
    requiresReauthentication: true,
    temporaryPasswordExpiresAt: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:00:00.000Z",
  },
];

describe("staff UI model", () => {
  it("derives the five approved summary metrics", () => {
    expect(staffSummary(accounts, new Date("2026-08-31T00:00:00.000Z"))).toEqual({
      total: 2,
      pendingFirstLogin: 1,
      active: 1,
      disabled: 0,
      expiringSoon: 1,
    });
  });

  it("filters by name, email, role and lifecycle status", () => {
    expect(filterStaffAccounts(accounts, { search: "operator01", role: "warehouse_staff", status: "pending_first_login" }))
      .toHaveLength(1);
  });

  it("keeps admin accounts and partner viewers read only", () => {
    expect(canManageStaffAccount("admin", accounts[0])).toBe(false);
    expect(canManageStaffAccount("partner", accounts[1])).toBe(false);
    expect(canManageStaffAccount("admin", accounts[1])).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- --run tests/staff-ui-model.test.ts`

Expected: FAIL because `lib/staffUi.ts` does not exist.

- [ ] **Step 3: Implement the pure model**

Implement and export:

```ts
export type StaffViewerRole = "admin" | "partner";
export type StaffRoleFilter = "all" | StaffRole;
export type StaffStatusFilter = "all" | StaffAccountStatus;
export type StaffFilters = { search: string; role: StaffRoleFilter; status: StaffStatusFilter };
export type StaffCollectionAccount = StaffAccount;

export function staffSummary(accounts: StaffCollectionAccount[], now = new Date()) {
  const soon = now.getTime() + 48 * 60 * 60 * 1000;
  return accounts.reduce((summary, account) => {
    summary.total += 1;
    if (account.accountStatus === "pending_first_login") summary.pendingFirstLogin += 1;
    if (account.accountStatus === "active") summary.active += 1;
    if (account.accountStatus === "disabled") summary.disabled += 1;
    const expiry = account.temporaryPasswordExpiresAt
      ? new Date(account.temporaryPasswordExpiresAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (account.accountStatus === "pending_first_login" && expiry >= now.getTime() && expiry <= soon) {
      summary.expiringSoon += 1;
    }
    return summary;
  }, { total: 0, pendingFirstLogin: 0, active: 0, disabled: 0, expiringSoon: 0 });
}
```

Implement case-insensitive search, exact role/status filters, security labels and `canManageStaffAccount(viewerRole, account)`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run tests/staff-ui-model.test.ts`

Expected: all Staff UI model tests pass.

## Task 2: Private route and navigation contract

**Files:**
- Create: `app/admin/staff/page.tsx`
- Create: `components/staff/StaffManagementPage.tsx`
- Create: `tests/staff-management-page.test.ts`
- Modify: `app/admin/page.tsx`
- Modify: `app/partner/page.tsx`

- [ ] **Step 1: Write failing source-contract tests**

Test that:

```ts
expect(read("app/admin/staff/page.tsx")).toContain('robots: { index: false, follow: false }');
expect(read("app/admin/staff/page.tsx")).toContain('<RoleGate expectedRole="partner">');
expect(read("app/admin/staff/page.tsx")).toContain("<StaffManagementPage />");
expect(read("app/admin/page.tsx")).toContain('href="/admin/staff"');
expect(read("app/partner/page.tsx")).toContain('href="/admin/staff"');
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/staff-management-page.test.ts`

Expected: FAIL because the route and navigation links do not exist.

- [ ] **Step 3: Add the private route**

Use this route composition:

```tsx
export const metadata: Metadata = {
  title: "Staff Management | DriveMate Parts",
  robots: { index: false, follow: false },
};

export default function StaffManagementRoute() {
  return (
    <main className="staff-management-route">
      <RoleGate expectedRole="partner">
        <StaffManagementPage />
      </RoleGate>
    </main>
  );
}
```

Create a minimal `StaffManagementPage` placeholder and add explicit `/admin/staff` links only to authenticated internal navigation.

- [ ] **Step 4: Verify GREEN and type safety**

Run:

```powershell
npm test -- --run tests/staff-management-page.test.ts
npm run typecheck
```

Expected: both commands pass.

## Task 3: Operations register, metrics and non-ideal collection states

**Files:**
- Modify: `components/staff/StaffManagementPage.tsx`
- Create: `components/staff/StaffSummaryMetrics.tsx`
- Create: `components/staff/StaffRegister.tsx`
- Modify: `tests/staff-management-page.test.ts`

- [ ] **Step 1: Add failing tests for the approved page surface**

Assert that the component source includes:

```ts
for (const label of [
  "Total accounts",
  "Pending first login",
  "Active",
  "Disabled",
  "Expiring soon",
  "Staff register",
  "Search name or email",
  "All roles",
  "All statuses",
  "Staff records could not be loaded",
  "No staff accounts yet",
]) expect(combinedSource).toContain(label);
```

Also test `StaffRegister` receives `viewerRole` and does not derive authorization from hidden buttons.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/staff-management-page.test.ts tests/staff-ui-model.test.ts`

Expected: FAIL for missing collection UI strings and components.

- [ ] **Step 3: Implement collection loading**

`StaffManagementPage` must:

- Fetch `GET /api/admin/staff` once on mount with `cache: "no-store"`.
- Derive viewer role from `canManage` (`admin` when true, otherwise `partner`).
- Store `idle | loading | ready | error` collection state.
- Render stable skeleton rows while loading.
- Render administrator and partner empty states separately.
- Render a retry control on collection error.
- Keep raw API messages out of the primary UI and use support reference `STF-LOAD-01`.
- Use `staffSummary` and `filterStaffAccounts` for derived data.

`StaffRegister` must render the six approved columns, local-time dates, textual status labels and row buttons that open account details.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm test -- --run tests/staff-management-page.test.ts tests/staff-ui-model.test.ts
npm run typecheck
```

Expected: all commands pass.

## Task 4: Accessible drawer, account details and secure create flow

**Files:**
- Create: `components/staff/StaffDrawer.tsx`
- Create: `components/staff/StaffAccountOverview.tsx`
- Create: `components/staff/StaffAuditTimeline.tsx`
- Create: `components/staff/StaffAccountForm.tsx`
- Create: `components/staff/StaffPasswordHandoff.tsx`
- Modify: `components/staff/StaffManagementPage.tsx`
- Modify: `tests/staff-management-page.test.ts`
- Create: `tests/staff-management-ui.spec.ts`

- [ ] **Step 1: Write failing contract and browser tests**

Browser mocks:

```ts
await page.route("**/api/auth/session", (route) => route.fulfill({
  contentType: "application/json",
  body: JSON.stringify({ authenticated: true, profile: { role: "admin", displayName: "Li Yongkang" } }),
}));
await page.route("**/api/admin/staff", async (route) => {
  if (route.request().method() === "GET") {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, canManage: true, accounts }) });
    return;
  }
  await route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, account: createdAccount, temporaryPassword: "One-Time-Password-123!", temporaryPasswordExpiresAt: "2026-09-07T00:00:00.000Z" }),
  });
});
```

Test that clicking a row opens a `dialog`, the protected administrator has no mutation controls, Create opens the form, successful creation shows the one-time password, close is disabled until secure delivery is confirmed, and the password is absent after closing and reopening.

- [ ] **Step 2: Verify RED**

Run: `npx playwright test tests/staff-management-ui.spec.ts --project=edge`

Expected: FAIL because the approved drawer and create flow do not exist.

- [ ] **Step 3: Implement `StaffDrawer`**

Requirements:

- `role="dialog"`, `aria-modal="true"`, accessible title ID.
- Focus the close button or first field on open.
- Trap Tab and Shift+Tab within the drawer.
- Escape closes only when `closeLocked` is false.
- Return focus to the opening row/button.
- Full-screen width below the mobile breakpoint.

- [ ] **Step 4: Implement account details and audit**

On row selection, fetch `GET /api/admin/staff/[userId]`. Render Overview and administrator-only Audit history. Render the protected administrator explanation and no mutation controls for `role === "admin"`.

- [ ] **Step 5: Implement create and handoff**

`StaffAccountForm` validates full name, email and role. Resolve `const sensitiveFetch = useSensitiveFetch()` in the parent, submit with `sensitiveFetch("/api/admin/staff", ...)`, disable repeat submission, then replace the form with `StaffPasswordHandoff`.

`StaffPasswordHandoff` keeps the password only in React state, provides clipboard copy, requires a secure-delivery checkbox, and calls a parent clear function before closing.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
npm test -- --run tests/staff-management-page.test.ts tests/staff-ui-model.test.ts
npx playwright test tests/staff-management-ui.spec.ts --project=edge
npm run typecheck
```

Expected: all commands pass.

## Task 5: Sensitive account actions and partner read-only view

**Files:**
- Create: `components/staff/StaffActionForm.tsx`
- Modify: `components/staff/StaffAccountOverview.tsx`
- Modify: `components/staff/StaffManagementPage.tsx`
- Modify: `tests/staff-management-ui.spec.ts`

- [ ] **Step 1: Add failing browser tests**

Cover:

- Partner response with `canManage: false` hides create, audit and all management actions.
- Change role requires a reason and sends `{ action: "change_role", role, reason }`.
- Disable requires a reason and sends `{ action: "disable", reason }`.
- Reset password and reset MFA require reasons.
- Re-enable sends `{ action: "reenable" }`.
- Reset password success opens the locked password handoff.
- A `mfa_required` first response opens the existing MFA dialog and retries the PATCH once after verification.
- Action failure keeps the drawer open and states that no permissions changed when the API confirms failure.

- [ ] **Step 2: Verify RED**

Run: `npx playwright test tests/staff-management-ui.spec.ts --project=edge`

Expected: new action tests fail.

- [ ] **Step 3: Implement action state machine**

Use an explicit union:

```ts
type StaffActionKind = "change_role" | "reset_password" | "reset_mfa" | "disable" | "reenable";

type DrawerMode =
  | { kind: "account"; userId: string; tab: "overview" | "audit" }
  | { kind: "create" }
  | { kind: "handoff"; account: StaffAccount; password: string; expiresAt: string }
  | { kind: "action"; account: StaffAccount; action: StaffActionKind };
```

All mutations call the existing `useSensitiveFetch` helper. Refresh collection and account detail after success. Never optimistically show a role, status or security change before the API confirms it.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npx playwright test tests/staff-management-ui.spec.ts --project=edge
npm test -- --run tests/staff-admin-api.test.ts tests/staff-management-page.test.ts tests/staff-ui-model.test.ts
npm run typecheck
```

Expected: all commands pass.

## Task 6: Approved styling, responsive behavior and final QA

**Files:**
- Modify: `app/globals.css`
- Modify: `tests/staff-management-ui.spec.ts`

- [ ] **Step 1: Add failing responsive and accessibility assertions**

Test desktop at `1440 × 900` and mobile at `390 × 844`:

- The register and Create button are visible for admin.
- Drawer is right-aligned on desktop and full-width on mobile.
- Table becomes labelled account rows on mobile.
- Status text remains visible without relying on color.
- Focus returns to the trigger after closing.
- No horizontal page overflow at mobile width.

- [ ] **Step 2: Verify RED**

Run: `npx playwright test tests/staff-management-ui.spec.ts --project=edge`

Expected: responsive assertions fail before final CSS.

- [ ] **Step 3: Implement approved Operations register CSS**

Use existing DriveMate tokens and the approved prototype:

- Light work surface and deep teal internal navigation.
- Compact six-column register.
- Five summary metrics.
- One consistent radius system.
- Drawer transition only; reduced-motion fallback.
- Visible focus states and WCAG AA contrast.
- Mobile labelled rows and full-screen drawer.
- No decorative gradients, glass effects or unrelated animation.

- [ ] **Step 4: Run focused browser QA**

Run: `npx playwright test tests/staff-management-ui.spec.ts --project=edge`

Expected: all Staff module browser tests pass.

- [ ] **Step 5: Run complete verification**

Run:

```powershell
npm test -- --run
npm run typecheck
npm run build
```

Expected:

- All Vitest files pass, with only existing intentional skips.
- TypeScript exits with code 0.
- Next.js Production build exits with code 0 and lists `/admin/staff`.

- [ ] **Step 6: Inspect the final change set**

Run:

```powershell
git diff --check
git status --short
rg -n "localStorage|sessionStorage|console\.log|mfa_secret|password_secret" components/staff lib/staffUi.ts app/admin/staff tests/staff-management-ui.spec.ts
```

Expected: no diff errors; no password persistence, secret fields or debug logging in Task 4 files.

- [ ] **Step 7: Create a precise local checkpoint after user acceptance**

Stage only the approved Task 4 files with explicit paths. Do not use `git add .`. Do not push or deploy. If accepted prerequisite Task 1–3 files remain uncommitted dependencies, include them only after reviewing the exact staged diff and identifying them in the handoff.
