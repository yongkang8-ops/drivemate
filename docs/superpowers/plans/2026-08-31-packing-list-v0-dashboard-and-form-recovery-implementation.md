# Packing List v0 Dashboard And Form Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep unconfirmed Packing Lists visible without advancing them to label work, and make first-Packing-List validation specific, local-first and recoverable.

**Architecture:** Add an explicit `packingListConfirmed` fact to the dashboard source and derive a dedicated `packing_list_required` stage before all label, receipt and putaway logic. Extract draft validation and server-error mapping into a pure helper, then wire it into `PrearrivalShipmentPanel` with accessible field errors and clean reset behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 7, Zod 4, Vitest 4, Playwright 1.62, Vercel Production and Supabase repository.

---

## File map

- Modify `lib/warehouseDashboard.ts`: confirmed-state projection, totals, attention links and action targets.
- Modify `components/PartnerDashboard.tsx`: render source-required and blocked states.
- Modify `app/globals.css`: source-required and validation styles.
- Modify `tests/warehouse-dashboard.test.ts` and `tests/partner-dashboard.spec.ts`: v0 regression.
- Create `lib/prearrivalDraftValidation.ts` and `tests/prearrival-draft-validation.test.ts`: pure validation contract.
- Modify `app/api/prearrival/shipments/[shipmentId]/revisions/route.ts` and create `tests/prearrival-revision-validation-route.test.ts`: structured API errors.
- Modify `components/PrearrivalShipmentPanel.tsx`, `components/PartnerInboundWorkspace.tsx` and `tests/prearrival-shipments.spec.ts`: accessible recovery and real-operation copy.

## Task 1: Dashboard domain projection

**Files:**
- Modify: `tests/warehouse-dashboard.test.ts`
- Modify: `lib/warehouseDashboard.ts`

- [ ] **Step 1: Write the failing v0 projection test**

Add `packingListConfirmed: true` to both existing fixtures. Add a third fixture:

```ts
{
  shipmentId: "shipment-test-3",
  shipmentReference: "BNE-TEST-003",
  packingListConfirmed: false,
  packingListVersion: 0,
  palletCount: 0,
  cartonCount: 0,
  expectedQuantity: 0,
  labelConfirmed: false,
  receiptQuantity: 0,
  stagingQuantity: 0,
  locatedQuantity: 0,
  lastEventAt: "2026-08-29T00:12:00.000Z",
},
```

Add this test:

```ts
it("keeps an unconfirmed packing list visible without advancing it to label work", () => {
  expect(dashboard.pipeline).toMatchObject({
    activeShipments: 2,
    printConfirmationRequired: 1,
  });
  expect(dashboard.shipments).toEqual(expect.arrayContaining([
    expect.objectContaining({
      shipmentReference: "BNE-TEST-003",
      stage: "packing_list_required",
      labelStatus: "not_ready",
      receiptStatus: "blocked",
      putawayStatus: "blocked",
      nextAction: "Open pre-arrival",
      nextActionHref: "/prearrival?shipmentId=shipment-test-3",
    }),
  ]));
  expect(dashboard.attention).toEqual(expect.arrayContaining([
    expect.objectContaining({
      type: "packing_list_required",
      shipmentId: "shipment-test-3",
      href: "/prearrival?shipmentId=shipment-test-3",
    }),
  ]));
  expect(dashboard.attention).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "print_gate", shipmentId: "shipment-test-3" }),
  ]));
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm test -- tests/warehouse-dashboard.test.ts
```

Expected: FAIL because the explicit source-required state and corrected totals do not exist.

- [ ] **Step 3: Implement the explicit state**

Add to `PartnerDashboardShipmentSource`:

```ts
packingListConfirmed: boolean;
```

Extend `PartnerDashboardAttention`:

```ts
type: "receipt_difference" | "print_gate" | "staging_pending" | "packing_list_required";
href: string;
```

Start `worklistStatus()` with:

```ts
if (!source.packingListConfirmed) {
  return {
    stage: "packing_list_required",
    stageLabel: "Packing List required",
    labelStatus: "not_ready",
    receiptStatus: "blocked",
    putawayStatus: "blocked",
    nextAction: "Open pre-arrival",
    nextActionHref: `/prearrival?shipmentId=${encodeURIComponent(source.shipmentId)}`,
  } as const;
}
```

Add this action target to every existing status branch:

```ts
nextActionHref: `/warehouse?shipmentId=${encodeURIComponent(source.shipmentId)}`,
```

Create source-required attention before `print_gate`:

```ts
...shipments
  .filter((shipment) => !shipment.packingListConfirmed)
  .map((shipment) => ({
    id: `packing-list-${shipment.shipmentId}`,
    type: "packing_list_required" as const,
    shipmentId: shipment.shipmentId,
    reference: shipment.shipmentReference,
    title: "Packing List confirmation required",
    detail: "Create and confirm the first Packing List before label preparation.",
    href: `/prearrival?shipmentId=${encodeURIComponent(shipment.shipmentId)}`,
    createdAt: shipment.lastEventAt,
  })),
```

Use `href: "/warehouse"` for receipt differences. Use the Shipment-specific URL below for `print_gate` and `staging_pending`:

```ts
href: `/warehouse?shipmentId=${encodeURIComponent(shipment.shipmentId)}`,
```

Restrict `print_gate` to:

```ts
.filter((shipment) => shipment.packingListConfirmed && shipment.labelStatus === "pending")
```

Calculate metrics from:

```ts
const confirmedShipments = shipments.filter((shipment) => shipment.packingListConfirmed);

activeShipments: confirmedShipments.length,
printConfirmationRequired: confirmedShipments.filter(
  (shipment) => shipment.labelStatus === "pending",
).length,
```

In `loadPartnerDashboardSource()`, add:

```ts
packingListConfirmed: Boolean(confirmedRevision),
```

- [ ] **Step 4: Verify GREEN**

```powershell
npm test -- tests/warehouse-dashboard.test.ts
```

Expected: all dashboard projection tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- 'lib/warehouseDashboard.ts' 'tests/warehouse-dashboard.test.ts'
git commit -m "fix: keep unconfirmed packing lists before label stage"
```

## Task 2: Dashboard rendered state

**Files:**
- Modify: `components/PartnerDashboard.tsx`
- Modify: `app/globals.css`
- Modify: `tests/partner-dashboard.spec.ts`

- [ ] **Step 1: Write the failing browser regression**

Append:

```ts
test("an unconfirmed Packing List stays visible but blocked before label preparation", async ({
  page,
  request,
}) => {
  await request.post("/api/test/reset?packingList=empty");
  await page.goto("/partner");

  await expect(page.getByText("Packing List required", { exact: true })).toBeVisible();
  await expect(page.getByText("Packing List not confirmed", { exact: true })).toBeVisible();
  await expect(page.getByText("Labels blocked", { exact: true })).toBeVisible();
  await expect(page.getByText("Receipt blocked", { exact: true })).toBeVisible();
  await expect(page.getByText("Putaway blocked", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open pre-arrival", exact: true })).toHaveAttribute(
    "href",
    "/prearrival?shipmentId=shipment-test-1",
  );
  await expect(page.getByText("Prepare labels", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/ready for label preparation/i)).toHaveCount(0);
  await expect(page.locator(".partner-metric-grid article").nth(0).getByText("0", { exact: true })).toBeVisible();
  await expect(page.locator(".partner-metric-grid article").nth(1).getByText("0", { exact: true })).toBeVisible();
});
```

- [ ] **Step 2: Verify RED**

```powershell
npx playwright test tests/partner-dashboard.spec.ts
```

Expected: the new v0 test FAILS.

- [ ] **Step 3: Render blocked statuses and exact links**

Replace the Shipment extension in `PartnerDashboardData` with:

```ts
shipments: Array<PartnerDashboardShipmentSource & {
  stage: string;
  stageLabel: string;
  labelStatus: "printed" | "pending" | "not_ready";
  receiptStatus: "confirmed" | "waiting" | "blocked";
  putawayStatus: "complete" | "pending" | "waiting" | "blocked";
  nextAction: string;
  nextActionHref: string;
}>;
```

Extend `StatusPill` with the same `not_ready` and `blocked` status union. Render the descriptor as:

```tsx
<span>
  {shipment.packingListConfirmed
    ? `Packing List v${shipment.packingListVersion}`
    : "Packing List not confirmed"}
  {` · ${shipment.palletCount} pallets · ${shipment.cartonCount} cartons`}
</span>
```

Use these exact labels:

```tsx
<StatusPill
  label={shipment.labelStatus === "printed" ? "Labels printed" : shipment.labelStatus === "pending" ? "Labels pending" : "Labels blocked"}
  status={shipment.labelStatus}
/>
<StatusPill
  label={shipment.receiptStatus === "confirmed" ? "Receipt confirmed" : shipment.receiptStatus === "waiting" ? "Receipt waiting" : "Receipt blocked"}
  status={shipment.receiptStatus}
/>
<StatusPill
  label={shipment.putawayStatus === "complete" ? "Putaway complete" : shipment.putawayStatus === "pending" ? "Putaway pending" : shipment.putawayStatus === "waiting" ? "Putaway waiting" : "Putaway blocked"}
  status={shipment.putawayStatus}
/>
```

Use `shipment.nextActionHref` for the row action and `item.href` for Attention links.

Add:

```css
.partner-stage-packing_list_required { background: #fff3dc; color: #835817; }
.partner-status-not_ready, .partner-status-blocked { background: #f1f4f3; color: #697f83; }
.partner-attention-packing_list_required { border-left-color: #bd7b18; background: #fff8eb; }
```

- [ ] **Step 4: Verify unit and browser GREEN**

```powershell
npm test -- tests/warehouse-dashboard.test.ts
npx playwright test tests/partner-dashboard.spec.ts
```

Expected: both commands PASS, including confirmed receipt/staging behavior.

- [ ] **Step 5: Commit**

```powershell
git add -- 'components/PartnerDashboard.tsx' 'app/globals.css' 'tests/partner-dashboard.spec.ts'
git commit -m "fix: render unconfirmed inbound work accurately"
```

## Task 3: Pure first-Packing-List draft validation

**Files:**
- Create: `lib/prearrivalDraftValidation.ts`
- Create: `tests/prearrival-draft-validation.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create:

```ts
import { describe, expect, it } from "vitest";
import {
  mapPackingListServerErrors,
  packingListFieldKey,
  validatePackingListDraft,
} from "../lib/prearrivalDraftValidation";

describe("pre-arrival Packing List draft validation", () => {
  const blankDraft = {
    shipmentId: "shipment-test-1",
    pallets: [{
      sourcePalletNumber: "",
      cartons: [{
        sourceCartonNumber: "",
        lines: [{ sku: "", expectedQuantity: 0 }],
      }],
    }],
  };

  it("returns stable field keys for every invalid first-packing-list value", () => {
    const result = validatePackingListDraft(blankDraft, ["DM-GWM-OF-001"]);
    expect(result.ok).toBe(false);
    expect(result.fieldErrors).toEqual({
      "pallets.0.sourcePalletNumber": "Enter the pallet number.",
      "pallets.0.cartons.0.sourceCartonNumber": "Enter the carton number.",
      "pallets.0.cartons.0.lines.0.sku": "Enter a recognised SKU.",
      "pallets.0.cartons.0.lines.0.expectedQuantity": "Enter a positive whole quantity.",
    });
    expect(result.firstField).toBe("pallets.0.sourcePalletNumber");
  });

  it("rejects an SKU outside the product master", () => {
    const result = validatePackingListDraft({
      shipmentId: "shipment-test-1",
      pallets: [{
        sourcePalletNumber: "P001",
        cartons: [{
          sourceCartonNumber: "C001",
          lines: [{ sku: "UNKNOWN-SKU", expectedQuantity: 1 }],
        }],
      }],
    }, ["DM-GWM-OF-001"]);
    expect(result.fieldErrors["pallets.0.cartons.0.lines.0.sku"]).toBe(
      "Select an SKU from the product master.",
    );
  });

  it("maps structured server paths to the same field keys", () => {
    expect(mapPackingListServerErrors({
      fieldErrors: [{
        path: ["pallets", 0, "cartons", 0, "lines", 0, "sku"],
        message: "SKU is invalid.",
      }],
    })).toEqual({
      "pallets.0.cartons.0.lines.0.sku": "SKU is invalid.",
    });
    expect(packingListFieldKey(["pallets", 0, "sourcePalletNumber"])).toBe(
      "pallets.0.sourcePalletNumber",
    );
  });
});
```

- [ ] **Step 2: Verify RED**

```powershell
npm test -- tests/prearrival-draft-validation.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the helper**

Create `lib/prearrivalDraftValidation.ts`:

```ts
import type { PackingListRevisionInput } from "./prearrivalShipment";

export type PackingListFieldErrors = Record<string, string>;
export type PackingListServerError = {
  fieldErrors?: Array<{ path: Array<string | number>; message: string }>;
};

export function packingListFieldKey(path: Array<string | number>) {
  return path.map(String).join(".");
}

export function mapPackingListServerErrors(error?: PackingListServerError) {
  return Object.fromEntries(
    (error?.fieldErrors ?? []).map((item) => [packingListFieldKey(item.path), item.message]),
  );
}

export function validatePackingListDraft(
  payload: PackingListRevisionInput,
  knownSkus: readonly string[],
) {
  const fieldErrors: PackingListFieldErrors = {};
  const approvedSkus = new Set(knownSkus.map((sku) => sku.trim().toUpperCase()));

  payload.pallets.forEach((pallet, palletIndex) => {
    const palletKey = packingListFieldKey(["pallets", palletIndex, "sourcePalletNumber"]);
    if (!pallet.sourcePalletNumber.trim()) fieldErrors[palletKey] = "Enter the pallet number.";

    pallet.cartons.forEach((carton, cartonIndex) => {
      const cartonPath = ["pallets", palletIndex, "cartons", cartonIndex] as const;
      const cartonKey = packingListFieldKey([...cartonPath, "sourceCartonNumber"]);
      if (!carton.sourceCartonNumber.trim()) fieldErrors[cartonKey] = "Enter the carton number.";

      carton.lines.forEach((line, lineIndex) => {
        const linePath = [...cartonPath, "lines", lineIndex] as const;
        const skuKey = packingListFieldKey([...linePath, "sku"]);
        const quantityKey = packingListFieldKey([...linePath, "expectedQuantity"]);
        const sku = line.sku.trim().toUpperCase();
        if (!sku) fieldErrors[skuKey] = "Enter a recognised SKU.";
        else if (!approvedSkus.has(sku)) fieldErrors[skuKey] = "Select an SKU from the product master.";
        if (!Number.isInteger(line.expectedQuantity) || line.expectedQuantity <= 0) {
          fieldErrors[quantityKey] = "Enter a positive whole quantity.";
        }
      });
    });
  });

  const firstField = Object.keys(fieldErrors)[0];
  return {
    ok: firstField === undefined,
    fieldErrors,
    firstField,
    summary: firstField === undefined
      ? undefined
      : "Complete the highlighted Packing List fields before confirming.",
  };
}
```

- [ ] **Step 4: Verify GREEN and commit**

```powershell
npm test -- tests/prearrival-draft-validation.test.ts
git add -- 'lib/prearrivalDraftValidation.ts' 'tests/prearrival-draft-validation.test.ts'
git commit -m "feat: validate pre-arrival packing list drafts"
```

Expected: helper tests PASS before commit.

## Task 4: Structured API validation errors

**Files:**
- Modify: `app/api/prearrival/shipments/[shipmentId]/revisions/route.ts`
- Create: `tests/prearrival-revision-validation-route.test.ts`

- [ ] **Step 1: Write the failing route contract test**

Create:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/requestSecurity", () => ({ mutationRequestAllowed: () => true }));
vi.mock("../lib/serverAuth", () => ({
  getRequestContext: async () => ({ role: "partner", userId: "partner-user", authenticated: true }),
}));
vi.mock("../lib/repository", () => ({ getRepository: vi.fn() }));

import { POST } from "../app/api/prearrival/shipments/[shipmentId]/revisions/route";

describe("Packing List revision validation response", () => {
  it("returns structured issue paths without calling the repository", async () => {
    const response = await POST(new Request(
      "https://drivemateparts.com.au/api/prearrival/shipments/shipment-test-1/revisions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shipmentId: "shipment-test-1",
          pallets: [{
            sourcePalletNumber: "",
            cartons: [{
              sourceCartonNumber: "",
              lines: [{ sku: "", expectedQuantity: 0 }],
            }],
          }],
        }),
      },
    ), { params: Promise.resolve({ shipmentId: "shipment-test-1" }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        fieldErrors: expect.arrayContaining([
          expect.objectContaining({ path: ["pallets", 0, "sourcePalletNumber"] }),
          expect.objectContaining({
            path: ["pallets", 0, "cartons", 0, "lines", 0, "expectedQuantity"],
          }),
        ]),
      },
    });
  });
});
```

- [ ] **Step 2: Verify RED**

```powershell
npm test -- tests/prearrival-revision-validation-route.test.ts
```

Expected: FAIL because the route returns `flatten()` output.

- [ ] **Step 3: Return structured Zod issue paths**

Replace the invalid-schema response:

```ts
if (!parsed.success) {
  return NextResponse.json({
    ok: false,
    error: {
      fieldErrors: parsed.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    },
  }, { status: 400 });
}
```

- [ ] **Step 4: Verify GREEN and commit**

```powershell
npm test -- tests/prearrival-revision-validation-route.test.ts tests/warehouse-permission-boundaries.test.ts
git add -- 'app/api/prearrival/shipments/[shipmentId]/revisions/route.ts' 'tests/prearrival-revision-validation-route.test.ts'
git commit -m "fix: return structured packing list validation errors"
```

Expected: both route and permission tests PASS.

## Task 5: Accessible form recovery and real-operation copy

**Files:**
- Modify: `components/PrearrivalShipmentPanel.tsx`
- Modify: `components/PartnerInboundWorkspace.tsx`
- Modify: `app/globals.css`
- Modify: `tests/prearrival-shipments.spec.ts`

- [ ] **Step 1: Add failing browser coverage**

Append:

```ts
test("first Packing List validation stays local and cancel clears errors", async ({ page, request }) => {
  await request.post("/api/test/reset?packingList=empty");
  let revisionPostCount = 0;
  page.on("request", (requestEvent) => {
    if (requestEvent.method() === "POST" && /\/api\/prearrival\/shipments\/[^/]+\/revisions$/.test(requestEvent.url())) {
      revisionPostCount += 1;
    }
  });

  await page.goto("/prearrival");
  await page.getByRole("button", { name: "Create first Packing List" }).click();
  await page.getByRole("button", { name: "Confirm Packing List" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "Complete the highlighted Packing List fields before confirming.",
  );
  await expect(page.getByText("Enter the pallet number.", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter the carton number.", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter a recognised SKU.", { exact: true })).toBeVisible();
  expect(revisionPostCount).toBe(0);

  await page.getByLabel("Pallet number").fill("P001");
  await expect(page.getByText("Enter the pallet number.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel working copy" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Packing-list revision could not be created.")).toHaveCount(0);
});

test("operations copy does not describe saved records as sample data", async ({ page }) => {
  await page.goto("/prearrival");
  await expect(page.getByText("Sample data only", { exact: true })).toHaveCount(0);
  await page.goto("/warehouse");
  await expect(page.getByText("Sample data only", { exact: true })).toHaveCount(0);
});
```

- [ ] **Step 2: Verify RED**

```powershell
npx playwright test tests/prearrival-shipments.spec.ts
```

Expected: the new validation and copy tests FAIL.

- [ ] **Step 3: Add state, refs and reset helpers**

Import:

```ts
import { useEffect, useMemo, useRef, useState } from "react";
import {
  mapPackingListServerErrors,
  packingListFieldKey,
  type PackingListFieldErrors,
  type PackingListServerError,
  validatePackingListDraft,
} from "../lib/prearrivalDraftValidation";
```

Extend the failed response branch:

```ts
type RevisionResponse =
  | { ok: true; revision: PackingListRevision }
  | { ok: false; message?: string; error?: PackingListServerError };
```

Add state and refs:

```ts
const [fieldErrors, setFieldErrors] = useState<PackingListFieldErrors>({});
const [errorSummary, setErrorSummary] = useState<string | null>(null);
const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});
```

Add:

```ts
function clearDraftErrors() {
  setFieldErrors({});
  setErrorSummary(null);
}

function focusDraftField(field?: string) {
  if (!field) return;
  requestAnimationFrame(() => fieldRefs.current[field]?.focus());
}

function clearFieldError(field: string) {
  setFieldErrors((current) => {
    if (!current[field]) return current;
    const next = { ...current };
    delete next[field];
    if (Object.keys(next).length === 0) setErrorSummary(null);
    return next;
  });
}

function cancelWorkingCopy() {
  setDraftPayload(null);
  clearDraftErrors();
  setMessage("Create and confirm the first Packing List before Australian warehouse work begins.");
}
```

Call `clearDraftErrors()` after a successful Shipment load and at the start of `startRevision()`.

- [ ] **Step 4: Gate POST and map server errors**

Start `confirmRevision()` with:

```ts
const validation = validatePackingListDraft(draftPayload, Object.keys(shipment.productBarcodes));
if (!validation.ok) {
  setFieldErrors(validation.fieldErrors);
  setErrorSummary(validation.summary ?? "Review the highlighted Packing List fields and try again.");
  focusDraftField(validation.firstField);
  return;
}
clearDraftErrors();
```

Replace the failed create response branch with:

```ts
if (!createResponse.ok || !created.ok) {
  const serverErrors = !created.ok ? mapPackingListServerErrors(created.error) : {};
  if (Object.keys(serverErrors).length > 0) {
    const firstField = Object.keys(serverErrors)[0];
    setFieldErrors(serverErrors);
    setErrorSummary("Review the highlighted Packing List fields and try again.");
    focusDraftField(firstField);
  } else {
    setErrorSummary(
      (!created.ok && created.message) || "The Packing List could not be saved. Review the form and try again.",
    );
  }
  return;
}
```

- [ ] **Step 5: Wire accessible field errors**

Derive the four selected-field keys with:

```ts
const palletField = packingListFieldKey(["pallets", selection.palletIndex, "sourcePalletNumber"]);
const cartonField = packingListFieldKey([
  "pallets", selection.palletIndex, "cartons", selection.cartonIndex, "sourceCartonNumber",
]);
const skuField = (lineIndex: number) => packingListFieldKey([
  "pallets", selection.palletIndex, "cartons", selection.cartonIndex, "lines", lineIndex, "sku",
]);
const quantityField = (lineIndex: number) => packingListFieldKey([
  "pallets", selection.palletIndex, "cartons", selection.cartonIndex, "lines", lineIndex, "expectedQuantity",
]);
```

Apply this accessible input contract to each field using its derived key:

```tsx
{(() => {
  const field = packingListFieldKey(["pallets", selection.palletIndex, "sourcePalletNumber"]);
  const errorId = `${field.replaceAll(".", "-")}-error`;
  return <label>
    Pallet number
    <input
      aria-describedby={fieldErrors[field] ? errorId : undefined}
      aria-invalid={Boolean(fieldErrors[field])}
      ref={(node) => { fieldRefs.current[field] = node; }}
      value={selectedCarton.draftPallet.sourcePalletNumber}
      onChange={(event) => {
        updateSelectedCarton("pallet", event.target.value);
        clearFieldError(field);
      }}
    />
    {fieldErrors[field]
      ? <span className="prearrival-field-error" id={errorId}>{fieldErrors[field]}</span>
      : null}
  </label>;
})()}
```

Place the summary before the editor grid:

```tsx
{errorSummary
  ? <div className="prearrival-error-summary" role="alert">{errorSummary}</div>
  : null}
```

Use `cartonField`, `skuField(lineIndex)` and `quantityField(lineIndex)` in the same input contract, including `aria-invalid`, `aria-describedby`, ref registration, inline error span and `clearFieldError(field)` on change. Wire Cancel to:

```tsx
<button className="button button-secondary" type="button" onClick={cancelWorkingCopy} disabled={busy}>
  Cancel working copy
</button>
```

- [ ] **Step 6: Replace obsolete copy and add CSS**

Use this Pre-arrival sidebar note:

```tsx
<div className="prearrival-phase-note">
  <span>Inbound gate</span>
  <p>Label preparation remains locked until Packing List confirmation.</p>
</div>
```

Change `Phase 1 label position` to `Export label position`.

Use this Warehouse note:

```tsx
<div className="inbound-phase-note">
  <span>Warehouse control</span>
  <p>Receipt remains locked until product-label print confirmation.</p>
</div>
```

Add:

```css
.prearrival-error-summary { margin-top: 14px; padding: 11px 13px; border: 1px solid #d7a05c; border-radius: 6px; background: #fff7e9; color: #7a4b13; font-size: 13px; font-weight: 650; }
.prearrival-field-error { display: block; margin-top: 5px; color: #a13f35; font-size: 12px; font-weight: 650; }
.prearrival-editor input[aria-invalid="true"] { border-color: #bd6258; box-shadow: 0 0 0 2px rgb(189 98 88 / 12%); }
.prearrival-editor input[aria-invalid="true"]:focus { outline-color: #a8473e; }
```

- [ ] **Step 7: Verify GREEN and commit**

```powershell
npm test -- tests/prearrival-draft-validation.test.ts tests/prearrival-revision-validation-route.test.ts
npx playwright test tests/prearrival-shipments.spec.ts
git add -- 'components/PrearrivalShipmentPanel.tsx' 'components/PartnerInboundWorkspace.tsx' 'app/globals.css' 'tests/prearrival-shipments.spec.ts'
git commit -m "fix: make first packing list errors recoverable"
```

Expected: focused unit and browser tests PASS before commit.

## Task 6: Full regression, Production deployment and resumed acceptance

**Files:**
- Verify: repository and Production
- Update after verification: `D:/AI HUB/Codex agent/Australia car parts project/qa/production-machine-acceptance-20260831/README.md`

- [ ] **Step 1: Run full local verification**

```powershell
npm test
npm run typecheck
npm run build
npx playwright test tests/partner-dashboard.spec.ts tests/prearrival-shipments.spec.ts tests/warehouse-smoke.spec.ts tests/staff-role-acceptance.spec.ts
```

Expected: Vitest 0 failed, TypeScript exit 0, Next.js build exit 0, focused Playwright 0 failed.

- [ ] **Step 2: Verify exact Git scope**

```powershell
git status --short
git diff --check HEAD~4..HEAD
git log --oneline -8
git rev-list --left-right --count "HEAD...@{upstream}"
```

Expected: clean worktree, only approved P0 files changed, local branch ahead by the intended commits.

- [ ] **Step 3: Push the Hotfix branch**

Before this external write, report branch, commit range, impact and `git revert` rollback path. Run:

```powershell
git push origin hotfix/prearrival-first-packing-list-20260831
```

Expected: GitHub branch reaches local HEAD.

- [ ] **Step 4: Create a fresh Production Deployment**

Before this external write, report target, exact HEAD SHA, current Production rollback deployment and confirm no Supabase migration is included. Resolve and pass the SHA without a placeholder:

```powershell
$headSha = git rev-parse HEAD
npm exec --offline --yes --package=vercel@59.3.0 -- vercel deploy --prod --yes --project drivemate-parts --scope yongkang-lis-projects --meta "gitCommitSha=$headSha" --meta gitCommitRef=hotfix/prearrival-first-packing-list-20260831 --meta "gitCommitMessage=fix: align packing list source states"
```

Expected: `target=production`, `readyState=READY` and formal domain aliases.

- [ ] **Step 5: Verify Production health and observability**

```powershell
npm exec --offline --yes --package=vercel@59.3.0 -- vercel curl 'https://drivemateparts.com.au/api/health' --scope yongkang-lis-projects
```

Expected: `environment=production`, `repository.mode=supabase`, `ready=true`, GST off and trading pretrade. Verify build errors 0, runtime errors 0 and deployment commit metadata equals HEAD.

- [ ] **Step 6: Resume Production browser acceptance without business-data writes**

Verify with the existing administrator session:

1. Warehouse remains locked for unconfirmed source.
2. Blank first-Packing-List confirmation emits no POST and shows field errors.
3. Cancel clears errors and closes the working copy.
4. Dashboard keeps v0 visible as `Packing List required`.
5. Confirmed and print-required totals exclude v0.
6. No `Prepare labels` or label-ready attention appears for v0.

Do not create or confirm a real Packing List during this step.

- [ ] **Step 7: Update the QA record**

Append Deployment ID, screenshots, evidence and the next safe boundary to:

```text
D:/AI HUB/Codex agent/Australia car parts project/qa/production-machine-acceptance-20260831/README.md
```

If the six browser checks pass, request explicit Production data-write authorization for a controlled Packing List v1 before testing labels, receipt, staging and putaway.
