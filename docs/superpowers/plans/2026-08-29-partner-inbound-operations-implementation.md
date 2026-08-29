# Partner Inbound Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the unified Partner pre-arrival, label-gated receiving and scan-to-location putaway workflow without enabling real trading, GST, payments, customer dispatch or any production database write.

**Architecture:** Add the `partner` staff role and local-only database schema for immutable packing-list versions and receipt sessions. Reuse the existing Shipment → Pallet → Carton → SKU hierarchy, existing `products.barcode`, label-print audit records and `DMLOC:` parser. The new server APIs own validation, print-gate verification and staging movement; React components only render the selected scope and submit idempotent requests.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Vitest, Playwright, Supabase SQL migrations prepared locally only, Windows print dialog and USB HID barcode scanner.

---

## Preconditions and non-negotiable boundaries

- Work in `C:\Users\yongk\.config\superpowers\worktrees\drivemate-web\release-pretrade-production-20260824`.
- Do not run a Supabase migration, GitHub push, Vercel deployment or production environment update under this plan. Each migration is a local review artifact until separately approved.
- Do not use `git add .`, `git reset --hard` or change existing unrelated untracked files.
- Existing `warehouse` profiles migrate to `partner` in the local migration so the role model has one operational staff role. The migration is not executed against Production in this plan.
- Product scan identity is not fitment evidence. No inbound screen or label introduces vehicle, VIN/Rego, price, GST, customer or carrier claims.

## File structure

| File | Responsibility |
|---|---|
| `lib/auth.ts` | `partner` role and capabilities. |
| `lib/serverAuth.ts`, `lib/clientAuth.ts`, `components/AuthPanel.tsx` | Partner session and MFA-aware browser access. |
| `lib/prearrivalShipment.ts` | Pure packing-list revision validation and canonical source hierarchy. |
| `lib/warehouseReceiving.ts` | Pure receipt-count, discrepancy and scope-reconciliation rules. |
| `lib/repository.ts` | Repository contracts for versions, receipt sessions and scoped inbound work. |
| `lib/memoryRepository.ts` | Deterministic Partner, packing-list and staged-receipt test data. |
| `lib/supabaseRepository.ts` | Supabase implementation of the new contracts. |
| `supabase/migrations/20260829_v13_partner_inbound_operations.sql` | Local-only role, version, receipt-session and staging SQL. |
| `supabase/schema.sql` | Schema mirror for the v13 migration. |
| `app/api/prearrival/shipments/*` | Partner-authorised pre-arrival reads, revisions and confirmation. |
| `app/api/warehouse/labels/*` | Scoped label preview, print-job creation, outcome and reprint APIs. |
| `app/api/warehouse/receipts/route.ts` | Label-gated receipt confirmation, no caller-supplied location. |
| `app/api/warehouse/putaway/route.ts` | Product + `DMLOC:` + quantity putaway request. |
| `components/PartnerInboundWorkspace.tsx` | Shell with fixed scope, work selector and state handoff. |
| `components/PrearrivalShipmentPanel.tsx` | Shipment version, pallet, carton and SKU review/edit screen. |
| `components/WarehouseLabelPrint.tsx` | Scope, approved product-template selection, preview and print outcome UI. |
| `components/GoodsReceiptPanel.tsx` | Two receipt modes, discrepancy capture and progress state. |
| `components/WarehousePutawayPanel.tsx` | Scan-only normal putaway flow and supervised fallback. |
| `components/ReceiptHistoryPanel.tsx` | Scoped, timezone-aware inbound audit history and filters. |
| `app/warehouse/page.tsx`, `app/globals.css` | Replace the legacy free-text inbound UI with the approved operational workspace. |
| `tests/auth.test.ts`, `tests/warehouse-*.test.ts`, `tests/*.spec.ts` | Unit, API and browser regression coverage. |

## Task 1: Introduce the unified Partner role without expanding public access

**Files:**
- Modify: `lib/auth.ts`
- Modify: `lib/serverAuth.ts`
- Modify: `components/AuthPanel.tsx`
- Modify: `components/RoleGate.tsx`
- Modify: `tests/auth.test.ts`
- Modify: `tests/client-auth.test.ts`
- Create: `supabase/migrations/20260829_v13_partner_inbound_operations.sql`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Write failing role-capability tests**

```ts
import { can, parseRole } from "../lib/auth";

it("uses one Partner role for all internal operating capabilities", () => {
  expect(parseRole("partner")).toBe("partner");
  expect(can("partner", "warehouse_read")).toBe(true);
  expect(can("partner", "inventory_write")).toBe(true);
  expect(can("partner", "admin_write")).toBe(false);
});

it("does not leave the legacy warehouse role as an accepted runtime role", () => {
  expect(parseRole("warehouse")).toBe("public");
});
```

- [ ] **Step 2: Run the focused test to prove the current behaviour fails**

Run: `npm test -- auth.test.ts`

Expected: FAIL because `partner` is not an `AppRole` and `warehouse` currently owns warehouse capabilities.

- [ ] **Step 3: Implement the minimum role map**

```ts
export type AppRole = "public" | "trade" | "partner" | "admin";

const capabilityRoles: Record<Capability, AppRole[]> = {
  vehicle_lookup: ["trade", "partner", "admin"],
  trade_read: ["trade", "admin"],
  create_order: ["trade", "admin"],
  inventory_write: ["partner", "admin"],
  warehouse_read: ["partner", "admin"],
  admin_read: ["admin"],
  admin_write: ["admin"],
};
```

Update client access checks so `expectedRole="partner"` accepts `partner` and `admin`. Update staff MFA logic so Partner and Administrator use the existing staff-MFA setting. Do not broaden `trade` or `public` access.

- [ ] **Step 4: Prepare the local-only role migration and schema mirror**

```sql
alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;

update public.user_profiles set role = 'partner' where role = 'warehouse';

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('public', 'trade', 'partner', 'admin'));
```

Mirror the same role check in `supabase/schema.sql`. Do not execute this migration against any Supabase project.

- [ ] **Step 5: Run role tests and typecheck**

Run: `npm test -- auth.test.ts client-auth.test.ts && npm run typecheck`

Expected: PASS with Partner granted only the intended operational capabilities.

- [ ] **Step 6: Commit only the role files**

```powershell
git add lib/auth.ts lib/serverAuth.ts components/AuthPanel.tsx components/RoleGate.tsx tests/auth.test.ts tests/client-auth.test.ts supabase/migrations/20260829_v13_partner_inbound_operations.sql supabase/schema.sql
git commit -m "feat: add unified partner warehouse role"
```

## Task 2: Add immutable pre-arrival packing-list revisions

**Files:**
- Create: `lib/prearrivalShipment.ts`
- Modify: `lib/repository.ts`
- Modify: `lib/memoryRepository.ts`
- Modify: `lib/supabaseRepository.ts`
- Modify: `supabase/migrations/20260829_v13_partner_inbound_operations.sql`
- Modify: `supabase/schema.sql`
- Create: `tests/prearrival-shipment.test.ts`

- [ ] **Step 1: Write failing pure validation tests**

```ts
import { validatePackingListRevision } from "../lib/prearrivalShipment";

const revision = validatePackingListRevision({
  shipmentId: "shipment-test-1",
  pallets: [{
    sourcePalletNumber: "P001",
    cartons: [{
      sourceCartonNumber: "C001",
      lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 12 }],
    }],
  }],
});

expect(revision).toMatchObject({ ok: true, totalExpectedQuantity: 12 });
expect(validatePackingListRevision({ shipmentId: "shipment-test-1", pallets: [] })).toMatchObject({ ok: false });
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- prearrival-shipment.test.ts`

Expected: FAIL because the packing-list validator does not exist.

- [ ] **Step 3: Implement the canonical revision type and validation**

```ts
export type PackingListRevisionInput = {
  shipmentId: string;
  pallets: Array<{
    sourcePalletNumber: string;
    cartons: Array<{
      sourceCartonNumber: string;
      lines: Array<{ sku: string; expectedQuantity: number; batchLot?: string }>;
    }>;
  }>;
};

export function validatePackingListRevision(input: PackingListRevisionInput) {
  // reject blank/duplicate pallet and carton numbers, unknown/duplicate SKU lines,
  // non-integer or non-positive quantities, and cartons not owned by exactly one pallet.
}
```

Normalise identifiers before duplicate checks. Keep source pallet and carton numbers unchanged for display after validation. The function must not query databases or change stock.

- [ ] **Step 4: Add version tables to the local migration**

```sql
create table public.shipment_packing_list_versions (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id),
  version integer not null,
  status text not null check (status in ('draft', 'confirmed', 'superseded')),
  payload_snapshot jsonb not null check (jsonb_typeof(payload_snapshot) = 'object'),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (shipment_id, version)
);
```

Add a check that only `confirmed` rows have both confirmation fields. Repository confirmation must create a new version, mark a prior confirmed version `superseded`, then update the live shipment pallet/carton hierarchy inside one transaction. Mirror the table in `supabase/schema.sql`.

- [ ] **Step 5: Add repository methods and deterministic memory data**

```ts
createPackingListRevision(input: PackingListRevisionInput, context: RepositoryWriteContext): Promise<PackingListRevisionResult>;
confirmPackingListRevision(revisionId: string, context: RepositoryWriteContext): Promise<PackingListRevisionResult>;
getPrearrivalShipment(shipmentId: string): Promise<PrearrivalShipmentResult>;
```

The memory repository must expose `shipment-test-1`, `P001`, `C001`, `C002`, source quantities and a confirmation revision. Supabase reads must join the live hierarchy and the latest confirmed revision without reading a service-role key into the client.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- prearrival-shipment.test.ts warehouse-prearrival-receiving.test.ts && npm run typecheck`

Expected: PASS, including rejection of a revision that duplicates a carton number within a shipment.

- [ ] **Step 7: Commit the revision model**

```powershell
git add lib/prearrivalShipment.ts lib/repository.ts lib/memoryRepository.ts lib/supabaseRepository.ts supabase/migrations/20260829_v13_partner_inbound_operations.sql supabase/schema.sql tests/prearrival-shipment.test.ts
git commit -m "feat: add versioned prearrival packing lists"
```

## Task 3: Build the Partner pre-arrival shipment workspace

**Files:**
- Create: `app/api/prearrival/shipments/route.ts`
- Create: `app/api/prearrival/shipments/[shipmentId]/revisions/route.ts`
- Create: `app/api/prearrival/revisions/[revisionId]/confirm/route.ts`
- Create: `components/PrearrivalShipmentPanel.tsx`
- Create: `app/prearrival/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/prearrival-shipments.spec.ts`

- [ ] **Step 1: Write the failing browser test**

```ts
await page.goto("/prearrival");
await page.getByRole("button", { name: "Create revision" }).click();
await page.getByLabel("Pallet number").fill("P001");
await page.getByLabel("Carton number").fill("C001");
await page.getByLabel("SKU").fill("DM-GWM-OF-001");
await page.getByLabel("Expected quantity").fill("12");
await page.getByRole("button", { name: "Confirm packing list" }).click();
await expect(page.getByText("Packing list v1 confirmed")).toBeVisible();
```

- [ ] **Step 2: Run the browser test to verify it fails**

Run: `npx playwright test tests/prearrival-shipments.spec.ts`

Expected: FAIL because no Partner pre-arrival route or UI exists.

- [ ] **Step 3: Implement Partner-authorised revision APIs**

```ts
const packingListSchema = z.object({
  shipmentId: z.string().uuid(),
  pallets: z.array(z.object({
    sourcePalletNumber: z.string().trim().min(1).max(80),
    cartons: z.array(z.object({
      sourceCartonNumber: z.string().trim().min(1).max(80),
      lines: z.array(z.object({
        sku: z.string().trim().min(1).max(120),
        expectedQuantity: z.number().int().positive(),
        batchLot: z.string().trim().max(120).optional(),
      })).min(1),
    })).min(1),
  })).min(1),
});
```

`GET /api/prearrival/shipments` requires `warehouse_read`. Draft/revision creation and confirmation require `inventory_write`, completed MFA and `mutationRequestAllowed`. Confirmation calls the repository transaction from Task 2 and never changes stock, pricing, GST or public availability.

- [ ] **Step 4: Implement the scoped pre-arrival page**

Render the left packing structure from source pallet and carton numbers, the selected carton line grid, version status and source confirmation timestamp. `Create revision` creates a draft from the latest confirmed payload; `Confirm packing list` requires all validation errors to be resolved. The first operational handoff is `Prepare AU labels`, which navigates into inbound label scope without issuing a print job itself.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm test -- prearrival-shipment.test.ts && npx playwright test tests/prearrival-shipments.spec.ts && npm run typecheck`

Expected: PASS, including a confirmed revision that cannot be edited in place.

- [ ] **Step 6: Commit the pre-arrival workspace**

```powershell
git add app/api/prearrival components/PrearrivalShipmentPanel.tsx app/prearrival/page.tsx app/globals.css tests/prearrival-shipments.spec.ts
git commit -m "feat: add partner prearrival shipment workspace"
```

## Task 4: Persist label-gated receipt sessions into internal staging

**Files:**
- Modify: `lib/warehouseReceiving.ts`
- Modify: `lib/repository.ts`
- Modify: `lib/memoryRepository.ts`
- Modify: `lib/supabaseRepository.ts`
- Modify: `supabase/migrations/20260829_v13_partner_inbound_operations.sql`
- Modify: `supabase/schema.sql`
- Modify: `app/api/warehouse/receipts/route.ts`
- Modify: `tests/warehouse-receiving.test.ts`
- Create: `tests/warehouse-receipt-api.test.ts`

- [ ] **Step 1: Write failing receipt-session tests**

```ts
const result = prepareWarehouseReceipt({
  expectedScope: {
    shipmentId: "shipment-test-1",
    cartonNumbers: ["C001"],
    lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 12, productBarcode: "DMPGWMOF001" }],
  },
  mode: "counted_quantity",
  countedLines: [{ productBarcode: "DMPGWMOF001", actualQuantity: 11, discrepancyReason: "Supplier short packed one unit." }],
});

expect(result).toMatchObject({ ok: true, stagingLocation: "BNE-RECEIVING-STAGING" });
```

Add API assertions that a request with no `printed` Unit Product job covering `C001` returns HTTP 422 and that the API rejects a caller-supplied `locationId`.

- [ ] **Step 2: Run the new focused tests to verify they fail**

Run: `npm test -- warehouse-receiving.test.ts warehouse-receipt-api.test.ts`

Expected: FAIL because receipt scope, print-gate verification and the new request shape do not exist.

- [ ] **Step 3: Expand the pure receipt contract**

```ts
export type WarehouseReceiptScope = {
  shipmentId: string;
  cartonNumbers: string[];
  lines: Array<{ sku: string; expectedQuantity: number; productBarcode: string }>;
};

export type ReceiptDiscrepancy = {
  type: "short_pack" | "over_received" | "damaged" | "wrong_item" | "unknown_barcode";
  reason: string;
};
```

`scan_each` accumulates only expected product barcodes. `counted_quantity` requires a recognised product scan first. Both modes reject empty or duplicate counted lines, invalid quantities and mismatches without a classified reason. Saving in-progress counts must not produce a movement; only `confirmWarehouseReceipt` can produce the staging result.

- [ ] **Step 4: Add local receipt-session SQL**

```sql
create table public.warehouse_receipt_sessions (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id),
  scope_snapshot jsonb not null check (jsonb_typeof(scope_snapshot) = 'object'),
  mode text not null check (mode in ('scan_each', 'counted_quantity')),
  status text not null check (status in ('in_progress', 'confirmed', 'cancelled')),
  created_by uuid references auth.users(id),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);
```

Create companion receipt-line and discrepancy tables. The confirmation transaction resolves or creates `BNE-RECEIVING-STAGING` server-side, checks the latest confirmed Unit Product print coverage and writes a stock movement with the receipt-session reference. It must never set public availability, GST, sales-order or dispatch state.

- [ ] **Step 5: Replace the receipt API payload and route logic**

```ts
const receiptSchema = z.object({
  selection: z.object({ shipmentId: z.string().uuid(), cartonNumbers: z.array(z.string()).min(1) }),
  mode: z.enum(["scan_each", "counted_quantity"]),
  scannedProductBarcodes: z.array(z.string()).optional(),
  countedLines: z.array(z.object({ productBarcode: z.string(), actualQuantity: z.number().int().nonnegative(), discrepancy: z.object({ type: z.enum(["short_pack", "over_received", "damaged", "wrong_item", "unknown_barcode"]), reason: z.string().trim().min(3) }).optional() })).optional(),
  idempotencyKey: z.string().uuid(),
});
```

Require `inventory_write`, completed staff MFA and `mutationRequestAllowed`. Remove `receiptNumber` and `locationId` from the browser-controlled payload; the server creates the receipt reference and staging location. Return `sessionId`, `stagingLocation` and saved receipt lines.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- warehouse-receiving.test.ts warehouse-receipt-api.test.ts warehouse-label-audit.test.ts && npm run typecheck`

Expected: PASS with no receipt created when the print gate is not satisfied.

- [ ] **Step 7: Commit the label-gated receipt workflow**

```powershell
git add lib/warehouseReceiving.ts lib/repository.ts lib/memoryRepository.ts lib/supabaseRepository.ts app/api/warehouse/receipts/route.ts supabase/migrations/20260829_v13_partner_inbound_operations.sql supabase/schema.sql tests/warehouse-receiving.test.ts tests/warehouse-receipt-api.test.ts
git commit -m "feat: add label-gated staged receipts"
```

## Task 5: Build the scoped product-label print flow

**Files:**
- Create: `app/api/warehouse/labels/route.ts`
- Create: `app/api/warehouse/labels/[jobId]/route.ts`
- Create: `components/WarehouseLabelPrint.tsx`
- Modify: `lib/repository.ts`
- Modify: `lib/memoryRepository.ts`
- Modify: `lib/supabaseRepository.ts`
- Create: `tests/warehouse-label-print.spec.ts`

- [ ] **Step 1: Write the failing browser test**

```ts
await page.getByLabel("Shipment").selectOption("shipment-test-1");
await page.getByLabel("Pallet P001").check();
await page.getByRole("button", { name: "Preview labels" }).click();
await expect(page.getByText("DM-GWM-OF-001")).toBeVisible();
await page.getByRole("button", { name: "Print labels" }).click();
await page.getByRole("button", { name: "Confirm printed" }).click();
await expect(page.getByText("Receipt unlocked")).toBeVisible();
```

- [ ] **Step 2: Run the browser test to verify it fails**

Run: `npx playwright test tests/warehouse-label-print.spec.ts`

Expected: FAIL because the scoped print UI and API do not exist.

- [ ] **Step 3: Implement the authorised API boundary**

`GET` preview requires `warehouse_read`; `POST` job creation, `Printed`/`Cancelled` outcome and reprint require `inventory_write`, MFA and request-security validation. Use existing `warehouse_label_print_jobs` and immutable `warehouse_label_print_items`; do not add raw TSPL, USB access or a server-side print call.

- [ ] **Step 4: Implement the component state machine**

```ts
type PrintPanelState =
  | { step: "select" }
  | { step: "preview"; jobId: string }
  | { step: "awaiting_outcome"; jobId: string }
  | { step: "confirmed"; jobId: string }
  | { step: "cancelled"; jobId: string };
```

The component renders the fixed-mm English Unit Product label, calls `window.print()`, then requires an explicit outcome. Reprint opens one required reason field and links every new job to the original. The component must never claim a physical print succeeded before the operator confirms it.

- [ ] **Step 5: Run browser and unit tests**

Run: `npm test -- warehouse-label-audit.test.ts warehouse-prearrival-receiving.test.ts && npx playwright test tests/warehouse-label-print.spec.ts`

Expected: PASS, including a cancelled job that leaves receipt locked.

- [ ] **Step 6: Commit the print flow**

```powershell
git add app/api/warehouse/labels components/WarehouseLabelPrint.tsx lib/repository.ts lib/memoryRepository.ts lib/supabaseRepository.ts tests/warehouse-label-print.spec.ts
git commit -m "feat: add scoped warehouse product printing"
```

## Task 6: Replace the legacy warehouse page with the approved inbound workspace

**Files:**
- Create: `components/PartnerInboundWorkspace.tsx`
- Create: `components/WarehousePutawayPanel.tsx`
- Modify: `components/GoodsReceiptPanel.tsx`
- Modify: `components/ScannerInput.tsx`
- Modify: `components/WarehouseScannerPanel.tsx`
- Modify: `app/warehouse/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/warehouse-inbound-workspace.spec.ts`

- [ ] **Step 1: Write the failing workflow browser test**

```ts
await page.getByRole("link", { name: "Receive stock" }).click();
await expect(page.getByText("Receipt locked")).toBeVisible();
await page.getByRole("link", { name: "Label print" }).click();
await page.getByRole("button", { name: "Confirm printed" }).click();
await page.getByRole("link", { name: "Receive stock" }).click();
await expect(page.getByRole("button", { name: "Confirm receipt" })).toBeEnabled();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/warehouse-inbound-workspace.spec.ts`

Expected: FAIL because `/warehouse` currently renders legacy free-text receipt and movement panels.

- [ ] **Step 3: Implement the workspace shell and action gates**

```tsx
const WORK_AREAS = ["label_print", "receive_stock", "put_away", "receipt_history"] as const;

<PartnerInboundWorkspace
  activeScope={scope}
  printGate={printGate}
  receiptState={receiptState}
/>
```

Keep Shipment, selected pallet/carton and expected-unit context fixed above the work area. Label print is always reachable. Receive is disabled until matching Unit Product prints are confirmed. Putaway is disabled until a receipt session has been confirmed. Remove the legacy caller-supplied receiving-location field and legacy direct inbound movement controls from this route.

- [ ] **Step 4: Implement scan-only normal putaway**

```ts
const putawaySchema = z.object({
  productBarcode: z.string().trim().min(1),
  destinationBarcode: z.string().trim().startsWith("DMLOC:"),
  quantity: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
});
```

Resolve `DMLOC:` using `parseWarehouseBarcode`, validate product versus location type, read the available staged quantity server-side, then create a `putaway` movement from `BNE-RECEIVING-STAGING`. A hidden `Manual location entry` recovery action requires a supervisor reason and must not be the default scan path.

- [ ] **Step 5: Run browser checks and full local quality suite**

Run: `npm test && npx playwright test tests/warehouse-label-print.spec.ts tests/warehouse-inbound-workspace.spec.ts tests/warehouse-smoke.spec.ts && npm run typecheck && npm run build`

Expected: all commands exit 0; browser tests prove receipt remains locked before a confirmed print and putaway cannot exceed staged quantity.

- [ ] **Step 6: Commit the inbound workspace**

```powershell
git add components/PartnerInboundWorkspace.tsx components/WarehousePutawayPanel.tsx components/GoodsReceiptPanel.tsx components/ScannerInput.tsx components/WarehouseScannerPanel.tsx app/warehouse/page.tsx app/globals.css app/api/warehouse/putaway/route.ts tests/warehouse-inbound-workspace.spec.ts
git commit -m "feat: add partner inbound operations workspace"
```

## Task 7: Add persisted receipt history with date, time and timezone filters

**Files:**
- Create: `app/api/warehouse/history/route.ts`
- Create: `components/ReceiptHistoryPanel.tsx`
- Create: `lib/warehouseHistory.ts`
- Modify: `components/PartnerInboundWorkspace.tsx`
- Create: `tests/warehouse-history.test.ts`
- Create: `tests/warehouse-history.spec.ts`

- [ ] **Step 1: Write failing history projection tests**

```ts
const history = buildWarehouseHistory({
  events: [{
    createdAt: "2026-08-29T00:45:00.000Z",
    action: "putaway_confirmed",
    actor: "demo-partner-user",
    reference: "BNE-A01-03",
    scope: { shipmentId: "shipment-test-1", cartonNumber: "C001" },
  }],
  timeZone: "Australia/Brisbane",
});

expect(history.rows[0]).toMatchObject({ date: "29 Aug 2026", time: "10:45", reference: "BNE-A01-03" });
```

Browser test:

```ts
await page.getByRole("link", { name: "Receipt history" }).click();
await page.getByLabel("Date from").fill("2026-08-29");
await page.getByLabel("Display timezone").selectOption("Asia/Shanghai");
await expect(page.getByText("08:45")).toBeVisible();
await expect(page.getByText("Putaway confirmed")).toBeVisible();
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npm test -- warehouse-history.test.ts && npx playwright test tests/warehouse-history.spec.ts`

Expected: FAIL because there is no persisted receipt-history projection or timezone-aware UI.

- [ ] **Step 3: Implement read-only history API and projection**

```ts
const historyQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  shipmentId: z.string().uuid().optional(),
  palletNumber: z.string().trim().max(80).optional(),
  cartonNumber: z.string().trim().max(80).optional(),
  sku: z.string().trim().max(120).optional(),
  actor: z.string().trim().max(120).optional(),
  action: z.enum(["print_confirmed", "print_cancelled", "reprint", "receipt_confirmed", "difference_recorded", "putaway_confirmed"]).optional(),
  timeZone: z.enum(["Australia/Brisbane", "Asia/Shanghai"]).default("Australia/Brisbane"),
});
```

```ts
export function buildWarehouseHistory(input: {
  events: Array<{ createdAt: string; action: string; actor: string; reference: string; scope: Record<string, string> }>;
  timeZone: "Australia/Brisbane" | "Asia/Shanghai";
}) {
  return {
    rows: input.events.map((event) => {
      const date = new Date(event.createdAt);
      return {
        ...event,
        date: new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: input.timeZone }).format(date),
        time: new Intl.DateTimeFormat("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: input.timeZone }).format(date),
        timeZone: input.timeZone,
      };
    }),
  };
}
```

Require `warehouse_read`. Query immutable print records, receipt sessions, discrepancies and stock movements. Format from UTC only after filtering. Return date, time, timezone, actor, action, scope, reference and outcome. Never expose customer, GST, payment or dispatch data.

- [ ] **Step 4: Implement the history panel**

Render date-range, shipment, pallet, carton, SKU, actor, action and timezone controls above a grouped table. Rows must retain date and time as distinct visible values, display the selected timezone and link to the immutable detail where available. Provide loading skeleton, `No audit events match this view` empty state and inline error/retry state.

- [ ] **Step 5: Run history regression tests**

Run: `npm test -- warehouse-history.test.ts && npx playwright test tests/warehouse-history.spec.ts && npm run typecheck`

Expected: PASS with the same event stored in UTC displaying as distinct Australia and China local times.

- [ ] **Step 6: Commit receipt history**

```powershell
git add app/api/warehouse/history/route.ts components/ReceiptHistoryPanel.tsx components/PartnerInboundWorkspace.tsx lib/warehouseHistory.ts tests/warehouse-history.test.ts tests/warehouse-history.spec.ts
git commit -m "feat: add partner warehouse audit history"
```

## Final local verification

- [ ] Run `git diff --check` and confirm only intended files are staged in each commit.
- [ ] Run `npm test`, `npm run typecheck` and `npm run build` after the final task.
- [ ] Run `tests/warehouse-label-print.spec.ts`, `tests/warehouse-inbound-workspace.spec.ts`, `tests/warehouse-history.spec.ts` and `tests/warehouse-smoke.spec.ts`.
- [ ] Manually verify the internal page uses English labels, displays test data only and does not expose a product price, GST, payment, carrier dispatch or fitment assertion.
- [ ] Do not execute the v13 migration or push/deploy. Report those as separate approval gates.
