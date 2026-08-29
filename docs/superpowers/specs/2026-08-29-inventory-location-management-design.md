# Inventory Location Management and DMLOC Label Design

**Status:** Approved design rules recorded; implementation approval pending written-spec review
**Date:** 2026-08-29
**Scope:** DriveMate Parts real warehouse location master, bin-label printing and scan validation

## 1. Purpose

DriveMate will operate a real, extensible location master for the Brisbane warehouse. A location is a physical destination that can receive stock during putaway. The system must allow the warehouse team to prepare a practical pool of labels before the final physical layout is known, place them freely on site, and later maintain a human-readable physical description and notes for each label.

The location master is not test-only. It supports real warehouse operations, while retaining the existing commercial boundary: no change in this task creates a customer order, public availability, GST amount, payment, carrier dispatch or external fulfilment.

## 2. Core decision

Each scan-ready destination is a **leaf location**. It has one immutable code and one immutable barcode:

```text
Readable code: BNE-A01-03
Scanner value: DMLOC:BNE-A01-03
```

The code identifies the label permanently; it does not force a fixed interpretation of aisle, rack, shelf or bin. The warehouse may place the label wherever it is operationally useful and subsequently record the physical meaning in editable system fields.

```text
Create code(s) -> Print audited label task -> Confirm physical printing
    -> Place label in warehouse -> Add or update physical description
    -> Scan product + DMLOC label during putaway -> Record actual destination
```

## 3. Location master data

Every location record contains:

| Field | Rule | Purpose |
|---|---|---|
| System ID | Generated and immutable | Stable database identity |
| Location code | Unique, uppercase canonical code with two to four alphanumeric segments after `BNE`, such as `BNE-A01-03` or `BNE-A-01-03`; immutable and never reused after creation | Human-readable physical label identity |
| Barcode | Derived once as `DMLOC:<location code>`; immutable | Scanner destination identity |
| Status | `active`, `disabled`, or `archived` | Controls whether the code can receive a putaway |
| Physical description | Editable short text | E.g. `Rear wall, rack 2, middle shelf` |
| Notes | Editable operational note | Local placement or handling detail |
| Created / changed audit | Actor, UTC timestamp and outcome | Real warehouse traceability |

There is no mandatory capacity, fixed shelf hierarchy, pick sequence or product-to-location restriction in this phase. They remain future optional extensions.

## 4. Lifecycle and safeguards

```text
Create -> Active -> Disabled -> Active
                  \-> Archived
```

- **Active** locations are valid `DMLOC:` putaway destinations.
- **Disabled** and **archived** locations reject new putaway scans but retain all historical movements and print records.
- A location with a current on-hand balance cannot be disabled or archived. The operator must move or reconcile its stock first.
- Codes and barcodes are never edited in place. A physical relabelling error is corrected by creating a replacement code and retaining the historical original record.
- Updating a physical description or note records a location audit event; it does not alter an existing printed-label snapshot.

## 5. Creation and expansion

The Inventory and Locations workspace supports both modes below, with no practical preset count limit:

1. **Create one location** for an immediate new shelf, cage, rack, workbench or floor position.
2. **Create a batch** by submitting a reviewed line-separated code list. This lets the warehouse create any convenient initial pool, print the resulting labels, then decide where to place them physically.

Batch creation validates that each code is canonical, unique within the submitted batch and not already registered. The page previews the exact codes and generated `DMLOC:` values before saving. This avoids imposing a theoretical warehouse map while preventing duplicate physical identities.

## 6. Label printing

Location labels use the approved `bin_location` family:

| Attribute | Value |
|---|---|
| Nominal size | 100 × 50 mm |
| Barcode | Code 128 |
| Scanner value | `DMLOC:<location code>` |
| Printed content | DriveMate Parts, readable location code, Code 128 barcode and human-readable barcode text |

Physical description and notes are deliberately excluded from the printed label. They can change after a label is mounted; the permanent code and barcode remain accurate.

The workflow is:

```text
Select active locations -> Select approved Bin / Location template
-> Preview -> Windows print dialog -> Operator confirms Printed or Cancelled
```

Print tasks and per-label payload snapshots are immutable. Reprinting requires a reason and creates a linked audit task. Printing a location label never changes inventory or unlocks a receipt.

## 7. Putaway integration

The existing putaway sequence remains:

```text
Confirmed receipt in BNE-RECEIVING-STAGING
    -> scan product barcode
    -> scan active, registered DMLOC location barcode
    -> enter quantity
    -> record movement from staging to that location
```

The putaway API must validate both barcode syntax and master-data status. A syntactically valid but unregistered, disabled or archived `DMLOC:` code is rejected with an actionable message. The source remains system-resolved; the operator never scans `BNE-RECEIVING-STAGING`.

## 8. Access and audit

- Partner and administrator accounts share the same location-management operational capabilities.
- The administrator account retains only its existing system-level administrative difference; there is no China-versus-Australia permission split.
- Read operations require the existing warehouse-read capability. Create, edit, print-state confirmation, disable and archive use the existing warehouse inventory-write capability and applicable staff assurance rule.
- All saved actions are attributable with actor and UTC timestamp. Display uses the existing Brisbane / Shanghai timezone behaviour without rewriting stored timestamps.

## 9. Page design

The new `/inventory` workspace follows the confirmed deep-teal operational style and uses four clear areas:

```text
Left operations navigation
  Inventory & locations (active)

Top summary
  Active locations | Disabled locations | Labels awaiting confirmation | Locations holding stock

Location register
  Search | Status filter | Batch create | Create one
  Code | Physical description | Status | Current balance | Label audit | Actions

Location detail / print panel
  Code + generated DMLOC barcode
  Editable description and notes
  Select location(s) -> Bin / Location template -> Preview -> Print -> Confirm outcome
```

The page is operationally complete without enforcing an unconfirmed physical layout. It supports a growing real location pool and clearly shows whether each printed label is usable for putaway.

## 10. Explicit exclusions

- No production Supabase migration execution or production location-data write without a separate, action-specific authorization.
- No real sales, customer orders, payment, GST, public stock availability or carrier dispatch.
- No capacity calculations, stock replenishment optimisation, route optimisation, mandatory location hierarchy, raw TSPL, browser USB printing, local print agent or offline cache in this task.
- No requirement to place DriveMate labels in China before export.

## 11. Acceptance criteria

1. A partner can create one or multiple real warehouse locations with unique canonical codes and generated `DMLOC:` values.
2. The warehouse can print selected Bin / Location labels in one auditable batch, confirm printing, cancel, and reprint with a reason.
3. Physical description and notes can be maintained after labels are placed without changing code or barcode identity.
4. Putaway accepts only an active, registered location barcode and records the actual destination.
5. A location carrying stock cannot be disabled or archived; historical movements and print snapshots remain visible.
6. The workspace works for both Australia and China partner accounts using the same operational permissions and timezone display choice.
7. The feature does not create any commercial or customer-facing transaction.
