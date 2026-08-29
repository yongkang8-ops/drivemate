# Putaway and Receipt History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scan-led, receipt-scoped putaway action and an immutable inbound audit history to the approved DriveMate Operations Desk.

**Architecture:** A dedicated warehouse putaway repository action moves only a confirmed receipt session's quarantined staging balance to a scanned `DMLOC:` destination. It never accepts a caller-supplied source. A read-only history projection combines immutable print jobs, confirmed receipt sessions (including discrepancies), and putaway movements; it stores/filters in UTC and formats only for the selected display timezone.

**Tech Stack:** Next.js App Router route handlers, React client components, Zod, TypeScript, Vitest, Playwright, Supabase RPC migration kept local only.

**Safety boundary:** The Phase 1 UI remains test-only. No migration is executed, no production Supabase data is changed, and no online ordering, GST, payment, customer dispatch, public availability or physical printing is enabled.

---

### Task 1: Define the controlled staging-putaway and audit contracts

**Files:**
- Create: `lib/warehousePutaway.ts`
- Create: `lib/warehouseHistory.ts`
- Modify: `lib/repository.ts`
- Test: `tests/warehouse-putaway.test.ts`
- Test: `tests/warehouse-history.test.ts`

- [ ] **Step 1: Write failing pure-rule tests**

```ts
expect(prepareWarehousePutaway({
  productBarcode: "DMPGWMOF001",
  destinationBarcode: "DMLOC:BNE-A01-03",
  quantity: 2,
})).toEqual({
  ok: true,
  productBarcode: "DMPGWMOF001",
  destinationLocation: "BNE-A01-03",
  quantity: 2,
});

expect(prepareWarehousePutaway({
  productBarcode: "DMPGWMOF001",
  destinationBarcode: "DMCARTON:C001",
  quantity: 2,
})).toEqual({ ok: false, message: "Scan a DMLOC destination label before putaway." });
```

```ts
const history = buildWarehouseHistory({
  events: [{
    id: "audit-1", createdAt: "2026-08-29T00:45:00.000Z",
    action: "putaway_confirmed", actor: "demo-partner-user",
    reference: "BNE-A01-03", shipmentId: "shipment-test-1",
    cartonNumbers: ["C001"], outcome: "Moved 2 units",
  }],
  timeZone: "Australia/Brisbane",
});
expect(history.rows[0]).toMatchObject({ date: "29 Aug 2026", time: "10:45", reference: "BNE-A01-03" });
```

- [ ] **Step 2: Run focused tests and confirm red**

Run: `npm test -- warehouse-putaway.test.ts warehouse-history.test.ts`

Expected: fail because the helper modules do not yet exist.

- [ ] **Step 3: Add small, shared types and implementations**

Define `WarehousePutawayInput`, `WarehousePutawayResult`, `WarehousePutawayLine`, `WarehouseHistoryEvent`, `WarehouseHistoryQuery`, and `WarehouseHistoryResult` in `lib/repository.ts`. `prepareWarehousePutaway` uses `parseWarehouseBarcode`, rejects location/carton namespace misuse, normalises product and location identifiers, and only accepts positive integers. `buildWarehouseHistory` filters UTC timestamps before deriving separate `date` and `time` fields with `Intl.DateTimeFormat` for `Australia/Brisbane` or `Asia/Shanghai`.

- [ ] **Step 4: Run focused tests and confirm green**

Run: `npm test -- warehouse-putaway.test.ts warehouse-history.test.ts`

Expected: all focused tests pass.

### Task 2: Persist receipt-scoped putaway and audit sources

**Files:**
- Modify: `lib/memoryRepository.ts`
- Modify: `lib/store.ts`
- Modify: `lib/supabaseRepository.ts`
- Create: `supabase/migrations/20260901_v16_warehouse_putaway.sql`
- Test: `tests/warehouse-putaway-repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

```ts
const result = await repository.putAwayWarehouseReceipt({
  shipmentId: "shipment-test-1", cartonNumbers: ["C001"],
  productBarcode: "DMPGWMOF001", destinationLocation: "BNE-A01-03",
  quantity: 2, idempotencyKey: crypto.randomUUID(),
}, { actorId: "demo-partner-user" });
expect(result).toMatchObject({ ok: true, sourceLocation: "BNE-RECEIVING-STAGING", remainingQuantity: 10 });
```

The same test must prove a destination cannot be used before a matching confirmed receipt, and that a request larger than remaining staged quantity is rejected without adding a movement.

- [ ] **Step 2: Run the repository test and confirm red**

Run: `npm test -- warehouse-putaway-repository.test.ts`

Expected: fail because no dedicated receipt-scoped putaway exists.

- [ ] **Step 3: Implement the dedicated action**

Memory mode stores remaining staged quantity per confirmed receipt session and product barcode. On success it reduces only that receipt's remaining quantity, releases the matching aggregate quarantine quantity, and records a `Putaway` movement with source `BNE-RECEIVING-STAGING`, destination and receipt-session reference.

Supabase mode calls `dm_putaway_warehouse_receipt`. The local-only v16 migration locks the receipt session and staging batch `REC-<session-id>`, verifies confirmed status, product barcode, destination, idempotency and remaining quarantined balance, then atomically decreases staging `on_hand` and `quarantine`, increases the destination balance, writes `stock_movements` and adds an immutable `audit_events` row. It must not be run in Production during this task.

- [ ] **Step 4: Add repository history sources**

Implement `listWarehouseHistory(query)` in both repositories. Include: print confirmed/cancelled/reprint records, receipt confirmation, discrepancy reason/type rows, and receipt-scoped putaway records. The memory implementation derives rows from its immutable in-process data. Supabase reads persisted receipt, print and movement rows, converts them to the common event type, then delegates filtering and timezone presentation to `buildWarehouseHistory`.

- [ ] **Step 5: Run the repository and pure-history tests**

Run: `npm test -- warehouse-putaway.test.ts warehouse-putaway-repository.test.ts warehouse-history.test.ts`

Expected: all tests pass, including over-quantity rejection and timezone conversion.

### Task 3: Add authorised warehouse APIs

**Files:**
- Create: `app/api/warehouse/putaway/route.ts`
- Create: `app/api/warehouse/history/route.ts`
- Test: `tests/warehouse-putaway-api.test.ts`

- [ ] **Step 1: Write failing API tests**

```ts
const rejected = await putaway(new Request("https://drivemateparts.com.au/api/warehouse/putaway", {
  method: "POST", headers: { "content-type": "application/json", "x-drivemate-role": "partner" },
  body: JSON.stringify({ productBarcode: "DMPGWMOF001", destinationBarcode: "BNE-A01-03", quantity: 1 }),
}));
expect(rejected.status).toBe(400);
```

The successful case uses `DMLOC:BNE-A01-03`, a confirmed local test receipt and an idempotency key. A GET history request requires `warehouse_read` and returns distinct `date`, `time`, `timeZone`, actor, action, scope, reference and outcome fields.

- [ ] **Step 2: Run API tests and confirm red**

Run: `npm test -- warehouse-putaway-api.test.ts`

Expected: fail because neither route exists.

- [ ] **Step 3: Implement route handlers**

`POST /api/warehouse/putaway` requires request-security validation, Partner `inventory_write`, MFA clearance, Zod validation and a generated idempotency key from the UI. It derives the source only as `BNE-RECEIVING-STAGING`; input has no source-location field. `GET /api/warehouse/putaway` exposes only confirmed receipt lines with remaining staging quantity for the active shipment/carton scope.

`GET /api/warehouse/history` requires `warehouse_read`; it accepts only date, scope, action, SKU, actor and allowed timezone filters. It is read-only and never returns price, GST, payment, customer or dispatch data.

- [ ] **Step 4: Run API tests and confirm green**

Run: `npm test -- warehouse-putaway-api.test.ts`

Expected: all API tests pass.

### Task 4: Implement the approved Operations Desk panels

**Files:**
- Create: `components/WarehousePutawayPanel.tsx`
- Create: `components/ReceiptHistoryPanel.tsx`
- Modify: `components/PartnerInboundWorkspace.tsx`
- Modify: `app/globals.css`
- Test: `tests/warehouse-inbound-workspace.spec.ts`
- Test: `tests/warehouse-history.spec.ts`

- [ ] **Step 1: Write failing browser workflows**

```ts
await page.getByRole("link", { name: "Put away" }).click();
await page.getByLabel("Scan product barcode").fill("DMPGWMOF001");
await page.getByLabel("Scan destination location").fill("DMLOC:BNE-A01-03");
await page.getByLabel("Move quantity").fill("2");
await page.getByRole("button", { name: "Confirm put away" }).click();
await expect(page.getByText("Moved 2 units from BNE-RECEIVING-STAGING to BNE-A01-03.")).toBeVisible();

await page.getByRole("link", { name: "Receipt history" }).click();
await page.getByLabel("Display timezone").selectOption("Asia/Shanghai");
await expect(page.getByText("Putaway confirmed")).toBeVisible();
```

- [ ] **Step 2: Run browser tests and confirm red**

Run: `CI=1 npx playwright test tests/warehouse-inbound-workspace.spec.ts tests/warehouse-history.spec.ts`

Expected: fail because both current links are disabled.

- [ ] **Step 3: Implement the panels and action gates**

Keep the fixed shipment/pallet/carton ribbon. Putaway becomes reachable only if the active scope has a confirmed receipt with remaining staging stock. It uses the approved three-step layout: product scan, `DMLOC:` destination scan, quantity; the source is a non-editable system value. The right summary previews product, system source, scanned destination, quantity and remaining staging balance. No manual location field is rendered.

Receipt History is always reachable as a read-only work area. It has action, carton and date filters plus Brisbane/Shanghai display timezone. Its table keeps Date and Time separate, and visibly includes print status, discrepancy reason/type, receipt reference, movement reference, actor and outcome. Empty and retry states are explicit.

- [ ] **Step 4: Run browser tests and confirm green**

Run: `CI=1 npx playwright test tests/warehouse-label-print.spec.ts tests/warehouse-inbound-workspace.spec.ts tests/warehouse-history.spec.ts tests/warehouse-smoke.spec.ts`

Expected: all workflows pass and the two new links obey their gates.

### Task 5: Verify and commit the combined Task 6 delivery

**Files:** all files above.

- [ ] **Step 1: Run full local verification**

Run: `npm test`, `npm run typecheck`, `npm run build`, and the focused Playwright command from Task 4.

Expected: all commands exit 0.

- [ ] **Step 2: Browser visual verification**

Compare desktop and 390px mobile renders to `.superpowers/brainstorm/19-1787977944/content/operations-desk-putaway-preview.svg` and `operations-desk-receipt-history-preview.svg`. Verify the deep-teal rail, fixed inbound context, scan-first putaway sequence, non-editable staging source, readable date/time history rows and all four mobile work links.

- [ ] **Step 3: Commit only scoped files**

```powershell
git add -- lib/warehousePutaway.ts lib/warehouseHistory.ts lib/repository.ts lib/memoryRepository.ts lib/store.ts lib/supabaseRepository.ts supabase/migrations/20260901_v16_warehouse_putaway.sql app/api/warehouse/putaway/route.ts app/api/warehouse/history/route.ts components/WarehousePutawayPanel.tsx components/ReceiptHistoryPanel.tsx components/PartnerInboundWorkspace.tsx app/globals.css tests/warehouse-putaway.test.ts tests/warehouse-putaway-repository.test.ts tests/warehouse-history.test.ts tests/warehouse-putaway-api.test.ts tests/warehouse-inbound-workspace.spec.ts tests/warehouse-history.spec.ts
git commit -m "feat: add staged putaway and receipt history"
```

Do not stage user-owned untracked files. Do not push, deploy or execute the local-only migration.
