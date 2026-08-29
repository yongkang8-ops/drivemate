# Partner Dashboard and Label Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Partner dashboard, versioned editable label library and location-label management after the Partner inbound-operations plan is complete, while preserving immutable print history and all Pre-trade boundaries.

**Architecture:** Treat templates as versioned business configuration: partners may create, edit, publish and archive versions, while every print job stores its selected template-version snapshot. Build a dashboard projection from persisted shipment, print, receipt, staging and putaway events. The dashboard shows a pipeline command board and actionable exceptions, never sales, GST, payment, public availability or unsaved scanner state.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Vitest, Playwright, Supabase SQL migrations prepared locally only, existing Phosphor icons and project CSS.

---

## Preconditions and dependency

- Implement `docs/superpowers/plans/2026-08-29-partner-inbound-operations-implementation.md` first. This plan depends on the `partner` role, packing-list revisions, print jobs, receipt sessions and putaway events defined there.
- Do not run migrations, push, deploy, set environment variables or create real Partner accounts under this plan.
- All dashboard counts derive from successful persisted server events. Browser-local input, cancelled print jobs and unsaved receipt drafts are excluded.
- The existing four template IDs remain stable: `unit_product`, `receiving_carton`, `bin_location`, `dispatch_shipping`.

## File structure

| File | Responsibility |
|---|---|
| `lib/labelTemplates.ts` | Pure template-version validation, field palette and type compatibility rules. |
| `lib/warehouseDashboard.ts` | Pure aggregation of pipeline, worklist, exception and activity data. |
| `lib/timezone.ts` | UTC-to-display-timezone formatting and supported timezone validation. |
| `lib/repository.ts` | Template library, dashboard and location-management contracts. |
| `lib/memoryRepository.ts`, `lib/supabaseRepository.ts` | Deterministic and database implementations. |
| `supabase/migrations/20260829_v14_partner_dashboard_label_library.sql` | Local-only template, version, location and dashboard-support schema. |
| `app/api/label-library/*` | Partner-authorised template list, draft, publish and archive APIs. |
| `app/api/partner/dashboard/route.ts` | Persisted Partner dashboard projection. |
| `app/api/inventory/locations/*` | Location creation, archive, lookup and bin-label print preparation. |
| `components/LabelLibrary.tsx`, `components/LabelTemplateEditor.tsx` | Catalogue, version lifecycle and controlled label editor. |
| `components/PartnerDashboard.tsx` | Inbound-pipeline command board. |
| `components/InventoryLocationPanel.tsx` | Location management and `DMLOC:` printing flow. |
| `app/partner/page.tsx`, `app/labels/page.tsx`, `app/inventory/page.tsx` | Partner routes for dashboard, label library and inventory/locations. |
| `tests/label-templates.test.ts`, `tests/warehouse-dashboard.test.ts`, `tests/timezone.test.ts` | Pure rules and aggregation tests. |
| `tests/label-library.spec.ts`, `tests/partner-dashboard.spec.ts`, `tests/inventory-locations.spec.ts` | Browser workflow tests. |

## Task 1: Define versioned label templates and safe component palettes

**Files:**
- Create: `lib/labelTemplates.ts`
- Create: `tests/label-templates.test.ts`
- Modify: `lib/warehouseLabels.ts`

- [ ] **Step 1: Write failing template-rule tests**

```ts
import { validateLabelTemplateDraft } from "../lib/labelTemplates";

it("requires the product barcode and part number on a publishable Unit Product template", () => {
  expect(validateLabelTemplateDraft({
    family: "unit_product",
    name: "Product v2",
    dimensionsMm: { width: 70, height: 50 },
    blocks: [{ type: "text", value: "DriveMate Parts" }],
  })).toMatchObject({ ok: false });
});

it("rejects VIN and price data fields in a Unit Product template", () => {
  expect(validateLabelTemplateDraft({
    family: "unit_product",
    name: "Unsafe",
    dimensionsMm: { width: 70, height: 50 },
    blocks: [{ type: "field", field: "vin" }],
  })).toMatchObject({ ok: false });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- label-templates.test.ts`

Expected: FAIL because template draft validation does not exist.

- [ ] **Step 3: Implement the controlled template model**

```ts
export type LabelTemplateStatus = "draft" | "approved" | "archived";
export type LabelBlock =
  | { type: "text"; value: string; xMm: number; yMm: number; fontSizePt: number }
  | { type: "field"; field: LabelDataField; xMm: number; yMm: number; fontSizePt: number }
  | { type: "barcode"; field: "product_barcode" | "carton_barcode" | "location_barcode"; xMm: number; yMm: number; widthMm: number; heightMm: number }
  | { type: "divider"; xMm: number; yMm: number; widthMm: number };

export type LabelTemplateDraft = {
  family: WarehouseLabelTemplateId;
  name: string;
  dimensionsMm: { width: number; height: number };
  blocks: LabelBlock[];
};
```

Define a per-family palette. Unit Product accepts controlled product fields only and requires `product_barcode` plus `part_number`. Bin Location requires `location_barcode` plus `location_code`. Receiving/Carton requires `carton_barcode` only after its optional activation. Dispatch/Shipping remains non-printable in Pre-trade. Reject raw HTML, raw TSPL, URLs without an approved stable QR destination, negative coordinates, blocks outside printable bounds and barcode fields missing human-readable text.

- [ ] **Step 4: Extend template metadata without changing existing print jobs**

Keep `WAREHOUSE_LABEL_TEMPLATE_IDS` unchanged. Add the template-family geometry and required-field rules by importing them from `labelTemplates.ts`; do not alter existing job snapshots or existing `WarehouseLabelTemplateId` values.

- [ ] **Step 5: Run unit tests and typecheck**

Run: `npm test -- label-templates.test.ts warehouseLabels.test.ts && npm run typecheck`

Expected: PASS, including a Location draft rejected when `DMLOC:` barcode is absent.

- [ ] **Step 6: Commit the template domain rules**

```powershell
git add lib/labelTemplates.ts lib/warehouseLabels.ts tests/label-templates.test.ts
git commit -m "feat: add controlled label template rules"
```

## Task 2: Add local-only template version storage and immutable print linkage

**Files:**
- Create: `supabase/migrations/20260829_v14_partner_dashboard_label_library.sql`
- Modify: `supabase/schema.sql`
- Modify: `lib/repository.ts`
- Modify: `lib/memoryRepository.ts`
- Modify: `lib/supabaseRepository.ts`
- Modify: `tests/warehouse-label-audit.test.ts`

- [ ] **Step 1: Write failing version and archive tests**

```ts
const validProductBlocks = [
  { type: "field", field: "part_number", xMm: 4, yMm: 4, fontSizePt: 9 },
  { type: "barcode", field: "product_barcode", xMm: 4, yMm: 24, widthMm: 58, heightMm: 14 },
] as const;
const draft = await repository.createLabelTemplateDraft({ family: "unit_product", name: "Product v2", dimensionsMm: { width: 70, height: 50 }, blocks: [...validProductBlocks] });
if (!draft.ok) throw new Error(draft.message);
const approved = await repository.publishLabelTemplateVersion(draft.version.id, { actorId: "demo-partner-user" });
if (!approved.ok) throw new Error(approved.message);
const archived = await repository.archiveLabelTemplateVersion(approved.version.id, { actorId: "demo-partner-user" });

expect(approved).toMatchObject({ ok: true, version: { status: "approved", versionNumber: 1 } });
expect(archived).toMatchObject({ ok: true, version: { status: "archived" } });
```

Add a test that a print job retains `templateVersionSnapshot` even after a later version is published or archived.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- warehouse-label-audit.test.ts label-templates.test.ts`

Expected: FAIL because the repository does not expose template versions.

- [ ] **Step 3: Add local-only SQL tables**

```sql
create table public.warehouse_label_templates (
  id uuid primary key default gen_random_uuid(),
  family text not null check (family in ('unit_product', 'receiving_carton', 'bin_location', 'dispatch_shipping')),
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (family, name)
);

create table public.warehouse_label_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.warehouse_label_templates(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  status text not null check (status in ('draft', 'approved', 'archived')),
  design_snapshot jsonb not null check (jsonb_typeof(design_snapshot) = 'object'),
  published_by uuid references auth.users(id),
  published_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (template_id, version_number)
);

alter table public.warehouse_label_print_jobs
  add column template_version_id uuid references public.warehouse_label_template_versions(id),
  add column template_version_snapshot jsonb;

alter table public.shipment_cartons
  add column internal_carton_barcode text unique;
```

Add checks that `approved` has publish fields and `archived` has an archive timestamp. Backfill legacy print jobs with a snapshot derived from their existing `template_id` before adding a non-null check for new jobs. `internal_carton_barcode` remains null until an optional Receiving / Carton label is requested; when first requested, the server writes the stable `DMCARTON:<shipment_carton_uuid>` value. Mirror the schema locally only.

- [ ] **Step 4: Add repository contracts**

```ts
createLabelTemplateDraft(input: LabelTemplateDraft, context: RepositoryWriteContext): Promise<LabelTemplateVersionResult>;
publishLabelTemplateVersion(versionId: string, context: RepositoryWriteContext): Promise<LabelTemplateVersionResult>;
archiveLabelTemplateVersion(versionId: string, context: RepositoryWriteContext): Promise<LabelTemplateVersionResult>;
listApprovedLabelTemplateVersions(family: WarehouseLabelTemplateId): Promise<LabelTemplateVersionListResult>;
```

All write methods require Partner/Administrator capability at the route layer. Repository publish re-validates the draft, makes a prior approved version archived or superseded according to the chosen family, and never mutates historical snapshots.

- [ ] **Step 5: Run migration-order, repository and audit tests**

Run: `npm test -- migration-order.test.ts repository.test.ts warehouse-label-audit.test.ts label-templates.test.ts`

Expected: PASS with print audit snapshots unchanged after archive.

- [ ] **Step 6: Commit template persistence**

```powershell
git add supabase/migrations/20260829_v14_partner_dashboard_label_library.sql supabase/schema.sql lib/repository.ts lib/memoryRepository.ts lib/supabaseRepository.ts tests/warehouse-label-audit.test.ts tests/label-templates.test.ts
git commit -m "feat: add versioned label template storage"
```

## Task 3: Build the Partner label library and template editor

**Files:**
- Create: `app/api/label-library/templates/route.ts`
- Create: `app/api/label-library/templates/[templateId]/versions/route.ts`
- Create: `app/api/label-library/versions/[versionId]/publish/route.ts`
- Create: `app/api/label-library/versions/[versionId]/archive/route.ts`
- Create: `components/LabelLibrary.tsx`
- Create: `components/LabelTemplateEditor.tsx`
- Create: `app/labels/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/label-library.spec.ts`

- [ ] **Step 1: Write the failing browser test**

```ts
await page.goto("/labels");
await page.getByRole("button", { name: "New template" }).click();
await page.getByLabel("Label family").selectOption("unit_product");
await page.getByLabel("Template name").fill("Product warehouse v2");
await page.getByRole("button", { name: "Add product barcode" }).click();
await page.getByRole("button", { name: "Publish version" }).click();
await expect(page.getByText("Approved version 1")).toBeVisible();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/label-library.spec.ts`

Expected: FAIL because the Partner label-library route and UI do not exist.

- [ ] **Step 3: Implement API permission and validation flow**

Use `getRequestContext`, `can(role, "inventory_write")`, completed staff MFA and `mutationRequestAllowed` for draft, publish and archive writes. `GET` library/list endpoints require `warehouse_read`. Validate every request through `validateLabelTemplateDraft` before persistence. Return flattened Zod errors for invalid coordinates or prohibited fields, never a partially published template.

- [ ] **Step 4: Implement the library and editor layout**

```tsx
<LabelTemplateEditor
  family={selectedFamily}
  draft={draft}
  palette={getLabelFieldPalette(selectedFamily)}
  onAddBlock={addBlock}
  onChangeBlock={updateBlock}
  onPublish={publishDraft}
/>
```

Render the family catalogue first, then a three-column editor: allowed fields/components, true-mm preview and selected-block properties. Use English controls. All versions show status, version number, publisher and timestamp. Archive removes the version from future selection only. Do not implement drag-and-drop canvas physics, raw code entry or direct printer protocols.

- [ ] **Step 5: Run browser and unit tests**

Run: `npm test -- label-templates.test.ts warehouse-label-audit.test.ts && npx playwright test tests/label-library.spec.ts`

Expected: PASS, including rejection of a Unit Product publish that omits its barcode.

- [ ] **Step 6: Commit the Partner label library**

```powershell
git add app/api/label-library components/LabelLibrary.tsx components/LabelTemplateEditor.tsx app/labels/page.tsx app/globals.css tests/label-library.spec.ts
git commit -m "feat: add partner label template library"
```

## Task 4: Add template-version selection to print workflows

**Files:**
- Modify: `components/WarehouseLabelPrint.tsx`
- Modify: `app/api/warehouse/labels/route.ts`
- Modify: `lib/repository.ts`
- Modify: `lib/supabaseRepository.ts`
- Modify: `tests/warehouse-label-print.spec.ts`

- [ ] **Step 1: Write failing template-selection tests**

```ts
await page.getByLabel("Label family").selectOption("unit_product");
await page.getByLabel("Template version").selectOption({ label: "Product warehouse v2 · v1" });
await page.getByRole("button", { name: "Preview labels" }).click();
await expect(page.getByText("Product warehouse v2")).toBeVisible();
```

Add a unit/API test that `receiving_carton` needs a carton scope, `bin_location` needs a location scope and `dispatch_shipping` returns an explicit Pre-trade-disabled result.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- label-templates.test.ts && npx playwright test tests/warehouse-label-print.spec.ts`

Expected: FAIL because print jobs currently know only `templateId`.

- [ ] **Step 3: Implement compatible family and version selection**

```ts
const printableFamiliesForScope = {
  inbound: ["unit_product", "receiving_carton"],
  location: ["bin_location"],
  dispatch: [],
} as const;
```

The print API accepts `templateVersionId`, loads the approved version server-side, verifies the selected scope is compatible and records `templateVersionSnapshot` in the new job. When the selected family is `receiving_carton`, resolve each selected shipment-carton record and create its stable `DMCARTON:<shipment_carton_uuid>` code if it does not exist. Carton labels remain optional and never unlock or block receipt. Unit Product prints remain the only family capable of unlocking receipt. Switching a template or family never rewrites a prior job, scope, expected quantity or receipt state.

- [ ] **Step 4: Run print regression suite**

Run: `npm test -- warehouse-label-audit.test.ts label-templates.test.ts && npx playwright test tests/warehouse-label-print.spec.ts`

Expected: PASS, including disabled dispatch printing and immutable template-version snapshot persistence.

- [ ] **Step 5: Commit print-template selection**

```powershell
git add components/WarehouseLabelPrint.tsx app/api/warehouse/labels/route.ts lib/repository.ts lib/supabaseRepository.ts tests/warehouse-label-print.spec.ts
git commit -m "feat: select approved label template versions"
```

## Task 5: Build the persisted Partner dashboard projection

**Files:**
- Create: `lib/timezone.ts`
- Create: `lib/warehouseDashboard.ts`
- Create: `tests/timezone.test.ts`
- Create: `tests/warehouse-dashboard.test.ts`
- Modify: `lib/repository.ts`
- Modify: `lib/memoryRepository.ts`
- Modify: `lib/supabaseRepository.ts`
- Create: `app/api/partner/dashboard/route.ts`

- [ ] **Step 1: Write failing projection tests**

```ts
import { buildPartnerDashboard } from "../lib/warehouseDashboard";

const dashboard = buildPartnerDashboard({
  shipments: [{ id: "shipment-test-1", expectedQuantity: 18, stage: "staging", lastEventAt: "2026-08-29T00:45:00.000Z" }],
  exceptions: [{ type: "short_pack", reference: "DM-GWM-OF-001", createdAt: "2026-08-29T00:36:00.000Z" }],
  activities: [],
  displayTimeZone: "Australia/Brisbane",
});

expect(dashboard.pipeline.staging.units).toBe(18);
expect(dashboard.exceptions[0]).toMatchObject({ type: "short_pack" });
```

Add timezone tests proving `2026-08-29T00:45:00.000Z` formats as `29 Aug 2026, 10:45` in `Australia/Brisbane` and `29 Aug 2026, 08:45` in `Asia/Shanghai`.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npm test -- warehouse-dashboard.test.ts timezone.test.ts`

Expected: FAIL because no dashboard aggregation or timezone formatter exists.

- [ ] **Step 3: Implement pure aggregation and timezone helpers**

```ts
export const DISPLAY_TIME_ZONES = ["Australia/Brisbane", "Asia/Shanghai"] as const;

export function formatWarehouseTimestamp(iso: string, timeZone: typeof DISPLAY_TIME_ZONES[number]) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}
```

`buildPartnerDashboard` must produce pipeline counts for pre-arrival, label-gate, receiving, staging and located states; a shipment worklist; exceptions sorted by action priority then persisted time; and only persisted print/receipt/putaway activity. Do not calculate sales, pricing, GST or public availability.

- [ ] **Step 4: Add repository query and Partner API**

```ts
const querySchema = z.object({
  timeZone: z.enum(["Australia/Brisbane", "Asia/Shanghai"]).default("Australia/Brisbane"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().trim().max(120).optional(),
});
```

The API requires `warehouse_read`, validates date range and reads only persisted shipment, print, receipt, stock-movement and exception records. Return `generatedAt` from the server. Never expose service credentials, customer data or browser-local drafts.

- [ ] **Step 5: Run dashboard unit and API tests**

Run: `npm test -- warehouse-dashboard.test.ts timezone.test.ts api-routes.spec.ts && npm run typecheck`

Expected: PASS with the same UTC event displaying in the selected timezone without changing stored data.

- [ ] **Step 6: Commit dashboard projection**

```powershell
git add lib/timezone.ts lib/warehouseDashboard.ts lib/repository.ts lib/memoryRepository.ts lib/supabaseRepository.ts app/api/partner/dashboard/route.ts tests/timezone.test.ts tests/warehouse-dashboard.test.ts
git commit -m "feat: add partner inbound dashboard projection"
```

## Task 6: Implement the inbound-pipeline Partner dashboard

**Files:**
- Create: `components/PartnerDashboard.tsx`
- Create: `app/partner/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/partner-dashboard.spec.ts`

- [ ] **Step 1: Write the failing dashboard browser test**

```ts
await page.goto("/partner");
await expect(page.getByRole("heading", { name: "Inbound pipeline command board" })).toBeVisible();
await expect(page.getByText("Shipment worklist")).toBeVisible();
await page.getByLabel("Display timezone").selectOption("Asia/Shanghai");
await expect(page.getByText(/08:45/)).toBeVisible();
await expect(page.getByText("Priority exception queue")).toBeVisible();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/partner-dashboard.spec.ts`

Expected: FAIL because the Partner dashboard page does not exist.

- [ ] **Step 3: Implement Option 2 visual hierarchy**

```tsx
<PartnerDashboard
  pipeline={dashboard.pipeline}
  shipments={dashboard.shipments}
  exceptions={dashboard.exceptions}
  activities={dashboard.activities}
  generatedAt={dashboard.generatedAt}
/>
```

Render an inbound pipeline ribbon, compact filter row, shipment worklist, priority exception queue and persisted-event timeline. Rows link to a scoped shipment or inbound workflow. Use English only, existing deep teal and amber exception tokens, no generic KPI-card grid, trend chart, revenue, public availability, customer, GST, payment or dispatch view.

- [ ] **Step 4: Add empty, loading and stale-data states**

Render a skeleton matching the final table geometry while loading, `No inbound shipments match this view` for an empty query, and a visible retry action for API errors. Show server `generatedAt` and selected display timezone. Do not use an infinite spinner or claim live data without a successful API response.

- [ ] **Step 5: Run browser and local quality checks**

Run: `npx playwright test tests/partner-dashboard.spec.ts && npm run typecheck && npm run build`

Expected: PASS with a readable desktop command board and no Pre-trade-excluded data.

- [ ] **Step 6: Commit the dashboard UI**

```powershell
git add components/PartnerDashboard.tsx app/partner/page.tsx app/globals.css tests/partner-dashboard.spec.ts
git commit -m "feat: add partner inbound command dashboard"
```

## Task 7: Add Inventory and Location management with Bin label printing

**Files:**
- Create: `app/api/inventory/locations/route.ts`
- Create: `app/api/inventory/locations/[locationId]/archive/route.ts`
- Create: `components/InventoryLocationPanel.tsx`
- Create: `app/inventory/page.tsx`
- Modify: `lib/repository.ts`
- Modify: `lib/memoryRepository.ts`
- Modify: `lib/supabaseRepository.ts`
- Modify: `lib/warehouseLabels.ts`
- Modify: `app/globals.css`
- Create: `tests/inventory-locations.spec.ts`

- [ ] **Step 1: Write failing location and barcode tests**

```ts
expect(createLocationBarcode("BNE-A01-03")).toBe("DMLOC:BNE-A01-03");
expect(parseWarehouseBarcode("DMLOC:BNE-A01-03")).toMatchObject({ ok: true, kind: "location" });
```

Browser test:

```ts
await page.goto("/inventory");
await page.getByLabel("Location code").fill("BNE-A01-03");
await page.getByRole("button", { name: "Create location" }).click();
await page.getByRole("button", { name: "Print location label" }).click();
await expect(page.getByText("DMLOC:BNE-A01-03")).toBeVisible();
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm test -- warehouseLabels.test.ts warehouse-location.test.ts && npx playwright test tests/inventory-locations.spec.ts`

Expected: FAIL because location management and Bin label printing routes do not exist.

- [ ] **Step 3: Implement location lifecycle**

Location creation validates a canonical `BNE-` location code, creates a unique inventory location and corresponding `DMLOC:` barcode, then offers the approved `bin_location` template family. Archive rejects a location with non-zero balance and preserves prior movement history. Partner accounts can operate the same management UI; no country-based restriction exists.

- [ ] **Step 4: Wire Bin label print selection**

The existing print route receives `scopeKind: "location"`, one or more location IDs and an approved `bin_location` template version. It creates immutable print snapshots but never changes inventory. `dispatch_shipping` continues to return a Pre-trade-disabled message.

- [ ] **Step 5: Run location, template and browser tests**

Run: `npm test -- warehouseLabels.test.ts warehouse-location.test.ts label-templates.test.ts && npx playwright test tests/inventory-locations.spec.ts tests/label-library.spec.ts`

Expected: PASS, including archive rejection for a location that still holds stock.

- [ ] **Step 6: Commit location management**

```powershell
git add app/api/inventory/locations components/InventoryLocationPanel.tsx app/inventory/page.tsx lib/repository.ts lib/memoryRepository.ts lib/supabaseRepository.ts lib/warehouseLabels.ts app/globals.css tests/inventory-locations.spec.ts
git commit -m "feat: add partner location labels and inventory view"
```

## Final local verification

- [ ] Run `git diff --check` before every commit and confirm no user-owned untracked file is staged.
- [ ] Run `npm test`, `npm run typecheck` and `npm run build` after Task 7.
- [ ] Run `npx playwright test tests/label-library.spec.ts tests/partner-dashboard.spec.ts tests/inventory-locations.spec.ts tests/warehouse-smoke.spec.ts`.
- [ ] Verify Unit Product print remains the only print family that unlocks receipt.
- [ ] Verify a later template edit or archive does not alter a prior print job snapshot.
- [ ] Verify dashboard values exclude unsaved scans, GST, payments, public availability and real dispatch.
- [ ] Do not run v14, push or deploy. Those remain separate user-approval gates.
