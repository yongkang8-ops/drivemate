# P1F Operations UX Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct scope wording, stabilise the print-job card, unify authenticated private operations chrome, and remove clipped mobile navigation without changing warehouse behavior or data.

**Architecture:** Add one pure presentation helper for selection wording and keep the existing page-specific operations components. Apply narrowly targeted CSS selectors to the existing internal applications rather than introducing a shared shell component in this hotfix. Extend current Playwright fixtures to prove authenticated and unauthenticated chrome, print-card geometry, and navigation containment.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 7, Vitest 4, Playwright 1.62, existing CSS in `app/globals.css`.

---

## File map

- Create `lib/warehouseScopePresentation.ts`: pure active-scope display formatter.
- Create `tests/warehouse-scope-presentation.test.ts`: formatter behavior tests.
- Modify `components/PartnerInboundWorkspace.tsx`: consume the formatter for unmapped-pallet copy.
- Modify `app/globals.css`: print-job grid, authenticated private chrome, and mobile navigation rules.
- Modify `tests/prearrival-shipments.spec.ts`: full, single, and multiple source-scope wording behavior.
- Modify `tests/warehouse-label-print.spec.ts`: print-job geometry and wrapping regression.
- Modify `tests/inventory-locations.spec.ts`: authenticated and unauthenticated Inventory chrome plus mobile navigation.
- Modify `tests/staff-management-ui.spec.ts`: authenticated and unauthenticated Staff chrome plus mobile navigation.
- Modify `tests/partner-dashboard.spec.ts`: Dashboard mobile navigation containment.
- Modify `docs/qa/2026-09-04-production-full-chain-machine-qa.md`: append local P1F verification evidence only after all checks pass.

### Task 1: Active-scope wording

**Files:**
- Create: `lib/warehouseScopePresentation.ts`
- Create: `tests/warehouse-scope-presentation.test.ts`
- Modify: `components/PartnerInboundWorkspace.tsx:730-740`
- Modify: `tests/prearrival-shipments.spec.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/warehouse-scope-presentation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeUnmappedPalletSelection } from "../lib/warehouseScopePresentation";

describe("describeUnmappedPalletSelection", () => {
  it("describes the full shipment when no source scope is selected", () => {
    expect(describeUnmappedPalletSelection([])).toBe(
      "Pallet mapping not recorded · Full shipment selected",
    );
  });

  it("names one selected canonical source scope", () => {
    expect(describeUnmappedPalletSelection(["34#"])).toBe(
      "Pallet mapping not recorded · Source scope 34# selected",
    );
  });

  it("summarises multiple selected canonical source scopes", () => {
    expect(describeUnmappedPalletSelection(["7#8#9#", "10#11#", "12#"])).toBe(
      "Pallet mapping not recorded · 3 source scopes selected",
    );
  });
});
```

- [ ] **Step 2: Run the unit test and verify RED**

Run:

```powershell
npm.cmd test -- tests/warehouse-scope-presentation.test.ts
```

Expected: FAIL because `lib/warehouseScopePresentation.ts` does not exist.

- [ ] **Step 3: Add the minimal formatter**

Create `lib/warehouseScopePresentation.ts`:

```ts
export function describeUnmappedPalletSelection(sourceScopes: string[]): string {
  if (sourceScopes.length === 0) {
    return "Pallet mapping not recorded · Full shipment selected";
  }
  if (sourceScopes.length === 1) {
    return `Pallet mapping not recorded · Source scope ${sourceScopes[0]} selected`;
  }
  return `Pallet mapping not recorded · ${sourceScopes.length} source scopes selected`;
}
```

Import it in `components/PartnerInboundWorkspace.tsx` and replace the fixed fallback:

```tsx
<span className="inbound-pallet-unmapped">
  {describeUnmappedPalletSelection(selectedCartons)}
</span>
```

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm.cmd test -- tests/warehouse-scope-presentation.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Add browser behavior assertions**

Extend `Partner confirms cartons without pallet mapping and Warehouse uses the full shipment` in `tests/prearrival-shipments.spec.ts`. Before confirming its Packing List, add a second source scope with these exact values:

```ts
await page.getByRole("button", { name: "Add source scope" }).click();
await page.getByLabel("Source scope number").fill("C002");
await page.getByLabel("SKU", { exact: true }).fill("DM-GWM-AF-002");
await page.getByLabel("Expected quantity", { exact: true }).fill("6");
```

After Warehouse opens, first assert the full-shipment copy and `18 expected units`. Then select `C001`, select `C002`, and finally return to `Full shipment`, asserting every state in order:

```ts
await expect(page.getByText(
  "Pallet mapping not recorded · Full shipment selected",
  { exact: true },
)).toBeVisible();
await expect(page.locator(".inbound-scope-bar p")).toContainText("18 expected units");

await page.getByLabel("Source scope C001").check();
await expect(page.getByText(
  "Pallet mapping not recorded · Source scope C001 selected",
  { exact: true },
)).toBeVisible();

await page.getByLabel("Source scope C002").check();
await expect(page.getByText(
  "Pallet mapping not recorded · 2 source scopes selected",
  { exact: true },
)).toBeVisible();

await page.getByRole("button", { name: "Full shipment" }).click();
await expect(page.getByText(
  "Pallet mapping not recorded · Full shipment selected",
  { exact: true },
)).toBeVisible();
await expect(page.locator(".inbound-scope-bar p")).toContainText("18 expected units");
```

- [ ] **Step 6: Run focused browser verification**

Run:

```powershell
npx.cmd playwright test tests/prearrival-shipments.spec.ts --grep "without pallet mapping"
```

Expected: the updated scope wording test passes.

- [ ] **Step 7: Commit Task 1**

```powershell
git add -- lib/warehouseScopePresentation.ts tests/warehouse-scope-presentation.test.ts components/PartnerInboundWorkspace.tsx tests/prearrival-shipments.spec.ts
git commit -m "fix: describe active inbound scope accurately"
```

### Task 2: Print-job card geometry

**Files:**
- Modify: `app/globals.css:484-486`
- Modify: `app/globals.css` responsive sections near 717 and 777
- Modify: `tests/warehouse-label-print.spec.ts`

- [ ] **Step 1: Write the failing geometry test**

Add a new test named `print job remains readable from mobile through narrow desktop`. Reuse the file's existing `/api/test/reset` fixture, stub `window.print` with `page.addInitScript`, navigate to `/warehouse`, select `Pallet P001`, preview labels, and click `Print labels`. After `Awaiting physical confirmation` appears, test widths 1040, 880, and 390:

```ts
for (const width of [1040, 880, 390]) {
  await page.setViewportSize({ width, height: 900 });
  const card = page.locator(".inbound-job-row");
  const reference = card.locator("strong").nth(0);
  const status = card.locator("strong").nth(1);
  const documentWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const referenceBox = await reference.boundingBox();
  const statusBox = await status.boundingBox();

  expect(documentWidth.scrollWidth).toBeLessThanOrEqual(documentWidth.clientWidth);
  expect(referenceBox).not.toBeNull();
  expect(statusBox).not.toBeNull();
  expect(referenceBox!.height).toBeLessThanOrEqual(width > 700 ? 48 : 72);
  expect(statusBox!.height).toBeLessThanOrEqual(width > 700 ? 48 : 72);
}
```

- [ ] **Step 2: Run the geometry test and verify RED**

Run:

```powershell
npx.cmd playwright test tests/warehouse-label-print.spec.ts --grep "print job remains readable"
```

Expected: FAIL at 880px or 1040px because the equal-width grid fragments the UUID or long status.

- [ ] **Step 3: Implement the minimal responsive CSS**

Replace the desktop rule with:

```css
.inbound-job-row {
  display: grid;
  grid-template-columns: minmax(240px, 1.45fr) minmax(190px, 1fr) auto;
  align-items: center;
  gap: 16px 22px;
  margin-top: 26px;
  padding: 18px 22px;
  border-radius: 8px;
  background: #eff5f4;
}
.inbound-job-row > div:not(.inbound-job-actions) { min-width: 0; }
.inbound-job-row strong { overflow-wrap: break-word; word-break: normal; }
```

Add an intermediate breakpoint before the existing 700px rule:

```css
@media (max-width: 1100px) {
  .inbound-job-row { grid-template-columns: minmax(220px, 1.35fr) minmax(180px, 1fr); }
  .inbound-job-actions { grid-column: 1 / -1; justify-self: start; }
}
```

Keep the existing mobile single-column rule and equal-width action grid.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npx.cmd playwright test tests/warehouse-label-print.spec.ts --grep "print job remains readable"
```

Expected: pass at 1040, 880, and 390px with no document overflow.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- app/globals.css tests/warehouse-label-print.spec.ts
git commit -m "fix: keep print job status readable"
```

### Task 3: Authenticated private operations chrome

**Files:**
- Modify: `app/globals.css` near existing `body:has(...)` rules
- Modify: `tests/inventory-locations.spec.ts`
- Modify: `tests/staff-management-ui.spec.ts`

- [ ] **Step 1: Write failing authenticated-shell tests**

Add to `tests/inventory-locations.spec.ts`:

```ts
test("authenticated Inventory uses only the private operations shell", async ({ page }) => {
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "Location management" })).toBeVisible();
  await expect(page.locator(".site-header")).toBeHidden();
  await expect(page.locator(".site-footer")).toBeHidden();
  await expect(page.getByLabel("Account session")).toBeHidden();
});
```

Add to `tests/staff-management-ui.spec.ts` after `mockAdminSession` and `mockStaffApi`:

```ts
test("authenticated Staff uses only the private operations shell", async ({ page }) => {
  await mockAdminSession(page);
  await mockStaffApi(page);
  await page.goto("/admin/staff");
  await expect(page.getByRole("heading", { name: "Staff management" })).toBeVisible();
  await expect(page.locator(".site-header")).toBeHidden();
  await expect(page.locator(".site-footer")).toBeHidden();
  await expect(page.getByLabel("Account session")).toBeHidden();
});
```

- [ ] **Step 2: Write unauthenticated preservation tests**

For each route, intercept `/api/auth/session` before navigation:

```ts
await page.route("**/api/auth/session", (route) => route.fulfill({
  contentType: "application/json",
  body: JSON.stringify({ authenticated: false, configured: true }),
}));
await page.goto("/inventory");
await expect(page.locator(".site-header")).toBeVisible();
await expect(page.getByLabel("Account session")).toBeVisible();
await expect(page.getByRole("heading", { name: "Workspace access required" })).toBeVisible();
await expect(page.locator(".site-footer")).toBeVisible();
```

Repeat for `/admin/staff`.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
npx.cmd playwright test tests/inventory-locations.spec.ts tests/staff-management-ui.spec.ts --grep "private operations shell|unauthenticated"
```

Expected: authenticated tests fail because public chrome and `AuthPanel` remain visible; unauthenticated tests pass.

- [ ] **Step 4: Implement the missing authenticated selectors**

Add beside the existing Dashboard, Pre-arrival, and Warehouse selectors:

```css
body:has(.inventory-location-app) .site-header,
body:has(.inventory-location-app) .site-footer,
body:has(.inventory-location-app) .auth-panel,
body:has(.staff-operations-app) .site-header,
body:has(.staff-operations-app) .site-footer,
body:has(.staff-operations-app) .auth-panel { display: none; }

body:has(.staff-operations-app) .staff-management-route { padding: 0; }
body:has(.staff-operations-app) .staff-operations-app {
  width: 100%;
  min-height: 100dvh;
  margin: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
```

Change only `.inventory-location-app` from `min-height: 100vh` to `min-height: 100dvh`. The new authenticated `.staff-operations-app` override above already supplies `min-height: 100dvh` for Staff.

- [ ] **Step 5: Verify GREEN**

Run the same focused command. Expected: all authenticated and unauthenticated shell tests pass.

- [ ] **Step 6: Update the older Staff desktop assertion**

Replace the existing authenticated `Account session` height assertion in `uses a right-side desktop drawer and returns focus after closing` with:

```ts
await expect(page.getByLabel("Account session")).toBeHidden();
```

Retain all drawer geometry and focus-return assertions.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- app/globals.css tests/inventory-locations.spec.ts tests/staff-management-ui.spec.ts
git commit -m "fix: unify private operations chrome"
```

### Task 4: Mobile navigation containment

**Files:**
- Modify: `app/globals.css` mobile rules near 777, 1078, and 1247
- Modify: `tests/partner-dashboard.spec.ts`
- Modify: `tests/prearrival-shipments.spec.ts`
- Modify: `tests/inventory-locations.spec.ts`
- Modify: `tests/staff-management-ui.spec.ts`

- [ ] **Step 1: Add one named browser assertion to each affected spec**

Add these exact tests:

- `partner dashboard mobile navigation uses two visible columns` in `tests/partner-dashboard.spec.ts`
- `pre-arrival mobile navigation uses two visible columns` in `tests/prearrival-shipments.spec.ts`
- `inventory mobile navigation uses two visible columns` in `tests/inventory-locations.spec.ts`
- `staff mobile navigation uses two visible columns` in `tests/staff-management-ui.spec.ts`, after calling `mockAdminSession` and `mockStaffApi`

Each test opens its route and loops through `[390, 701, 768, 880, 1040, 1440]`. At every width, assert no document-level or navigation-level horizontal overflow. At 390px, additionally assert that the navigation is a two-column grid. Use the route-specific selector shown below; the Dashboard example is:

```ts
const navLayout = await page.locator(".partner-dashboard-nav").evaluate((element) => {
  const style = getComputedStyle(element);
  return {
    display: style.display,
    columns: style.gridTemplateColumns.split(" ").length,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  };
});
expect(navLayout.display).toBe("grid");
expect(navLayout.columns).toBe(2);
expect(navLayout.scrollWidth).toBeLessThanOrEqual(navLayout.clientWidth);
```

Repeat with `.prearrival-nav`, `.inventory-location-nav`, and `.staff-operations-sidebar nav`. Warehouse already uses `.inbound-nav` as the working reference and should remain a two-column grid.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx.cmd playwright test tests/partner-dashboard.spec.ts tests/prearrival-shipments.spec.ts tests/inventory-locations.spec.ts tests/staff-management-ui.spec.ts --grep "mobile navigation"
```

Expected: Dashboard, Pre-arrival, Inventory, and Staff fail because their navigation uses a scrolling flex row.

- [ ] **Step 3: Implement one mobile navigation rule family**

Within `@media (max-width: 700px)`, replace the four flex-scroller rules with:

```css
.partner-dashboard-nav,
.prearrival-nav,
.inventory-location-nav,
.staff-operations-sidebar nav {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  overflow: visible;
  padding-top: 8px;
}

.partner-dashboard-nav a,
.prearrival-nav a,
.inventory-location-nav a,
.staff-operations-sidebar nav a {
  display: flex;
  min-width: 0;
  min-height: 40px;
  height: auto;
  align-items: center;
  justify-content: flex-start;
  padding: 7px 9px;
  line-height: 1.25;
  white-space: normal;
}
```

Keep each component's existing active border and color rules. Keep section-label elements hidden on mobile.

- [ ] **Step 4: Verify GREEN at the breakpoint matrix**

Run the same focused navigation command. Expected: all four named tests pass at 390, 701, 768, 880, 1040, and 1440px; the 390px navigation is a two-column grid and no tested width has page-level or navigation-level horizontal overflow.

- [ ] **Step 5: Commit Task 4**

```powershell
git add -- app/globals.css tests/partner-dashboard.spec.ts tests/prearrival-shipments.spec.ts tests/inventory-locations.spec.ts tests/staff-management-ui.spec.ts
git commit -m "fix: expose all mobile operations navigation"
```

### Task 5: Full local QA and closeout

**Files:**
- Modify: `docs/qa/2026-09-04-production-full-chain-machine-qa.md`

- [ ] **Step 1: Run focused P1F tests**

```powershell
npm.cmd test -- tests/warehouse-scope-presentation.test.ts
npx.cmd playwright test tests/warehouse-label-print.spec.ts tests/partner-dashboard.spec.ts tests/prearrival-shipments.spec.ts tests/inventory-locations.spec.ts tests/staff-management-ui.spec.ts
```

Expected: all focused unit and browser checks pass.

- [ ] **Step 2: Run the complete regression suite**

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Expected: full Vitest suite, TypeScript, and production build pass with no whitespace errors.

- [ ] **Step 3: Perform responsive browser review**

Run the local application and inspect Dashboard, Pre-arrival, Warehouse, Inventory, and Staff at 390, 701, 768, 880, 1040, and desktop widths. Record:

- public chrome visibility before authentication
- private shell visibility after authentication
- all navigation destinations visible
- print-job card readable
- correct full, single, and multiple source-scope wording
- empty, loading, error, and authenticated states unchanged outside P1F scope

- [ ] **Step 4: Append local QA evidence**

Add a `P1F local hotfix verification` section to `docs/qa/2026-09-04-production-full-chain-machine-qa.md` containing exact test totals and viewport results. Do not describe Production as updated.

- [ ] **Step 5: Commit QA closeout**

```powershell
git add -- docs/qa/2026-09-04-production-full-chain-machine-qa.md
git commit -m "test: record P1F operations UX QA"
```

- [ ] **Step 6: Verify final branch scope**

```powershell
git status --short
git log --oneline 64e1c6f..HEAD
git diff --stat 64e1c6f..HEAD
```

Expected: only the approved P1F spec, plan, presentation helper, focused components, CSS, tests, and QA report are included. `AGENTS.md` and `CLAUDE.md` remain untracked and untouched.

## Production boundary

Stop after local QA. Do not push the branch, create a Vercel deployment, change Supabase, or write any Production business record without a separate explicit authorisation.
