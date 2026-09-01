# Dual-mode End-to-end QA Design

## Goal

Make the browser machine-test suite accurately verify both the current Production `pretrade` boundary and the complete local trading workflow without changing Production GST or trading configuration.

## Test modes

### Pretrade mode

- Default Playwright environment.
- Runs all public, catalogue, account, admin, staff, pre-arrival, warehouse, inventory and MFA scenarios.
- Keeps live ordering and dispatch unavailable.
- Skips scenarios that require a submitted trade order.
- Retains dedicated pretrade route and portal assertions.

### Local trading simulation

- Memory repository only.
- Sets `DRIVEMATE_TRADING_ENABLED=true` and `DRIVEMATE_GST_REGISTERED=true` for one local test process.
- Runs the complete API route suite, including order submission, cancellation, dispatch, account state, warehouse pick state and CSV export.
- Never writes Production data or changes Vercel environment variables.

## Security and commercial boundary

The pretrade gate remains the first commercial mutation boundary so order payloads, authentication services and repository logic are not entered while live trading is unavailable. In pretrade mode the order mutation returns `503 TRADING_DISABLED`; in local trading simulation unauthorised callers continue to receive `403` from request-security and role checks.

## Putaway boundary

The generic `/api/inventory-movement` route must reject `type: putaway` with `422`. Putaway is accepted only through the receipt-scoped `/api/warehouse/putaway` workflow.

## Acceptance

- Default pretrade Playwright run has zero failures.
- Local trading API run has zero failures.
- Full Vitest, typecheck and build remain green.
- Production configuration remains unchanged.
