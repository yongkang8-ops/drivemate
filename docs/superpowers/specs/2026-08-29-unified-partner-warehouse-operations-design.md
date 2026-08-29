# Unified Partner Warehouse Operations Design

**Status:** Confirmed decision baseline, pending written-spec review and final Dashboard visual approval before implementation planning
**Date:** 2026-08-29
**Project:** DriveMate Parts
**Business phase:** Pre-trade
**Scope:** Internal shipment, label, receiving, inventory-location and audit workflows. This specification does not enable online trading, real customer orders, GST, payment, customer dispatch, carrier labels or production database changes.

## 1. Purpose

Define one operational workspace for all DriveMate partners, independent of whether a partner is working from China or Australia. The workspace supports the confirmed inbound flow:

```text
China export data confirmed
  -> Shipment / Pallet / Carton / SKU expected quantity
  -> Australia selects a physical scope
  -> Product labels printed and operator-confirmed
  -> Receive by scanning each unit or by counted quantity
  -> System writes confirmed stock to BNE-RECEIVING-STAGING
  -> Scan product + DMLOC destination + quantity for putaway
  -> Immutable history and dashboard reflect successful server events
```

The UI language for warehouse work and printed labels is English. Conversation and internal design documentation may be Chinese.

## 2. Locked operating rules

- `products.barcode` is the Phase 1 unit-product barcode. It identifies a SKU, not an individual serialised physical unit.
- The export packing list records source pallet number, source carton number, SKU and expected quantity. Source values remain source data and are not converted into product-fitment evidence.
- Phase 1 does not require China to apply DriveMate labels to products, cartons or pallets.
- Australia may select a full shipment, one or more pallets, cartons or SKU lines for label preparation and receiving.
- Product labels must be operator-confirmed as `Printed` before receipt is unlocked for the corresponding scope. Preview, pending print and cancelled print jobs do not unlock receipt.
- Reprints must retain the original job relationship, create a new auditable print job and require a reason.
- Receipt supports `scan_each` and `counted_quantity`. A difference requires a reason before receipt confirmation.
- A successful receipt writes stock only to internal `BNE-RECEIVING-STAGING`. The operator does not scan a source location.
- Putaway requires product barcode, `DMLOC:` destination barcode and quantity. The system resolves the staging source internally.
- Part identity, vehicle identity and parts fitment remain separate. No label or screen may present VIN/Rego data as confirmed fitment without approved evidence.

## 3. Roles and accountability

### 3.1 Partner

All partner accounts use the same functional permission set regardless of location, nationality or timezone. Partner accounts can:

- View the operations dashboard, active shipment data, inventory, labels and history.
- Create and revise pre-arrival shipment and packing-list data.
- Select operational scope, prepare labels, confirm physical printing, reprint with a reason, receive, put away and inspect history.
- Create, edit, publish and archive label templates and template versions.

Each action records the authenticated actor, saved timestamp and relevant scope. Location or timezone never changes the authorisation result.

### 3.2 Administrator

The administrator inherits all Partner capabilities and additionally manages system-level concerns such as account access, roles, authentication requirements, system configuration and protected master-data controls. Administrators do not rewrite completed warehouse events, prior print snapshots, receipt records or audit history.

## 4. Information architecture

```text
Partner workspace
├─ Dashboard
├─ Pre-arrival shipments
├─ Inbound operations
│  ├─ Label print
│  ├─ Receive stock
│  │  ├─ Scan each unit
│  │  └─ Counted quantity
│  ├─ Put away
│  └─ Receipt history
├─ Inventory and locations
│  ├─ Stock by location / staging
│  └─ DMLOC location-label management
└─ Label library
   ├─ Template catalogue
   ├─ Template editor and preview
   ├─ Draft / Approved / Archived versions
   └─ Print-job template selection
```

Real dispatch, carrier integration, payments and GST are excluded from the visible Phase 1 operational route. The dispatch template may be retained in the template library as a planned label family but cannot create real carrier labels or customer dispatch.

## 5. Dashboard: provisional inbound pipeline command board

The provisional visual direction is the inbound-pipeline command board. It replaces generic metric-card emphasis with a workflow and exception hierarchy.

### 5.1 Header and context

- Current saved-data timestamp, selected display timezone and optional date-range filter.
- Partner identity shown as contextual information only, not a regional role.
- Data freshness is the most recent successful server event. Unsaved scanner input is never presented as real-time stock.

### 5.2 Primary panels

1. **Inbound pipeline**
   - Export packing confirmed.
   - In transit or arrived.
   - Australia label preparation.
   - Print confirmed.
   - Receiving in progress.
   - `BNE-RECEIVING-STAGING`.
   - Located.
   - Stage counts may include shipment count and confirmed unit quantity.

2. **Shipment worklist**
   - Shipment reference, packing-list version, source pallet/carton count, expected quantity, confirmed actual quantity, current stage, exception indicator, last saved event and next action.
   - Filters: shipment reference, SKU, status, date range and display timezone.
   - Rows navigate to the scoped shipment or inbound operation. The dashboard does not perform receipt or putaway directly.

3. **Priority exception queue**
   - Pending physical print confirmation.
   - Incomplete receipt.
   - Short, excess, damaged, unknown-SKU or wrong-scope events.
   - Staging stock awaiting putaway, including age since receipt confirmation.
   - Each item presents a direct next action and never silently changes stock.

4. **Latest confirmed activity**
   - Date, time, timezone, actor, action, reference and result.
   - Only persisted business events appear. Scanner-read feedback and local drafts do not appear.

5. **Inventory posture**
   - Expected inbound quantity, unlocated staging quantity and located quantity.
   - No revenue, sale, public stock-availability, customer, GST or payment figures in Pre-trade.

### 5.3 Visual rules

- Deep teal indicates a primary action or confirmed operating state.
- Amber identifies an exception that needs a person to act.
- White and cool neutral surfaces support dense scanning of rows and quantities.
- Use compact grouped tables and stage ribbons, not decorative dashboards, large charts or generic scorecards.
- Initial data volume does not justify trend charts. A received-versus-putaway trend may be considered after sufficient operational history exists.

## 6. Pre-arrival shipment workspace

### 6.1 Required fields and structure

- Shipment reference and supplier reference.
- Packing-list version and confirmation timestamp.
- Original pallet numbers and original carton numbers.
- Carton lines: SKU, `products.barcode`, expected quantity and optional controlled batch/lot fields.
- Export confirmation state and a revision chain.

### 6.2 Validation

- Every carton belongs to exactly one pallet in the selected shipment.
- Every line resolves to a recognised product and has a positive expected quantity.
- A confirmed packing-list version is immutable. Later edits create a new version and keep the former version and confirmation event.
- Australian label preparation uses the selected confirmed version. It never changes stock.

## 7. Label library and governed template editor

### 7.1 Template catalogue

The library starts with four known label families:

| Family | Nominal size | Phase 1 status | Required identifier |
|---|---:|---|---|
| Unit Product | 70 x 50 mm | Active | `products.barcode` Code 128 |
| Receiving / Carton | 100 x 80 mm | Available, optional | `DMCARTON:` after carton-label activation |
| Bin / Location | 100 x 50 mm | Active before putaway | `DMLOC:` Code 128 |
| Dispatch / Shipping | 100 x 150 mm | Library only, no real dispatch | Internal shipment reference only; carrier zone remains unavailable |

### 7.2 Template lifecycle

```text
System base -> Draft version -> Approved version -> Archived
```

- A system base is a safe starting point, not a record that can be overwritten.
- Editing creates a new version. A published version may be superseded or archived but historical print jobs retain their original content snapshot.
- Partners and administrators can create, edit, publish and archive versions.
- A template in use by a print job cannot be deleted. It may be archived for future selection.

### 7.3 Editor controls

```text
Field/component palette | true-size mm preview | properties panel
```

- The palette contains only type-compatible components and approved data fields.
- Components include static English text, brand, controlled data fields, Code 128, optional QR where its destination is stable, divider and approved status text.
- The preview uses the selected printer size and printable margin. Direct TSPL, raw HTML and browser USB printing are excluded from Phase 1.
- The editor validates label width, height, barcode quiet zone, human-readable text, print-safe margins and data-field availability before publishing.

### 7.4 Content boundaries

- Unit-product labels use controlled English product name, DriveMate part number, OEM/MPN, batch/lot when known, quantity, origin when approved, Code 128 and optional stable QR.
- Unit-product labels must not add unverified vehicle fitment, VIN/Rego result, price, GST, stock claim, warranty promise or OEM-authorisation claim.
- Location labels retain a unique `DMLOC:` identifier and readable location code.
- Carton labels retain source carton context and, only once activated, a controlled `DMCARTON:` identifier. Carton labels do not replace product labels.
- Shipping templates do not create carrier routing labels. A carrier-provided zone is a later, separately approved integration.

## 8. Print-module selection model

```text
Current task scope
  -> Label family
    -> Approved template version
      -> Preview
        -> Windows print dialog
          -> Operator confirms Printed or Cancelled
```

- Changing family or template never changes receipt scope, inventory or prior print audit.
- Inbound tasks may choose Unit Product or optional Receiving / Carton templates when their source data exists.
- Location templates are selected from Inventory and Locations after a location record is created.
- Shipping templates are visible in the library but disabled for real dispatch during Pre-trade.
- Print confirmation gates receipt only where a Unit Product print job covers the active receipt scope.

## 9. Receiving, putaway and exception handling

### 9.1 Receipt modes

- **Scan each unit:** scanner events resolve `products.barcode`; only a saved count is treated as received.
- **Counted quantity:** scan once to identify the product, then enter a positive actual quantity.
- Actual and expected quantities remain visible together. A difference requires a reason.
- Receipt confirmation creates an auditable receipt record and staging movement.

### 9.2 Required states before implementation

- In-progress count can be saved without creating a stock movement.
- Duplicate scanner input is guarded by idempotency and server-side validation.
- Unknown SKU, wrong barcode type, wrong scope, zero or negative quantity and invalid destination are rejected with an actionable message.
- Excess quantity, damaged goods, short pack and wrong item require a classified exception and reason. Photo evidence is a later optional extension.
- A partial receipt remains visibly incomplete until the selected scope is reconciled or an exception path is confirmed.

### 9.3 Putaway

- The operator scans the product and the destination `DMLOC:` barcode, then enters a quantity.
- The system validates the quantity against unlocated confirmed staging stock.
- Manual location entry is a supervised recovery path that requires a reason. The normal scan path requires `DMLOC:`.
- Putaway records the source and destination movement even though the source is hidden from the operator.

## 10. History, date and timezone rules

- Every audit row includes date, time, timezone, actor, action, scope, reference and outcome.
- Storage uses UTC timestamps. Display may switch between `Australia/Brisbane` and `China Standard Time`; a historical event is never rewritten when the display timezone changes.
- History supports date range, shipment, pallet, carton, SKU, actor, action and exception-type filters.
- Historical print jobs, items, reprint reason, receipt difference, exception reason and movement reference remain linked to the event that created them.

## 11. Visual references

The confirmed visual language is a compact desktop operational workspace: deep teal navigation and confirmed primary actions, pale cool-neutral surfaces, amber exception states, English labels and dense grouped information. The provisional dashboard direction is the image-generated inbound pipeline command board from the 2026-08-29 design review. Static preview assets are stored outside the production worktree and are design references only.

## 12. Explicit exclusions

- Production Supabase migration execution.
- GitHub push, Vercel deployment or production-environment changes.
- GST, payments, public availability, real customer orders and carrier dispatch.
- China-side mandatory DriveMate labelling in Phase 1.
- Raw TSPL, browser USB printing, local print agent and offline scanner-cache implementation.

## 13. Design acceptance checklist

- [ ] Unified Partner role has no country-based access split.
- [ ] Administrator-only capabilities are system management, not historical-record mutation.
- [ ] The dashboard is an inbound pipeline command board with an action queue and persisted-event timeline.
- [ ] Pre-arrival shipment records preserve source pallet/carton structure and version history.
- [ ] All four label families exist in the library with correct Phase 1 activation state.
- [ ] Partners may create, edit, publish and archive versioned templates.
- [ ] Print selection uses task scope, label family and approved template version.
- [ ] Unit-product print confirmation gates receipt only for the matching scope.
- [ ] Both receipt modes, staging, DMLOC putaway and exceptions are specified.
- [ ] History includes date, time and selected display timezone.
- [ ] No excluded Pre-trade function is presented as live or enabled.
