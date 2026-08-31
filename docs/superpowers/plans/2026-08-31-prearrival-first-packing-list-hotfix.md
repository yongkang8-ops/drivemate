# Pre-arrival First Packing List P0 Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an existing Shipment with no Packing List actionable in Pre-arrival, keep Warehouse explicitly locked until a Packing List is confirmed, and unlock the existing label and receiving workflow immediately after confirmation.

**Architecture:** Add an explicit Packing List readiness state to the shipment read model instead of treating a missing confirmed revision as a missing Shipment. The Pre-arrival workspace will create the first immutable revision from a nested pallet, carton and SKU editor. Warehouse will consume the readiness state and render a blocking action with a route back to Pre-arrival until a confirmed revision exists. The strict confirmed Packing List requirement in warehouse label, receipt and putaway APIs remains unchanged.

**Tech Stack:** Next.js 16.3 App Router, React 19 Client Components, TypeScript 7, Supabase repository, in-memory repository, Vitest, Playwright.

---

## Task report

### Observed production condition

- `shipments`: one existing Shipment shell.
- `shipment_packing_list_versions`: zero rows.
- `/prearrival`: selects the Shipment, then reports `Pre-arrival shipment was not found.`
- `/warehouse`: selects the same Shipment, then reports `Pre-arrival shipment was not found.`

### Root cause

1. `listPrearrivalShipments()` returns every Shipment regardless of Packing List readiness.
2. Both clients automatically select the first Shipment.
3. `getPrearrivalShipment()` and the warehouse scope resolver require a confirmed Packing List.
4. The UI maps the missing confirmed revision to a missing Shipment and renders a non-actionable loading/error strip.

### P0 scope

- Existing Shipment shell remains the source record.
- Pre-arrival shows `not_started`, `draft` or `confirmed` Packing List readiness.
- `not_started` and `draft` are actionable and can create a new immutable revision.
- The first working copy supports multiple pallets, cartons and SKU lines.
- Warehouse shows a professional locked state with a direct action to Pre-arrival.
- Warehouse label, receipt and putaway operations remain unavailable until a confirmed revision exists.
- Confirmation immediately exposes the existing label preparation workflow.

### Explicit exclusions

- No Production Supabase data writes.
- No schema migration.
- No real Shipment, Packing List, inventory, print job, receipt or putaway record.
- No Excel import or China-side data integration in this Hotfix.
- No GitHub push, Vercel Preview or Production promotion without a separate bounded authorization.
- No unrelated navigation, dashboard, dense-table or public-shell redesign.

### Acceptance criteria

1. A Shipment with no revision returns HTTP 200 from its Pre-arrival detail read and exposes empty content plus `not_started` readiness.
2. Pre-arrival renders an actionable `Packing List setup required` state, not a not-found error.
3. An operator can add and remove pallets, cartons and SKU lines, then confirm Packing List v1.
4. Validation still rejects blank or unknown SKU, duplicate pallet/carton/SKU identifiers and invalid quantities.
5. Warehouse renders `Packing List confirmation required` and a link to `/prearrival` for an unready Shipment.
6. Warehouse does not call the label scope API for an unready Shipment.
7. After Packing List v1 is confirmed, Warehouse loads the existing pallet selection and label queue.
8. Existing confirmed-revision, label print, receipt and putaway tests remain green.

---

### Task 1: Add a Packing List readiness contract

**Files:**
- Modify: `lib/prearrivalShipment.ts`
- Modify: `lib/repository.ts`
- Modify: `lib/memoryRepository.ts`
- Modify: `lib/supabaseRepository.ts`
- Test: `tests/prearrival-shipment.test.ts`

- [ ] **Step 1: Write the failing repository tests**

Add tests that reset the in-memory repository without a Packing List and assert:

```ts
const repository = new MemoryRepository();
await repository.resetForTests({ packingList: "empty" });

await expect(repository.listPrearrivalShipments()).resolves.toMatchObject({
  shipments: [{
    shipmentId: "shipment-test-1",
    packingListStatus: "not_started",
    latestPackingListVersion: undefined,
    confirmedPackingListVersion: undefined,
  }],
});

await expect(repository.getPrearrivalShipment("shipment-test-1")).resolves.toMatchObject({
  ok: true,
  shipment: {
    shipmentId: "shipment-test-1",
    packingListStatus: "not_started",
    pallets: [],
    cartons: [],
    lines: [],
    revisions: [],
  },
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/prearrival-shipment.test.ts`

Expected: FAIL because `resetForTests` has no empty fixture option and the readiness fields do not exist.

- [ ] **Step 3: Implement the minimal readiness contract**

Add:

```ts
export type PackingListReadiness = "not_started" | "draft" | "confirmed";

export function summarizePackingListReadiness(
  revisions: readonly PackingListRevision[],
): {
  packingListStatus: PackingListReadiness;
  latestPackingListVersion?: number;
  confirmedPackingListVersion?: number;
}
```

`confirmed` wins whenever a confirmed revision exists. Otherwise, any draft produces `draft`; no revisions produces `not_started`.

Update both repositories so an existing Shipment without a confirmed revision is returned as an empty Pre-arrival workspace, while `getWarehouseExpectedReceipt()` remains strict.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/prearrival-shipment.test.ts`

Expected: PASS.

### Task 2: Add a test-only empty Packing List fixture

**Files:**
- Modify: `lib/repository.ts`
- Modify: `lib/memoryRepository.ts`
- Modify: `lib/supabaseRepository.ts`
- Modify: `app/api/test/reset/route.ts`
- Test: `tests/prearrival-shipments.spec.ts`

- [ ] **Step 1: Write the failing API and browser setup**

Use:

```ts
await request.post("/api/test/reset?packingList=empty");
```

The route must pass `{ packingList: "empty" }` only to the in-memory test reset. The existing test-reset production guard remains unchanged.

- [ ] **Step 2: Run the focused browser test and verify RED**

Run: `npx playwright test tests/prearrival-shipments.spec.ts --project=edge`

Expected: FAIL because reset cannot currently create the production-reproduction fixture.

- [ ] **Step 3: Implement the minimal test fixture**

Add:

```ts
export type RepositoryTestResetOptions = {
  packingList?: "confirmed" | "empty";
};
```

The default remains `confirmed`, preserving every existing test. The Supabase implementation continues to reject runtime reset.

- [ ] **Step 4: Re-run the focused test setup**

Expected: the test reaches the unready Pre-arrival UI and fails only on missing P0 UI behavior.

### Task 3: Implement the actionable Pre-arrival initial state

**Files:**
- Modify: `components/PrearrivalShipmentPanel.tsx`
- Modify: `app/globals.css`
- Test: `tests/prearrival-shipments.spec.ts`

- [ ] **Step 1: Write the failing first-Packing-List browser test**

The test must verify:

```ts
await expect(page.getByRole("heading", { name: "Packing List setup required" })).toBeVisible();
await page.getByRole("button", { name: "Create first Packing List" }).click();
await page.getByLabel("Pallet number").fill("P001");
await page.getByLabel("Carton number").fill("C001");
await page.getByLabel("SKU", { exact: true }).fill("DM-GWM-OF-001");
await page.getByLabel("Expected quantity", { exact: true }).fill("12");
await page.getByRole("button", { name: "Confirm Packing List" }).click();
await expect(page.getByText("Packing List v1 confirmed")).toBeVisible();
```

Also test `Add pallet`, `Add carton`, `Add SKU line` and their paired removal controls before confirmation.

- [ ] **Step 2: Run the browser test and verify RED**

Expected: FAIL because the existing UI returns the generic not-found strip.

- [ ] **Step 3: Implement the minimal nested editor and state presentation**

- Preserve the existing page shell, navigation, brand tokens and routes.
- Use the existing teal as the only accent.
- Use an amber contextual status for the setup-required state.
- Use labels above inputs, visible helper/error copy and desktop one-line CTAs.
- Do not show `Prepare AU labels` before confirmation.
- Keep the existing create-then-confirm immutable write path.
- Never update or delete an existing revision.

- [ ] **Step 4: Re-run the focused browser test and verify GREEN**

Run: `npx playwright test tests/prearrival-shipments.spec.ts --project=edge`

Expected: PASS.

### Task 4: Implement the Warehouse lock and unlock chain

**Files:**
- Modify: `components/PartnerInboundWorkspace.tsx`
- Modify: `app/globals.css`
- Test: `tests/warehouse-inbound-workspace.spec.ts`

- [ ] **Step 1: Write the failing Warehouse lock test**

Verify that an empty Packing List fixture displays:

```ts
await expect(page.getByRole("heading", { name: "Packing List confirmation required" })).toBeVisible();
await expect(page.getByRole("link", { name: "Open Pre-arrival" })).toHaveAttribute("href", "/prearrival");
```

Verify there is no `Print labels` button and no label scope 404 message.

- [ ] **Step 2: Run the focused test and verify RED**

Expected: FAIL because Warehouse currently renders the generic inbound loading/error strip.

- [ ] **Step 3: Implement the minimal locked state**

- Choose the first confirmed Shipment when one exists.
- If the selected Shipment is unready, do not call `/api/warehouse/labels`.
- Render the internal Warehouse shell, Shipment reference, readiness reason and `Open Pre-arrival` action.
- Keep label, receipt and putaway views absent while locked.
- After confirmation and navigation back to Warehouse, the existing label scope loads unchanged.

- [ ] **Step 4: Run lock and unlock tests and verify GREEN**

Run: `npx playwright test tests/prearrival-shipments.spec.ts tests/warehouse-inbound-workspace.spec.ts --project=edge`

Expected: PASS.

### Task 5: Regression, visual QA and local acceptance

**Files:**
- Create: `docs/qa/2026-08-31-prearrival-first-packing-list-hotfix-local-qa.md`
- Create: `docs/qa/evidence/2026-08-31-prearrival-first-packing-list-hotfix/`

- [ ] **Step 1: Run automated regression**

Run:

```powershell
npm test
npm run typecheck
npm run build
npx playwright test tests/prearrival-shipments.spec.ts tests/warehouse-inbound-workspace.spec.ts tests/warehouse-label-print.spec.ts tests/warehouse-prearrival-receiving.test.ts --project=edge
```

Expected: all commands pass with no new warning attributed to this Hotfix.

- [ ] **Step 2: Run local browser acceptance**

Capture desktop and narrow viewport evidence for:

1. Pre-arrival setup required.
2. Nested initial Packing List editor.
3. Packing List v1 confirmed.
4. Warehouse locked before confirmation.
5. Warehouse label queue unlocked after confirmation.

- [ ] **Step 3: Write the QA report**

Record the command, result, screenshot path, observed interaction and any residual limitation. State clearly that all records are in-memory local test data.

- [ ] **Step 4: Review scope before external actions**

Run:

```powershell
git status --short
git diff --check
git diff --stat
```

Confirm that only the files listed in this plan changed. Do not use `git add .`.

### Task 6: Preview gate

- [ ] **Step 1: Present the local QA result and exact external-write scope**

Before any push or Preview deployment, state:

- Target: GitHub branch and Vercel project.
- Change: exact commit and changed files.
- Impact: Preview only; no Production domain promotion and no Production data writes.
- Rollback: delete/ignore Preview and revert the Hotfix commit.

- [ ] **Step 2: Obtain explicit authorization**

Do not push or create Vercel Preview until the user authorizes the bounded external write.
