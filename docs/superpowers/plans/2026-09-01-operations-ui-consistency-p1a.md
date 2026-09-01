# Operations UI Consistency P1A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove three verified low-risk Operations UI defects without changing authentication, permissions, data, APIs, or business workflow.

**Architecture:** Preserve the existing native CSS Operations workspaces. Remove one duplicate Dashboard navigation surface while retaining its Staff destination in the existing sidebar, add one narrow-desktop media rule for Shipment rows, and scope disabled-button styling to the Inventory workspace. Each change is driven by a focused Playwright regression before implementation.

**Tech Stack:** Next.js 16, React 19, TypeScript, native CSS, Phosphor Icons, Playwright, Vitest.

---

## File map

- Modify `app/partner/page.tsx`: remove the obsolete Dashboard-level `internal-tabs` wrapper.
- Modify `components/PartnerDashboard.tsx`: retain the Staff destination inside the existing private Operations sidebar.
- Modify `app/globals.css`: add the verified narrow-desktop Shipment grid and Inventory-scoped disabled styles.
- Modify `tests/partner-dashboard.spec.ts`: cover navigation ownership and geometric containment.
- Modify `tests/inventory-locations.spec.ts`: cover disabled and enabled computed button styles.
- Reference `docs/superpowers/specs/2026-09-01-operations-ui-consistency-p1a-design.md`: approved scope and acceptance criteria.

## Scope guard

Do not edit `RoleGate`, `AuthPanel`, MFA, session APIs, Staff table CSS, Supabase code, migrations, warehouse business rules, Packing List logic, or public-site components. Stop if any planned test requires one of those files.

### Task 1: Move Staff navigation into the Dashboard workspace

**Files:**
- Modify: `tests/partner-dashboard.spec.ts`
- Modify: `app/partner/page.tsx:10-21`
- Modify: `components/PartnerDashboard.tsx:146-153`

- [ ] **Step 1: Write the failing private-navigation test**

Append this test to `tests/partner-dashboard.spec.ts`:

```ts
test("the dashboard keeps private module navigation inside its workspace chrome", async ({ page }) => {
  await page.goto("/partner");

  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Partner modules" })).toHaveCount(0);

  const operationsNavigation = page.getByRole("navigation", {
    name: "Partner operations navigation",
  });
  await expect(
    operationsNavigation.getByRole("link", { name: "Staff management" }),
  ).toHaveAttribute("href", "/admin/staff");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx playwright test tests/partner-dashboard.spec.ts --project=edge -g "keeps private module navigation"
```

Expected: FAIL because `Partner modules` currently has count 1 and `Staff management` is absent from `Partner operations navigation`.

- [ ] **Step 3: Remove the obsolete page-level navigation**

Replace the `RoleGate` children in `app/partner/page.tsx` with:

```tsx
<RoleGate expectedRole="partner">
  <PartnerDashboard />
</RoleGate>
```

Do not add another wrapper or sticky element.

- [ ] **Step 4: Retain Staff access in the existing sidebar**

Add this link after `Inventory & locations` in `components/PartnerDashboard.tsx`:

```tsx
<Link href="/admin/staff">Staff management</Link>
```

The Staff API remains responsible for Partner read-only versus Administrator management access.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```powershell
npx playwright test tests/partner-dashboard.spec.ts --project=edge -g "keeps private module navigation"
```

Expected: 1 passed. The Dashboard heading is visible, `Partner modules` is absent, and the sidebar Staff link targets `/admin/staff`.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- app/partner/page.tsx components/PartnerDashboard.tsx tests/partner-dashboard.spec.ts
git commit -m "fix: keep dashboard navigation inside operations shell"
```

### Task 2: Contain Shipment actions at narrow-desktop widths

**Files:**
- Modify: `tests/partner-dashboard.spec.ts`
- Modify: `app/globals.css:608-635`

- [ ] **Step 1: Write the failing 1150px geometry test**

Append this test to `tests/partner-dashboard.spec.ts`:

```ts
test("shipment actions stay inside the worklist at a narrow desktop width", async ({
  page,
  request,
}) => {
  await request.post("/api/test/reset?packingList=empty");
  await page.setViewportSize({ width: 1150, height: 900 });
  await page.goto("/partner");

  const shipmentPanel = page.locator(".partner-shipment-panel");
  const attentionPanel = page.locator(".partner-attention-panel");
  const action = page.getByRole("link", { name: "Open pre-arrival", exact: true });

  await expect(action).toBeVisible();
  const shipmentBox = await shipmentPanel.boundingBox();
  const attentionBox = await attentionPanel.boundingBox();
  const actionBox = await action.boundingBox();

  expect(shipmentBox).not.toBeNull();
  expect(attentionBox).not.toBeNull();
  expect(actionBox).not.toBeNull();

  expect(actionBox!.x).toBeGreaterThanOrEqual(shipmentBox!.x);
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(
    shipmentBox!.x + shipmentBox!.width,
  );
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(attentionBox!.x);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx playwright test tests/partner-dashboard.spec.ts --project=edge -g "narrow desktop width"
```

Expected: FAIL because the current action right edge exceeds the Shipment panel right edge and enters the Attention column.

- [ ] **Step 3: Add the minimal narrow-desktop grid**

Insert this media rule before the existing `@media (max-width: 1040px)` block in `app/globals.css`:

```css
@media (min-width: 1041px) and (max-width: 1240px) {
  .partner-shipment-row {
    grid-template-columns: minmax(0, 1fr) max-content;
    grid-template-areas:
      "reference action"
      "stage statuses";
    gap: 12px 16px;
    padding: 14px 0;
  }
  .partner-shipment-reference { grid-area: reference; min-width: 0; }
  .partner-shipment-stage { grid-area: stage; }
  .partner-shipment-statuses { grid-area: statuses; justify-items: end; }
  .partner-open-action { grid-area: action; align-self: start; }
}
```

Do not change the existing `<=1040px` or `<=700px` layout rules.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npx playwright test tests/partner-dashboard.spec.ts --project=edge -g "narrow desktop width"
```

Expected: 1 passed. The action is inside the Shipment panel and ends before the Attention panel begins.

- [ ] **Step 5: Add the cross-viewport overflow regression**

Append this test to `tests/partner-dashboard.spec.ts`:

```ts
test("the dashboard avoids page-level horizontal overflow at supported widths", async ({
  page,
  request,
}) => {
  await request.post("/api/test/reset?packingList=empty");
  await page.goto("/partner");

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 900 },
    { width: 1150, height: 900 },
    { width: 1040, height: 900 },
    { width: 768, height: 844 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${viewport.width}px`).toBeLessThanOrEqual(1);
  }
});
```

- [ ] **Step 6: Run the cross-viewport test**

Run:

```powershell
npx playwright test tests/partner-dashboard.spec.ts --project=edge -g "page-level horizontal overflow"
```

Expected: PASS after removal of the obsolete top navigation and addition of the narrow-desktop Shipment grid. If it fails at a different element, stop and capture that element before adding CSS.

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- app/globals.css tests/partner-dashboard.spec.ts
git commit -m "fix: contain dashboard shipment actions"
```

### Task 3: Make Inventory disabled actions visually unambiguous

**Files:**
- Modify: `tests/inventory-locations.spec.ts`
- Modify: `app/globals.css:916-947`

- [ ] **Step 1: Write the failing computed-style test**

Append this test to `tests/inventory-locations.spec.ts`:

```ts
test("disabled location actions look unavailable and recover enabled styling", async ({ page }) => {
  await page.goto("/inventory");

  const createButton = page.getByRole("button", { name: "Create locations" });
  await expect(createButton).toBeDisabled();

  const disabledStyle = await createButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      cursor: style.cursor,
    };
  });
  expect(disabledStyle.cursor).toBe("not-allowed");

  await page.getByLabel("Location code batch").fill("BNE-A01-03");
  await page.getByRole("button", { name: "Preview exact codes" }).click();
  await expect(createButton).toBeEnabled();

  const enabledStyle = await createButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      cursor: style.cursor,
    };
  });
  expect(enabledStyle.cursor).toBe("pointer");
  expect(disabledStyle.backgroundColor).not.toBe(enabledStyle.backgroundColor);
  expect(disabledStyle.color).not.toBe(enabledStyle.color);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx playwright test tests/inventory-locations.spec.ts --project=edge -g "disabled location actions"
```

Expected: FAIL because the disabled button currently computes to `cursor: pointer` and retains the enabled brand colors.

- [ ] **Step 3: Add Inventory-scoped disabled styles**

Add this block after the Inventory action button rules in `app/globals.css`:

```css
.inventory-location-app .button:disabled {
  border-color: #d5e1df;
  background: #e7edeb;
  color: #728587;
  cursor: not-allowed;
  opacity: 1;
  box-shadow: none;
}
.inventory-location-app .button:disabled:hover {
  border-color: #d5e1df;
  background: #e7edeb;
  color: #728587;
}
```

Do not add a global disabled rule in this Hotfix.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npx playwright test tests/inventory-locations.spec.ts --project=edge -g "disabled location actions"
```

Expected: 1 passed. Disabled and enabled computed styles differ and both retain readable text.

- [ ] **Step 5: Run existing Inventory lifecycle coverage**

Run:

```powershell
npx playwright test tests/inventory-locations.spec.ts --project=edge
```

Expected: all existing Inventory location tests pass, including create, notes, print, audit, reprint, cancel, and 390px mobile visibility.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- app/globals.css tests/inventory-locations.spec.ts
git commit -m "fix: clarify disabled inventory actions"
```

### Task 4: Full local verification and design review

**Files:**
- Verify only: all modified files
- Update only if evidence requires it: `docs/superpowers/specs/2026-09-01-operations-ui-consistency-p1a-design.md`

- [ ] **Step 1: Run focused Dashboard and Inventory browser tests**

```powershell
npx playwright test tests/partner-dashboard.spec.ts tests/inventory-locations.spec.ts --project=edge
```

Expected: all focused tests pass with no unexpected console or network errors.

- [ ] **Step 2: Run unit and type verification**

```powershell
npm test
npm run typecheck
```

Expected: Vitest passes with only the existing explicitly skipped test; TypeScript exits 0.

- [ ] **Step 3: Run the Production build**

```powershell
npm run build
```

Expected: Next.js production build exits 0 and generates all existing routes.

- [ ] **Step 4: Run browser design QA at controlled widths**

Start the local server:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3200
```

Inspect `/partner?qa=p1a` and `/inventory?qa=p1a` at:

```text
1440x900
1280x900
1150x900
1040x900
768x844
390x844
```

For Dashboard, record the topbar, Shipment panel, action, Attention panel, and document scroll-width measurements. For Inventory, record disabled and enabled button computed styles. Confirm no new layout, contrast, focus, or navigation regression.

- [ ] **Step 5: Run the P1A design pre-flight**

Confirm each item:

```text
[ ] Existing DriveMate palette and radius system preserved
[ ] No new dependency or design system added
[ ] Staff destination retained
[ ] No page-level horizontal overflow
[ ] No wrapped desktop action label
[ ] Disabled text remains readable
[ ] Keyboard focus names unchanged
[ ] No authentication, permission, MFA, API, or data file changed
[ ] No visible em dash added
```

- [ ] **Step 6: Review the final diff and commit any test-only correction**

```powershell
git status --short
git diff --check
git diff 6c9cfe2...HEAD -- app/partner/page.tsx components/PartnerDashboard.tsx app/globals.css tests/partner-dashboard.spec.ts tests/inventory-locations.spec.ts docs/superpowers
```

Expected: diff is limited to the approved P1A files. If an unapproved file appears, stop and remove it from the branch before continuing.

### Task 5: Preview handoff gate

**Files:**
- No code changes expected.

- [ ] **Step 1: Report local outcome**

Report:

```text
Branch and HEAD
Commits created by each task
Focused test result
Full Vitest result
Typecheck result
Build result
Responsive measurements
Pre-flight result
Known remaining P1B and Staff table items
```

- [ ] **Step 2: Obtain external-write authorization**

Before any push, state:

```text
Target: GitHub branch hotfix/operations-ui-consistency-p1a-20260901 and Vercel project drivemate-parts Preview
Change: P1A navigation, narrow-desktop Shipment layout, Inventory disabled visual state
Impact: Preview only, no Production alias or Supabase write
Rollback: delete or ignore Preview and Git branch; current Production remains unchanged
```

Wait for explicit authorization before `git push` or creating the Vercel Preview.
