# Warehouse Capability Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and superpowers:test-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Replace broad warehouse inventory mutation access with explicit capabilities enforced consistently in API routes and authenticated UI gates.

**Architecture:** Keep role-to-capability mapping in `lib/auth.ts` as the single policy source. Every API route checks the narrowest capability before parsing or mutating data. Warehouse UI uses the least-privileged `warehouse_staff` demo header, while Partner/Admin inherit the same routine capabilities.

**Tech Stack:** TypeScript, Next.js Route Handlers, React RoleGate, Vitest, Playwright source contracts.

## Capability matrix

| Capability | warehouse_staff | partner | admin | Primary routes |
|---|---:|---:|---:|---|
| `warehouse_label_print` | yes | yes | yes | warehouse product labels, print outcome/reprint, location label print |
| `warehouse_receive` | yes | yes | yes | pre-arrival shipment read, receipt confirmation |
| `warehouse_putaway` | yes | yes | yes | putaway scope, destination resolution, putaway confirmation |
| `warehouse_history_read` | yes | yes | yes | warehouse history |
| `inventory_adjust` | no | yes | yes | manual inventory movement and import |
| `location_manage` | no | yes | yes | location list/create/notes/status |
| `staff_read` | no | yes | yes | Staff list/detail |
| `staff_manage` | no | no | yes | Staff create and lifecycle writes |
| `prearrival_manage` | no | yes | yes | Packing List revision create/confirm |
| `order_dispatch` | no | yes | yes | order dispatch when trading is enabled |
| `warehouse_rma_receive` | no | yes | yes | RMA receipt |

`warehouse_read`, `admin_read` and `admin_write` remain for existing broad Partner/Admin dashboards and administration surfaces. `inventory_write` is removed from the active capability model and API routes.

## Task 1: Capability matrix

**Files:**
- Modify: `lib/auth.ts`
- Modify: `tests/auth.test.ts`

- [ ] Write failing assertions for every new capability and all five roles.
- [ ] Verify RED with `npm test -- --run tests/auth.test.ts`.
- [ ] Add capability literals and exact role arrays.
- [ ] Verify GREEN and TypeScript.

Required warehouse assertions:

```ts
expect(can("warehouse_staff", "warehouse_label_print")).toBe(true);
expect(can("warehouse_staff", "warehouse_receive")).toBe(true);
expect(can("warehouse_staff", "warehouse_putaway")).toBe(true);
expect(can("warehouse_staff", "warehouse_history_read")).toBe(true);
expect(can("warehouse_staff", "inventory_adjust")).toBe(false);
expect(can("warehouse_staff", "location_manage")).toBe(false);
expect(can("warehouse_staff", "staff_read")).toBe(false);
expect(can("warehouse_staff", "staff_manage")).toBe(false);
```

## Task 2: Warehouse routine routes

**Files:**
- Modify: `app/api/warehouse/labels/route.ts`
- Modify: `app/api/warehouse/labels/[jobId]/route.ts`
- Modify: `app/api/warehouse/receipts/route.ts`
- Modify: `app/api/warehouse/putaway/route.ts`
- Modify: `app/api/warehouse/history/route.ts`
- Modify: `app/api/prearrival/shipments/route.ts`
- Modify: `app/api/inventory/locations/resolve/route.ts`
- Modify: `app/api/inventory/locations/print/route.ts`
- Modify: `tests/warehouse-routine-aal1.test.ts`

- [ ] Change tests to use `warehouse_staff` at AAL1 and expect request validation rather than MFA/permission denial.
- [ ] Verify RED before route edits.
- [ ] Replace broad checks with the four routine capabilities.
- [ ] Verify GREEN.

## Task 3: Restricted inventory, location and adjacent workflows

**Files:**
- Modify: `app/api/inventory-movement/route.ts`
- Modify: `app/api/inventory-movement/import/route.ts`
- Modify: `app/api/inventory/locations/route.ts`
- Modify: `app/api/inventory/locations/[locationId]/route.ts`
- Modify: `app/api/inventory/locations/[locationId]/status/route.ts`
- Modify: `app/api/prearrival/shipments/[shipmentId]/revisions/route.ts`
- Modify: `app/api/prearrival/revisions/[revisionId]/confirm/route.ts`
- Modify: `app/api/orders/[orderId]/dispatch/route.ts`
- Modify: `app/api/warehouse/rma/[rmaId]/receive/route.ts`
- Modify: `tests/sensitive-mutation-coverage.test.ts`
- Create: `tests/warehouse-permission-boundaries.test.ts`

- [ ] Write failing denial tests for `warehouse_staff` before route edits.
- [ ] Verify manual adjustment, location mutation, Packing List revision, order dispatch and RMA receipt return 403 before payload validation.
- [ ] Replace broad checks with their dedicated capabilities.
- [ ] Keep `inventory_adjust` under `sensitiveOperationAccessError` so Partner/Admin require Step-up MFA.
- [ ] Verify GREEN.

## Task 4: Staff permissions

**Files:**
- Modify: `app/api/admin/staff/route.ts`
- Modify: `app/api/admin/staff/[userId]/route.ts`
- Modify: `tests/staff-admin-api.test.ts`

- [ ] Write failing tests proving Partner can read, warehouse staff cannot read, Partner cannot write and Admin AAL2 can write.
- [ ] Replace direct role/admin-write checks with `staff_read` and `staff_manage`.
- [ ] Verify GREEN.

## Task 5: UI gate and least-privilege demo headers

**Files:**
- Modify: `components/AuthPanel.tsx`
- Modify: `app/warehouse/page.tsx`
- Modify: `components/PartnerInboundWorkspace.tsx`
- Modify: `components/WarehousePutawayPanel.tsx`
- Modify: `components/ReceiptHistoryPanel.tsx`
- Create: `tests/warehouse-staff-ui-access.test.ts`

- [ ] Write source-contract tests proving `/warehouse` uses `expectedRole="warehouse_staff"` and routine components use `buildApiHeaders("warehouse_staff")`.
- [ ] Verify RED.
- [ ] Add role hierarchy: warehouse workspace allows warehouse_staff, partner and admin.
- [ ] Change routine demo headers to the least-privileged role.
- [ ] Verify GREEN and TypeScript.

## Task 6: Coverage and final QA

**Files:**
- Create: `tests/capability-route-coverage.test.ts`

- [ ] Add a source audit proving no API route uses `inventory_write`.
- [ ] Assert every required capability appears in at least one server route.
- [ ] Run focused tests.
- [ ] Run full Vitest, TypeScript and Next.js Production build.
- [ ] Run `git diff --check` and a secret scan.
- [ ] Preserve the worktree for user acceptance; do not push or deploy.
