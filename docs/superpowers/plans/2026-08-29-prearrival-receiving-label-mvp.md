# Pre-arrival Receiving and Label MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Australia warehouse print labels from a China-confirmed shipment/pallet/carton packing list, confirm actual receipt with either scan-counting or counted quantity, then put stock away by scanning only the product and destination location.

**Architecture:** China-confirmed export data is imported as an expected hierarchy: `Shipment → Pallet → Carton → SKU / expected quantity`. Expected data never changes stock. Australian receipt records actual quantities into the internal `BNE-RECEIVING-STAGING` holding location without a source-location scan; a later putaway moves the received quantity to a scanned `DMLOC:` destination. Print tasks record the selected shipment scope and immutable payload snapshots, but printing itself never changes inventory.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Zod / Vitest / Playwright / Supabase migration prepared locally only / Windows TE344 driver.

---

## Locked operating decisions

- `products.barcode` is the only unit-product barcode in Phase 1.
- China supplies a packing list that records pallet number, carton number, SKU and expected quantity. The source pallet/carton number is retained exactly and is unique only within its shipment; the database owns the permanent internal record IDs.
- Phase 1 does not require China to print or attach DriveMate product, carton or pallet barcode labels.
- Australia may print product labels for all cartons, selected pallets, selected cartons, selected SKU lines, or a full shipment.
- A receiving operator may either scan every labelled unit or scan a product once and enter a manually counted quantity. Both paths must reconcile against the selected carton/shipment expectation and record a discrepancy reason when actual and expected quantities differ.
- Receipt writes to the system-only `BNE-RECEIVING-STAGING` location. Operators do not scan this source location.
- Putaway requires product barcode + destination `DMLOC:` label + confirmed quantity. It must not require a source scan.
- Phase 1 dispatch validates product and quantity only; it does not require a location scan. Real customer dispatch remains outside Pre-trade scope.
- Any print/reprint supports one or many selected pallets, cartons or SKU lines. A reprint requires a reason and is linked to the original print job.

## File structure

- `lib/warehouseLabels.ts` — canonical label templates, barcode namespaces and print-scope types.
- `lib/repository.ts` — contract types for expected shipment packaging, receipt confirmation and scoped label jobs.
- `lib/memoryRepository.ts` — deterministic test implementation of expected shipment and receipt rules.
- `lib/supabaseRepository.ts` — database-backed counterpart after a separately approved migration.
- `supabase/migrations/20260829_v13_prearrival_receiving.sql` — local-only schema changes for expected packaging and receipt scope.
- `supabase/schema.sql` — schema mirror only; it must match the migration.
- `app/api/warehouse/labels/route.ts` — authorised preview and scoped print-job creation.
- `app/api/warehouse/receipts/route.ts` — authorised receipt confirmation with scan-count or counted-quantity mode.
- `components/WarehouseLabelPrint.tsx` — selection, preview, Windows printing and reprint UI.
- `components/GoodsReceiptPanel.tsx` — shipment/pallet/carton receipt and discrepancy UI.
- `components/WarehouseScannerPanel.tsx` — product + target-location-only putaway UI.

## Task 1: Add expected shipment packaging and scoped label selection

**Files:**
- Modify: `lib/warehouseLabels.ts`
- Modify: `lib/repository.ts`
- Modify: `lib/memoryRepository.ts`
- Modify: `lib/supabaseRepository.ts`
- Create: `tests/warehouse-prearrival-receiving.test.ts`

- [ ] **Step 1: Write the failing packing-list test**

```ts
const selection = {
  shipmentId: "shipment-test-1",
  palletNumbers: ["P001"],
};

const expected = await repository.getWarehouseExpectedReceipt(selection);

expect(expected).toMatchObject({
  pallets: [expect.objectContaining({ sourcePalletNumber: "P001" })],
  cartons: [expect.objectContaining({ sourceCartonNumber: "C001" })],
  lines: [expect.objectContaining({ sku: "DM-GWM-OF-001", expectedQuantity: 12 })],
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- warehouse-prearrival-receiving.test.ts`
Expected: FAIL because `getWarehouseExpectedReceipt` and its contract types do not exist.

- [ ] **Step 3: Add the minimal scoped data model**

```ts
export type WarehouseInboundSelection = {
  shipmentId: string;
  palletNumbers?: string[];
  cartonNumbers?: string[];
  skus?: string[];
};

export type WarehouseExpectedReceiptLine = {
  palletNumber: string;
  cartonNumber: string;
  sku: string;
  expectedQuantity: number;
};
```

Normalise selection values, reject a carton/pallet that is not in the selected shipment, and keep source carton/pallet numbers as source data rather than converting them into product barcodes.

- [ ] **Step 4: Add scoped print payload generation**

```ts
export type WarehouseLabelPrintScope = {
  shipmentId: string;
  palletNumbers: string[];
  cartonNumbers: string[];
  skus: string[];
};
```

The generated payload must include `scope`, `templateId`, selected expected lines and the product barcode. It must not include price, GST, VIN or fitment claims.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm test -- warehouse-prearrival-receiving.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit the scoped model**

```bash
git add lib/warehouseLabels.ts lib/repository.ts lib/memoryRepository.ts lib/supabaseRepository.ts tests/warehouse-prearrival-receiving.test.ts
git commit -m "feat: add prearrival shipment receipt scope"
```

## Task 2: Add local-only receipt records and staging inventory rules

**Files:**
- Create: `supabase/migrations/20260829_v13_prearrival_receiving.sql`
- Modify: `supabase/schema.sql`
- Modify: `lib/repository.ts`
- Modify: `lib/memoryRepository.ts`
- Modify: `lib/supabaseRepository.ts`
- Modify: `tests/warehouse-prearrival-receiving.test.ts`

- [ ] **Step 1: Write the failing receipt-mode tests**

```ts
const receipt = await repository.confirmWarehouseReceipt({
  shipmentId: "shipment-test-1",
  cartonNumber: "C001",
  mode: "counted_quantity",
  lines: [{ sku: "DM-GWM-OF-001", actualQuantity: 11, discrepancyReason: "Supplier short packed one unit." }],
});

expect(receipt).toMatchObject({
  ok: true,
  location: "BNE-RECEIVING-STAGING",
  receivedUnlocated: [{ sku: "DM-GWM-OF-001", quantity: 11 }],
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- warehouse-prearrival-receiving.test.ts`
Expected: FAIL because `confirmWarehouseReceipt` does not exist.

- [ ] **Step 3: Implement the two receipt modes**

```ts
type WarehouseReceiptMode = "scan_each" | "counted_quantity";
```

`scan_each` derives `actualQuantity` from scanned `products.barcode` events. `counted_quantity` accepts one resolved SKU plus an integer actual count. Both reject an unknown SKU, a quantity below zero, or a quantity that exceeds expected quantity without a discrepancy reason.

- [ ] **Step 4: Create schema tables locally only**

Create receipt records and receipt-line records that reference the existing shipment/carton data, record expected quantity, actual quantity, discrepancy reason, mode, actor and timestamps. Create/ensure the `BNE-RECEIVING-STAGING` location server-side; do not expose it as a required scanner field.

- [ ] **Step 5: Keep received and putaway stock distinct**

The receipt mutation writes stock to `BNE-RECEIVING-STAGING`. It never creates public availability, a sale, GST amount or dispatch record.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npm test -- warehouse-prearrival-receiving.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit the local receipt model**

```bash
git add supabase/migrations/20260829_v13_prearrival_receiving.sql supabase/schema.sql lib/repository.ts lib/memoryRepository.ts lib/supabaseRepository.ts tests/warehouse-prearrival-receiving.test.ts
git commit -m "feat: add staged warehouse receipt workflow"
```

## Task 3: Build authorised scoped printing and reprint UI

**Files:**
- Create: `app/api/warehouse/labels/route.ts`
- Create: `app/api/warehouse/labels/[jobId]/route.ts`
- Create: `components/WarehouseLabelPrint.tsx`
- Modify: `app/warehouse/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/warehouse-label-print.spec.ts`

- [ ] **Step 1: Write the failing browser test**

```ts
await page.getByLabel("Label shipment").selectOption("shipment-test-1");
await page.getByLabel("Label pallet P001").check();
await page.getByRole("button", { name: "Preview labels" }).click();
await expect(page.getByText("DM-GWM-OF-001")).toBeVisible();
await expect(page.getByText("P001")).toBeVisible();
```

- [ ] **Step 2: Run the browser test to verify it fails**

Run: `npx playwright test tests/warehouse-label-print.spec.ts`
Expected: FAIL because the scoped label UI and API do not exist.

- [ ] **Step 3: Implement API permission boundaries**

`GET` preview requires `warehouse_read` and must reject `mfaRequired`. `POST` print-job creation, outcome recording and reprint require `inventory_write`, an MFA-satisfied context and `mutationRequestAllowed(request)`. All paths use existing `getRequestContext`, `can` and `mutationRequestAllowed` helpers.

- [ ] **Step 4: Implement the print workflow**

The UI offers shipment, pallet, carton, SKU and full-shipment selection; creates a scoped immutable print snapshot; renders fixed-mm English labels; calls `window.print()`; then permits only `printed` or `cancelled` confirmation. Multi-select reprint opens one reason field that is copied into every linked reprint job.

- [ ] **Step 5: Run tests, typecheck and build**

Run: `npm test && npx playwright test tests/warehouse-label-print.spec.ts && npm run typecheck && npm run build`
Expected: all commands exit 0.

- [ ] **Step 6: Commit the print UI**

```bash
git add app/api/warehouse/labels components/WarehouseLabelPrint.tsx app/warehouse/page.tsx app/globals.css tests/warehouse-label-print.spec.ts
git commit -m "feat: add scoped warehouse label printing"
```

## Task 4: Replace free-text putaway with product + destination scanning

**Files:**
- Modify: `components/ScannerInput.tsx`
- Modify: `components/WarehouseScannerPanel.tsx`
- Modify: `app/api/inventory-movement/route.ts`
- Modify: `lib/warehouseLabels.ts`
- Modify: `lib/warehouseLocation.ts`
- Modify: `lib/repository.ts`
- Modify: `lib/memoryRepository.ts`
- Modify: `lib/supabaseRepository.ts`
- Create: `tests/warehouse-scan-putaway.spec.ts`

- [ ] **Step 1: Write the failing putaway browser test**

```ts
await page.getByLabel("Scan putaway SKU").fill("DMPGWMOF001");
await page.getByLabel("Scan destination location").fill("DMLOC:BNE-A01-03");
await page.getByLabel("Move quantity").fill("2");
await page.getByRole("button", { name: "Confirm putaway" }).click();
await expect(page.getByText(/moved to BNE-A01-03/i)).toBeVisible();
```

- [ ] **Step 2: Run the browser test to verify it fails**

Run: `npx playwright test tests/warehouse-scan-putaway.spec.ts`
Expected: FAIL because the current panel accepts free-text movement without the confirmed receiving-staging rule.

- [ ] **Step 3: Implement product and destination-only validation**

Resolve `products.barcode` as `product`; require `DMLOC:` as destination; resolve the source internally to `BNE-RECEIVING-STAGING`; reject unknown product, product used as a location, location used as product, invalid destination, or quantity above received-unlocated stock.

- [ ] **Step 4: Preserve supervised recovery**

Permit compact `BNE-A01-03` only through an explicit `Manual location entry` action that records a supervisor reason. Normal scanner flow must require `DMLOC:`.

- [ ] **Step 5: Run full verification**

Run: `npm test && npx playwright test tests/warehouse-scan-putaway.spec.ts tests/warehouse-smoke.spec.ts && npm run typecheck && npm run build`
Expected: all commands exit 0.

- [ ] **Step 6: Commit the putaway flow**

```bash
git add components/ScannerInput.tsx components/WarehouseScannerPanel.tsx app/api/inventory-movement/route.ts lib/warehouseLabels.ts lib/warehouseLocation.ts lib/repository.ts lib/memoryRepository.ts lib/supabaseRepository.ts tests/warehouse-scan-putaway.spec.ts
git commit -m "feat: add staged scan-to-location putaway"
```

## Excluded from this plan

- Production Supabase migration execution.
- GitHub push or Vercel deployment.
- Real customer orders, actual dispatch, payments, GST and carrier API operations.
- China-side DriveMate barcode printing or supplier label application.
- Browser USB / raw TSPL printing and a Windows print agent.

## Plan review

- Each incoming label task maps to the approved `Shipment → Pallet → Carton → SKU` hierarchy.
- The flow contains both permitted receipt modes and no required source-location scan.
- Print scope and reprint reasons are represented in immutable audit data.
- No task enables trade, payment, public fulfilment or GST.
