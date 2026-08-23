# Pre-trade Production Design

## Goal

Allow the DriveMate public website, authentication, trade-account applications, purchasing, compliance and inventory operations to run in Production before GST registration is confirmed, while preventing every commercial order and dispatch path.

## Operating Rules

- `DRIVEMATE_TRADING_ENABLED=false` selects pre-trade mode.
- Live trading is available only when both `DRIVEMATE_TRADING_ENABLED=true` and `DRIVEMATE_GST_REGISTERED=true`.
- Pre-trade mode keeps catalogue enquiries, account applications, authentication, purchasing, receiving, compliance and inventory administration available.
- Order submission and dispatch return `503` before authorization or request-body processing can mutate data.
- Order cancellation remains available so existing test or migrated reservations can be safely released.
- Public copy uses neutral `invoice` wording until GST registration is confirmed.

## Release Readiness

- Production without GST is valid only when trading is explicitly disabled.
- Production with trading enabled and GST disabled is a release failure.
- Pre-trade verification does not require trade and warehouse smoke tokens or destructive order/dispatch smoke tests.
- Full trading verification continues to require GST, all three smoke roles and end-to-end write checks.

## Activation Gate

Trading may later be enabled only after ABR confirmation, price approval, saleable stock and operational approval. The environment change must set both GST and trading flags to `true`, followed by the full release verification.
