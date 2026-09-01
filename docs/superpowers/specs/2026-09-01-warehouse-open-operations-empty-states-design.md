# Warehouse Open Operations Empty States Design

## Goal

Keep every Warehouse module visible and navigable even when the selected Shipment has no confirmed Packing List, while preserving all server-side inventory integrity checks.

## Confirmed operating principle

- Pages and module navigation remain available to authorised staff.
- Missing prerequisite data is represented by a useful empty state, not an inaccessible page or disabled navigation.
- Label quantities still require a confirmed Packing List.
- Receipt writes still require a relevant product-label print job confirmed as `Printed`.
- Putaway writes still require a confirmed receipt in `BNE-RECEIVING-STAGING` and an active scanned `DMLOC` destination.
- Receipt history is always read-only and available.

## User experience

When the selected Shipment has no confirmed Packing List, the Warehouse sidebar exposes all four modules:

1. **Label print** shows that no confirmed quantities are available and links to the selected Shipment in Pre-arrival.
2. **Receive stock** explains that receipt cannot be recorded until source quantities and print confirmation exist.
3. **Put away** explains that no confirmed receipt is available in system staging.
4. **Receipt history** loads the existing read-only history component for the selected Shipment with no carton pre-filter.

The selected Shipment control remains visible in every view. No empty-state action calls a write API.

## Architecture

`LockedInboundWorkspace` becomes a client-side open workspace with the same `WorkspaceView` navigation model as the normal Operations Desk. It renders module-specific empty states for the three write workflows and reuses `ReceiptHistoryPanel` for audit history. The existing full Operations Desk continues to render after the Packing List is confirmed.

No database, API schema, role, permission or environment-variable changes are required.

## Error and empty states

- Every unavailable write workflow explains the missing prerequisite and the exact next step.
- Navigation remains active and keyboard accessible.
- Action buttons that would create labels, receipts or putaway movements do not render until their required source data exists.
- Receipt-history load failures continue to use the existing retry state.

## Testing

- Add browser regression coverage for all four module links when `packingList=empty`.
- Prove that module headings and next-step copy change after each navigation click.
- Prove that write buttons are absent in the empty states.
- Prove that Receipt history loads and remains read-only.
- Rerun Warehouse browser suites, full Vitest, typecheck and production build.
- Render desktop and mobile local browser checks with no framework overlay, console error or document overflow.

## Out of scope

- Creating or confirming a Production Packing List.
- Creating print jobs, receipts, putaway movements or Staff accounts in Production.
- Removing service-side validation or permission checks.
- Changing GST, trading, payment, SMTP, DNS or environment configuration.
