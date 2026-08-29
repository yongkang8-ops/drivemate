# Inventory Location Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build a real, extensible Inventory and Locations workspace that creates, prints, maintains and validates active DMLOC warehouse destinations for DriveMate putaway.

**Architecture:** Extend the existing inventory_locations record with an immutable location code, derived barcode, status, physical description, notes and a system-only destination flag. A repository contract provides matching lifecycle rules in Memory and Supabase modes. Location-label printing reuses immutable warehouse print jobs; putaway keeps BNE-RECEIVING-STAGING as its registered server-only source and validates a registered active physical destination at every layer.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Vitest, Playwright, existing Phosphor icons, existing warehouse print-job tables, existing inventory locations and one local-only Supabase migration.

---

## Scope and safety gates

- Build real-business-ready location functionality; do not restrict it to test SKU, test receipt or test inventory behaviour.
- Memory mode exists only for local automated-quality verification and models the same location lifecycle as Supabase.
- Do not execute a migration, write Production Supabase locations, push GitHub, deploy Vercel, enable trading or change GST.
- Partner and administrator accounts share the same location-management operation capability.
- Only a confirmed Unit Product job unlocks receipt. Bin/Location printing never changes receipt state.

## File structure

| File | Responsibility |
|---|---|
| lib/inventoryLocations.ts | Pure canonical-code, batch-list and barcode rules. |
| lib/warehouseLabels.ts | Existing barcode helper compatibility and fixed template family definitions. |
| lib/repository.ts | InventoryLocation types and lifecycle contract. |
| lib/memoryRepository.ts | Local lifecycle, location balance and active destination resolution. |
| lib/supabaseRepository.ts | Persisted lifecycle, balance query and active destination resolution. |
| supabase/migrations/20260902_v17_inventory_location_master.sql | Local-only schema extension, audit rows and server-side destination guard. |
| app/api/inventory/locations | List, create, edit, status, resolve and print routes. |
| components/InventoryLocationPanel.tsx | Register, notes, selection, label preview and print workflow. |
| app/inventory/page.tsx | Partner-protected Inventory and Locations page. |
| components/WarehousePutawayPanel.tsx | Verified destination scan feedback. |
| tests/inventory-locations.test.ts | Pure rules and repository lifecycle. |
| tests/inventory-locations-api.test.ts | API access and immutable location label jobs. |
| tests/inventory-locations.spec.ts | Browser workflow and requested local page preview. |

## Task 1: Canonical code and batch validation

**Files:**
- Create: lib/inventoryLocations.ts
- Create: tests/inventory-locations.test.ts
- Modify: lib/warehouseLabels.ts
- Modify: lib/warehouseLocation.ts
- Modify: tests/warehouseLabels.test.ts
- Modify: tests/warehouse-location.test.ts

- [ ] **Step 1: Write failing pure-rule tests**

~~~ts
import {
  parseInventoryLocationCode,
  parseLocationCodeBatch,
} from "../lib/inventoryLocations";

it("creates the immutable DMLOC identity for a canonical Brisbane location", () => {
  expect(parseInventoryLocationCode(" bne-a01-03 ")).toEqual({
    ok: true,
    locationCode: "BNE-A01-03",
    barcode: "DMLOC:BNE-A01-03",
    warehouse: "Brisbane",
    zone: "A01",
    binCode: "03",
  });
});

it("rejects an invalid reviewed batch line", () => {
  expect(parseLocationCodeBatch("BNE-A01-01\nbne-a01-01\nAISLE-A")).toEqual({
    ok: false,
    message: "Line 3 must use a canonical BNE location code.",
  });
});
~~~

- [ ] **Step 2: Verify the test is RED**

Run: npm test -- inventory-locations.test.ts warehouseLabels.test.ts warehouse-location.test.ts

Expected: FAIL because inventoryLocations.ts does not exist.

- [ ] **Step 3: Implement the pure module**

~~~ts
export type ParsedInventoryLocationCode = {
  ok: true;
  locationCode: string;
  barcode: string;
  warehouse: "Brisbane";
  zone: string;
  binCode: string;
};

const locationCodePattern = /^BNE-([A-Z0-9]+(?:-[A-Z0-9]+){0,2})-([A-Z0-9]+)$/;

export function parseInventoryLocationCode(value: string) {
  const locationCode = value.trim().toUpperCase().replace(/\s+/g, "");
  const match = locationCode.match(locationCodePattern);
  if (!match) {
    return { ok: false as const, message: "Location code must use the BNE-<segment>-<segment> format." };
  }
  return {
    ok: true as const,
    locationCode,
    barcode: "DMLOC:" + locationCode,
    warehouse: "Brisbane" as const,
    zone: match[1],
    binCode: match[2],
  };
}
~~~

Move the existing reserved location-barcode creator into this module and re-export it from warehouseLabels.ts. Update parseWarehouseLocation so every segment between BNE and the final segment becomes zone. This preserves BNE-A01-03 and supports BNE-A-01-03 without assigning compulsory physical hierarchy meaning.

- [ ] **Step 4: Verify the test is GREEN**

Run: npm test -- inventory-locations.test.ts warehouseLabels.test.ts warehouse-location.test.ts

Expected: PASS; existing DMLOC parsing remains unchanged.

- [ ] **Step 5: Commit**

~~~powershell
git add lib/inventoryLocations.ts lib/warehouseLabels.ts lib/warehouseLocation.ts tests/inventory-locations.test.ts tests/warehouseLabels.test.ts tests/warehouse-location.test.ts
git diff --cached --check
git commit -m "feat: define canonical inventory locations"
~~~

## Task 2: Location-master repository lifecycle and local migration

**Files:**
- Modify: lib/repository.ts
- Modify: lib/memoryRepository.ts
- Modify: lib/supabaseRepository.ts
- Modify: supabase/schema.sql
- Create: supabase/migrations/20260902_v17_inventory_location_master.sql
- Modify: tests/inventory-locations.test.ts

- [ ] **Step 1: Write failing lifecycle tests**

~~~ts
it("prevents disabling a location with stock", async () => {
  const created = await repository.createInventoryLocations({
    locationCodes: ["BNE-A01-03"],
  }, { actorId: "demo-partner-user" });

  await confirmReceiptAndPutAway(repository, "BNE-A01-03");
  await expect(repository.setInventoryLocationStatus(
    created.locations[0].id,
    "archived",
    { actorId: "demo-partner-user" },
  )).resolves.toEqual({
    ok: false,
    message: "Locations with stock cannot be disabled or archived.",
  });
});
~~~

- [ ] **Step 2: Verify the test is RED**

Run: npm test -- inventory-locations.test.ts

Expected: FAIL because the location lifecycle contract does not exist.

- [ ] **Step 3: Add the repository contract**

~~~ts
export type InventoryLocationStatus = "active" | "disabled" | "archived";
export type InventoryLocation = {
  id: string;
  locationCode: string;
  barcode: string;
  status: InventoryLocationStatus;
  isPutawayDestination: boolean;
  physicalDescription?: string;
  notes?: string;
  currentBalance: number;
  createdAt: string;
  createdBy?: string;
  updatedAt: string;
  updatedBy?: string;
};

listInventoryLocations(input?: {
  search?: string;
  status?: InventoryLocationStatus;
  barcode?: string;
}): Promise<{ ok: true; locations: InventoryLocation[] }>;

createInventoryLocations(input: {
  locationCodes: string[];
}, context?: RepositoryWriteContext): Promise<
  { ok: true; locations: InventoryLocation[] } | { ok: false; message: string }
>;

updateInventoryLocation(id: string, input: {
  physicalDescription?: string;
  notes?: string;
}, context?: RepositoryWriteContext): Promise<
  { ok: true; location: InventoryLocation } | { ok: false; message: string }
>;

setInventoryLocationStatus(id: string, status: InventoryLocationStatus, context?: RepositoryWriteContext): Promise<
  { ok: true; location: InventoryLocation } | { ok: false; message: string }
>;

resolveActiveInventoryLocation(barcode: string): Promise<
  { ok: true; location: InventoryLocation } | { ok: false; message: string }
>;
~~~

- [ ] **Step 4: Implement Memory and Supabase parity**

Memory mode stores active, disabled and archived records plus audit entries in module state and clears them through resetForTests. Its current balance derives from confirmed putaway records.

Supabase mode displays current balance with coalesce(sum(inventory_balances.on_hand), 0), groups by location and inserts an audit_events row for create, note edit and status change. A disabled or archived transition returns Locations with stock cannot be disabled or archived when any on_hand, reserved or quarantine balance exists.

Create the local-only migration with this schema core:

~~~sql
alter table public.inventory_locations
  add column if not exists location_code text,
  add column if not exists barcode text,
  add column if not exists status text not null default 'active'
    check (status in ('active', 'disabled', 'archived')),
  add column if not exists is_putaway_destination boolean not null default true,
  add column if not exists physical_description text,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now();

update public.inventory_locations
set location_code = case
      when warehouse = 'Brisbane' then 'BNE-' || zone || '-' || bin_code
      else upper(warehouse) || '-' || zone || '-' || bin_code
    end,
    barcode = 'DMLOC:' || case
      when warehouse = 'Brisbane' then 'BNE-' || zone || '-' || bin_code
      else upper(warehouse) || '-' || zone || '-' || bin_code
    end
where location_code is null or barcode is null;

create unique index if not exists inventory_locations_location_code_unique
  on public.inventory_locations(location_code);
create unique index if not exists inventory_locations_barcode_unique
  on public.inventory_locations(barcode);
~~~

Backfill BNE-RECEIVING-STAGING as active with is_putaway_destination = false so it remains a valid system source but cannot be used as a scan destination. Add a database trigger that rejects updates to location_code, barcode, warehouse, zone and bin_code after creation. Update the v15 receipt-confirmation function in this migration to look up the pre-registered staging source instead of inserting it after identity columns become required. Synchronise the audit_events DDL snapshot in supabase/schema.sql.

- [ ] **Step 5: Verify the lifecycle is GREEN**

Run: npm test -- inventory-locations.test.ts warehouse-putaway-repository.test.ts

Expected: PASS; active lookup works, descriptions do not alter identity and stock blocks disable/archive.

- [ ] **Step 6: Commit**

~~~powershell
git add lib/repository.ts lib/memoryRepository.ts lib/supabaseRepository.ts supabase/schema.sql supabase/migrations/20260902_v17_inventory_location_master.sql tests/inventory-locations.test.ts
git diff --cached --check
git commit -m "feat: add inventory location master"
~~~

## Task 3: Guarded APIs and immutable location-label jobs

**Files:**
- Create: app/api/inventory/locations/route.ts
- Create: app/api/inventory/locations/[locationId]/route.ts
- Create: app/api/inventory/locations/[locationId]/status/route.ts
- Create: app/api/inventory/locations/print/route.ts
- Create: tests/inventory-locations-api.test.ts
- Modify: app/api/warehouse/labels/[jobId]/route.ts

- [ ] **Step 1: Write failing API coverage**

~~~ts
const response = await createLocations(new Request("https://drivemateparts.com.au/api/inventory/locations", {
  method: "POST",
  headers: { "content-type": "application/json", "x-drivemate-role": "partner" },
  body: JSON.stringify({ locationCodes: ["BNE-A01-03", "BNE-A01-04"] }),
}));
expect(response.status).toBe(201);

const print = await printLocations(new Request("https://drivemateparts.com.au/api/inventory/locations/print", {
  method: "POST",
  headers: { "content-type": "application/json", "x-drivemate-role": "partner" },
  body: JSON.stringify({ locationIds: [createdId] }),
}));
await expect(print.json()).resolves.toMatchObject({
  ok: true,
  job: { templateId: "bin_location", status: "pending" },
  items: [expect.objectContaining({
    payloadSnapshot: {
      locationCode: "BNE-A01-03",
      barcode: "DMLOC:BNE-A01-03",
    },
  })],
});
~~~

- [ ] **Step 2: Verify the API test is RED**

Run: npm test -- inventory-locations-api.test.ts

Expected: FAIL because the route tree is absent.

- [ ] **Step 3: Implement route schemas and access gates**

Use requestCan(request, "warehouse_read") for list and resolve. Use mutationRequestAllowed, getRequestContext, can(role, "inventory_write") and the current MFA rule for every mutation.

~~~ts
const createSchema = z.object({
  locationCodes: z.array(z.string().trim().min(1).max(80)).min(1).max(500),
}).strict();

const updateSchema = z.object({
  physicalDescription: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(2000).optional(),
}).strict();

const statusSchema = z.object({
  status: z.enum(["active", "disabled", "archived"]),
}).strict();

const printSchema = z.object({
  locationIds: z.array(z.string().uuid()).min(1).max(500),
}).strict();
~~~

The print route loads selected active locations, creates a bin_location job and appends one immutable item snapshot per location:

~~~ts
{
  scopeKind: "location",
  locationId: location.id,
  locationCode: location.locationCode,
  barcode: location.barcode,
}
~~~

Reuse the existing warehouse label job outcome/reprint route. Reprints copy original location payloads, require a reason and never modify locations. Unit Product receipt-gate logic remains untouched.

- [ ] **Step 4: Verify the API test is GREEN**

Run: npm test -- inventory-locations-api.test.ts warehouse-label-audit.test.ts

Expected: PASS; public/trade access returns 403, Partner/admin operations work and print snapshots are immutable.

- [ ] **Step 5: Commit**

~~~powershell
git add app/api/inventory/locations app/api/warehouse/labels/[jobId]/route.ts tests/inventory-locations-api.test.ts
git diff --cached --check
git commit -m "feat: add inventory location APIs"
~~~

## Task 4: Build the requested local operational page preview

**Files:**
- Create: components/InventoryLocationPanel.tsx
- Create: app/inventory/page.tsx
- Modify: components/PartnerDashboard.tsx
- Modify: app/layout.tsx
- Modify: app/globals.css
- Create: tests/inventory-locations.spec.ts

- [ ] **Step 1: Write the failing browser workflow**

~~~ts
test("Partner creates locations, records their physical placement and confirms a label print", async ({ page }) => {
  await page.goto("/inventory");
  await page.getByLabel("Location code batch").fill("BNE-A01-03\nBNE-A01-04");
  await page.getByRole("button", { name: "Preview 2 locations" }).click();
  await page.getByRole("button", { name: "Create 2 locations" }).click();
  await page.getByRole("row", { name: /BNE-A01-03/ }).click();
  await page.getByLabel("Physical description").fill("Rear wall, rack 2, middle shelf");
  await page.getByRole("button", { name: "Save location notes" }).click();
  await page.getByLabel("Select BNE-A01-03").check();
  await page.getByRole("button", { name: "Preview location labels" }).click();
  await expect(page.getByText("DMLOC:BNE-A01-03")).toBeVisible();
  await page.getByRole("button", { name: "Print location labels" }).click();
  await page.getByRole("button", { name: "Confirm printed" }).click();
  await expect(page.getByText("Location label print confirmed.")).toBeVisible();
});
~~~

- [ ] **Step 2: Verify the browser workflow is RED**

Run: $env:CI='1'; npx playwright test tests/inventory-locations.spec.ts --project=edge

Expected: FAIL because /inventory and InventoryLocationPanel do not exist.

- [ ] **Step 3: Implement the operational page**

The client component owns list/filter response, selected location IDs, reviewed batch codes, selected location detail, print job, reprint reason, message and busy state. It renders exactly these areas:

~~~text
Inventory & locations
  Active | Disabled | Label confirmations pending | Locations holding stock

Create locations
  Single code or multiline reviewed batch -> exact DMLOC preview -> create

Location register
  select | code | physical description | status | balance | label audit | actions

Location detail and printing
  immutable code + DMLOC | editable description + notes
  selected active locations -> Bin / Location -> preview -> Windows print -> outcome
~~~

Render the 100 x 50 mm preview with JsBarcode CODE128, DriveMate brand, readable code and human-readable barcode text. Call window.print only after the server created a pending job. Then require Printed or Cancelled through the existing print-job endpoint; show reprint reason only for the current location job.

The protected page uses RoleGate expectedRole="partner" and no-index metadata. Add Inventory & locations to the dashboard sidebar and development internal navigation. Use an inventory-location-app CSS namespace with deep-teal navigation, dense desktop rows and readable mobile cards.

- [ ] **Step 4: Verify the browser workflow is GREEN**

Run: $env:CI='1'; npx playwright test tests/inventory-locations.spec.ts --project=edge

Expected: PASS; local page preview creates the records, saves the note, previews DMLOC and records a confirmed print outcome.

- [ ] **Step 5: Inspect the local preview**

Run the app in local Memory mode with internal navigation. Inspect /inventory on a 1440px desktop and 390px mobile view, then perform one batch-create -> note-save -> label-confirmed flow. Reset the viewport and close temporary browser tabs afterward.

- [ ] **Step 6: Commit**

~~~powershell
git add components/InventoryLocationPanel.tsx app/inventory/page.tsx components/PartnerDashboard.tsx app/layout.tsx app/globals.css tests/inventory-locations.spec.ts
git diff --cached --check
git commit -m "feat: add inventory location workspace"
~~~

## Task 5: Make active registered destinations mandatory for putaway

**Files:**
- Modify: app/api/warehouse/putaway/route.ts
- Modify: app/api/inventory-movement/route.ts
- Modify: components/WarehousePutawayPanel.tsx
- Modify: lib/memoryRepository.ts
- Modify: lib/supabaseRepository.ts
- Modify: supabase/migrations/20260902_v17_inventory_location_master.sql
- Modify: tests/warehouse-putaway.test.ts
- Modify: tests/warehouse-putaway-api.test.ts
- Modify: tests/warehouse-putaway-repository.test.ts
- Modify: tests/warehouse-inbound-workspace.spec.ts

- [ ] **Step 1: Write failing active-destination coverage**

~~~ts
await expect(repository.putAwayWarehouseReceipt({
  ...selection,
  productBarcode: "DMPGWMOF001",
  destinationLocation: "BNE-A01-03",
  quantity: 1,
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
})).resolves.toEqual({
  ok: false,
  message: "Destination location BNE-A01-03 is not an active registered putaway destination.",
});
~~~

Update each positive putaway test helper to create BNE-A01-03 through createInventoryLocations before the putaway call.

- [ ] **Step 2: Verify the putaway tests are RED**

Run: npm test -- warehouse-putaway.test.ts warehouse-putaway-api.test.ts warehouse-putaway-repository.test.ts

Expected: FAIL because syntactically valid but unregistered destinations are currently accepted.

- [ ] **Step 3: Implement application and database enforcement**

Keep prepareWarehousePutaway responsible only for product namespace, DMLOC namespace and positive whole quantity. Each repository resolves an active location before moving stock and records its immutable locationCode as destination.

Replace the automatic destination insertion in the local-only dm_putaway_warehouse_receipt migration with an active master lookup before balance updates:

~~~sql
select id into v_destination_location_id
from public.inventory_locations
where location_code = upper(trim(p_destination_location_code))
  and status = 'active'
  and is_putaway_destination = true
for update;

if v_destination_location_id is null then
  raise exception 'Destination location is not an active registered putaway destination';
end if;
~~~

Update the RPC signature and Supabase call to pass p_destination_location_code. Preserve receipt-session, source-location, quarantine, idempotency and audit checks. Explicitly revoke public execution then grant execution to service_role. Prevent the legacy generic inventory-movement route from accepting type putaway, with an actionable response requiring the receipt-scoped Warehouse Put away workflow; this removes the v11 bypass that could otherwise auto-create an unregistered location.

WarehousePutawayPanel performs a guarded resolution read after a DMLOC scan. Its primary button is enabled only after active status resolves; POST stays authoritative if a status changes between scan and submit.

- [ ] **Step 4: Verify the putaway tests are GREEN**

Run: npm test -- warehouse-putaway.test.ts warehouse-putaway-api.test.ts warehouse-putaway-repository.test.ts warehouse-receipt-api.test.ts

Expected: PASS; active physical destinations receive staged stock while unknown, disabled, archived and system-source-only locations never do.

- [ ] **Step 5: Commit**

~~~powershell
git add app/api/warehouse/putaway/route.ts app/api/inventory-movement/route.ts components/WarehousePutawayPanel.tsx lib/memoryRepository.ts lib/supabaseRepository.ts supabase/migrations/20260902_v17_inventory_location_master.sql supabase/schema.sql tests/warehouse-putaway.test.ts tests/warehouse-putaway-api.test.ts tests/warehouse-putaway-repository.test.ts tests/warehouse-inbound-workspace.spec.ts
git diff --cached --check
git commit -m "feat: validate active putaway locations"
~~~

## Task 6: Final verification and Production activation handoff

**Files:**
- Modify only explicitly reviewed verification-fix files from Tasks 1-5.

- [ ] **Step 1: Run focused unit and API tests**

Run: npm test -- inventory-locations.test.ts inventory-locations-api.test.ts warehouseLabels.test.ts warehouse-location.test.ts warehouse-label-audit.test.ts warehouse-putaway.test.ts warehouse-putaway-api.test.ts warehouse-putaway-repository.test.ts warehouse-dashboard.test.ts partner-dashboard-api.test.ts

Expected: PASS.

- [ ] **Step 2: Run browser regression**

Run: $env:CI='1'; npx playwright test tests/inventory-locations.spec.ts tests/warehouse-inbound-workspace.spec.ts tests/warehouse-label-print.spec.ts tests/warehouse-history.spec.ts tests/partner-dashboard.spec.ts --project=edge

Expected: PASS. Verify a location-label print never unlocks receipt and dashboard values continue to exclude commercial data.

- [ ] **Step 3: Run type, build and staging checks**

~~~powershell
npm run typecheck
npm run build
git diff --check
git status --short
~~~

Expected: TypeScript and production build exit 0; no user-owned untracked file is staged.

- [ ] **Step 4: Keep a final commit boundary**

If a verification change is necessary, amend the named commit for the task whose file changed. Stage that exact file path, run git diff --cached --check, and do not create an empty verification commit. Do not stage any existing user-owned untracked file.

- [ ] **Step 5: Request Production activation separately**

Report that supabase/migrations/20260902_v17_inventory_location_master.sql was created locally but not run. Before any Production action, request explicit authorisation for two distinct writes: executing that migration in Supabase project gajrgqiwvgjrrbildwme, and creating the first named real location-code batch. Do not combine those writes with GitHub or Vercel actions.

## Plan self-review

- **Spec coverage:** Tasks 1-2 implement immutable code/barcode, editable notes, status, balance and audit; Task 3 implements immutable Bin label jobs; Task 4 delivers the requested local preview; Task 5 makes master data authoritative for putaway; Task 6 covers regression and the separate Production gate.
- **Scope:** No mandatory rack hierarchy, capacity, route optimisation, sales, GST, payment, public availability or dispatch is introduced.
- **Type consistency:** InventoryLocation, InventoryLocationStatus, locationCode, barcode, physicalDescription, notes and resolveActiveInventoryLocation keep the same meaning across all tasks.
- **Placeholder scan:** No incomplete feature marker is present. Every planned changed file has a named task and an explicit verification command.
