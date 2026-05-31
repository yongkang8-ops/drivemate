# DriveMate Parts V1 Product Logic / 产品逻辑

## Scope / 范围

V1 is a single web application with four connected surfaces:

V1 是一个统一 Web 应用，包含四个相互连接的业务面：

```text
Public Website
  ↓ account application / trade login
Trade Portal
  ↓ vehicle lookup / stock visibility / order submit
Warehouse Inventory System
  ↓ receive / reserve / pick / dispatch / return / quarantine
Admin Backend
  ↓ master data / account approvals / audit / operating review
  ↓ CSV exports for inventory / purchase batches / orders / stock movements / account documents / lookup requests / account applications / trade accounts
```

## System Map / 系统地图

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Public Website                                                       │
│ - Brand positioning                                                  │
│ - Trade account application                                          │
│ - Trade login entry                                                  │
└───────────────┬─────────────────────────────────────────────────────┘
                │
                │ pending application
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Admin Backend                                                        │
│ - Approve workshop accounts                                          │
│ - Pause or reactivate workshop trade accounts                         │
│ - Maintain SKU/barcode/OEM master data                               │
│ - Maintain SKU-to-vehicle fitment rules                               │
│ - Pause or reactivate SKU visibility                                  │
│ - Review fitment, RFQ, pricing status, purchase batches              │
│ - Review workshop lookup demand from VIN/rego/part searches          │
│ - Review low-stock reorder alerts from SKU reorder points             │
│ - Monitor orders, stock movements, account documents                 │
│ - Export CSV snapshots for operating review and reconciliation        │
└───────────────┬─────────────────────────────────────────────────────┘
                │ approved account + user role
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Trade Portal                                                         │
│ - Login as approved workshop                                         │
│ - Search by VIN/rego/part number                                     │
│ - Match AU-fitment parts against available stock                     │
│ - Build quote/order                                                  │
│ - Read order history, invoices, delivery records, statements         │
└───────────────┬─────────────────────────────────────────────────────┘
                │ submitted order reserves stock
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Warehouse Inventory System                                           │
│ - Receive inbound stock by SKU/barcode/OEM number                    │
│ - Capture inbound batch number and received quantity                  │
│ - See pick-ready trade orders                                        │
│ - Confirm dispatch and reduce reserved stock                         │
│ - Record returns and quarantine                                      │
│ - Release quarantined stock or write it off after QA review           │
│ - Record controlled stock adjustments after count checks              │
│ - Keep stock movement audit trail                                    │
└───────────────┬─────────────────────────────────────────────────────┘
                │ dispatch creates delivery record
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Trade Portal + Admin                                                 │
│ - Workshop can access account documents                              │
│ - Admin can audit who submitted, received, dispatched, approved, or generated documents │
└─────────────────────────────────────────────────────────────────────┘
```

## Role Boundary / 角色边界

```text
Public
  can: view website, submit trade account application
  cannot: lookup vehicle, see inventory APIs, create order, access admin

Trade user
  can: vehicle lookup, read own trade account state, create own orders, open own documents
  cannot: select another trade account, move stock, approve accounts, view admin state

Warehouse user
  can: read warehouse queue, receive stock, dispatch stock, return stock, quarantine stock
  cannot: approve accounts, view full admin backend, create workshop orders

Admin user
  can: read admin backend, approve accounts, pause/reactivate trade accounts, support order/account review, inspect audit state
  cannot: bypass production auth; production must use Supabase JWT + user_profiles
```

## Data Flow / 数据流

```text
1. Account application
   Public form
     → /api/trade-account-applications
     → trade_accounts(status=pending)
     → Admin approves
     → trade_accounts(status=approved)
     → Supabase Auth user + user_profiles(role=trade, trade_account_id)
     → Admin can pause/reactivate the trade account if ordering should be stopped or restored

2. Vehicle and parts lookup
   Trade Portal VIN/rego/part query
     → /api/vehicle-lookup
     → fitment rules + catalogue + inventory availability
     → matched SKU list
     → vehicle_lookup_requests demand log for admin follow-up

3. Order submission
   Trade order pad
     → /api/orders
     → trade account status must be approved
     → SKU status must be active
     → server derives trade pricing from SKU pricing rules
     → sales_orders + sales_order_lines
     → line ex-GST / GST / inc-GST and order subtotal / GST / total are stored
     → inventory_balances.reserved increases
     → invoice document record + generated storage object
     → monthly statement record/object ensured

4. Order cancellation before dispatch
   Trade Portal or Admin Backend
     → /api/orders/[orderId]/cancel
     → sales_orders.status=cancelled
     → inventory_balances.reserved decreases

5. Warehouse dispatch
   Warehouse pick queue
     → scan each picked SKU/barcode against the order lines
     → /api/orders/[orderId]/dispatch with scanned lines
     → inventory_balances.on_hand decreases
     → inventory_balances.reserved decreases
     → stock_movements(dispatch)
     → delivery record document/object

6. Inbound, return, quarantine
   Warehouse scanner
     → /api/inventory-movement
     → resolve scanned identifier from sku/barcode/oem_part_number
     → update inventory_balances
     → inbound movement creates/updates purchase batch audit row
     → stock_movements audit row

7. Quarantine review
   Warehouse scanner
     → /api/inventory-movement(type=adjustment, quarantineAction=release/writeoff)
     → release decreases quarantine only and returns units to available stock
     → write-off decreases quarantine and physical on_hand
     → stock_movements audit row with QA reference and operator

8. Putaway / bin transfer
   Warehouse scanner
     → /api/inventory-movement(type=putaway)
     → resolve scanned identifier from sku/barcode/oem_part_number
     → move stock from receiving/source bin to shelf bin
     → preserve batch_id and write from_location_id + to_location_id

9. Stock adjustment / count correction
   Warehouse scanner
     → /api/inventory-movement(type=adjustment)
     → resolve scanned identifier from sku/barcode/oem_part_number
     → increase or decrease on_hand at the selected location
     → stock_movements audit row with count reference and operator

10. SKU master data maintenance
   Admin backend
     → /api/products
     → create approved SKU, barcode, OEM part number, category, brand, status, reorder point, and reorder quantity
     → /api/products/[sku]
     → update barcode, OEM part number, SKU status, or replenishment thresholds
     → /api/fitment-rules
     → create SKU-to-make/model/year/engine fitment rule
     → receiving/dispatch scanners can use the updated identifier
     → trade portal lookup can return the stocked SKU

11. Lookup demand review
   Trade Portal search
     → /api/vehicle-lookup
     → record trade_account_id, rego, VIN, query, identified vehicle, match count, user and timestamp
     → Admin Backend lookup table and lookup_requests CSV export
     → follow-up list for missing fitment data, supplier RFQ and future SKU expansion
```

## Inventory Logic / 进销存逻辑

```text
Available stock = on_hand - reserved - quarantine

Inbound:
  on_hand increases
  batch number and location are captured
  received quantity is exposed to admin through purchase batch records
  Supabase mode stores the quantity under product + batch + location

Putaway / bin transfer:
  total on_hand does not change
  stock moves from receiving/source location to shelf target location
  Supabase mode keeps the same batch_id during the transfer

Trade order submit:
  trade account must be approved
  pending, paused, or closed trade accounts cannot submit new orders
  SKU must be active for trade ordering
  server-side pricing must exist for each ordered SKU
  reserved increases
  on_hand does not change yet
  sales_order_lines store unit price, line ex-GST, GST, and line inc-GST
  sales_orders stores subtotal ex-GST, GST, and total inc-GST

Order cancel before dispatch:
  reserved decreases
  on_hand does not change

Dispatch:
  scanned SKU quantities must match the order lines
  on_hand decreases
  reserved decreases

Return to stock:
  on_hand increases

Quarantine:
  quarantine increases
  available stock decreases

Quarantine review:
  release decreases quarantine without changing physical on_hand
  write-off decreases quarantine and physical on_hand
  every review needs a QA/reference id and operator audit trail

Stock adjustment:
  on_hand increases or decreases
  reserved stock is not changed
  decrease is blocked when available stock is insufficient
  every adjustment needs a reference and operator audit trail

Reorder alert:
  active SKUs are flagged when available stock is at or below reorder_point
  suggested order quantity uses reorder_quantity, falling back to the shortage against reorder_point
```

## Scanner Logic / 扫码逻辑

```text
Scanner input
  ↓
normalize scanned text
  ↓
match in this order:
  1. products.sku
  2. products.barcode
  3. products.oem_part_number
  4. local prototype aliases
  ↓
canonical SKU
  ↓
stock movement
```

The practical rule is simple: every real stocked SKU must have at least one stable scannable identifier in master data.

实操规则：每个真实入库 SKU 至少需要一个稳定可扫码识别字段，优先是内部条码，其次是供应商条码或 OEM part number。

Admins can create SKU master records and maintain scanner fields in the admin backend. A new SKU or barcode/OEM
update should be tested immediately with one warehouse scan before relying on it in a live receiving or dispatch shift.

管理员可以在后台新增 SKU 主数据并维护扫码字段。新增 SKU、条码或 OEM 编码更新后，应立即用一次仓库扫码验证，
再用于真实收货或出货班次。

## Warehouse Location Format / 仓库库位格式

```text
Preferred format:
  BNE-A01-03

Operational aliases:
  BNE receiving   → Brisbane / RECEIVING / DOCK
  BNE dispatch    → Brisbane / DISPATCH / LANE
  BNE returns     → Brisbane / RETURNS / REVIEW
  BNE quarantine  → Brisbane / QUARANTINE / REVIEW
```

For inbound receiving, Supabase mode creates or reuses:

```text
inventory_locations  by warehouse + zone + bin_code
inventory_batches    by product + batch number
inventory_balances   by product + location + batch
stock_movements      with to_location_id and batch_id
```

入库时，批次号和库位不是备注字段，而是会进入库存余额维度。这样后续可以追踪同一个 SKU 在不同批次、不同库位的库存。

## Deployment Gate / 上线验收门槛

Before switching to real pilot operation, all gates below should pass:

正式进入 demo 试运营前，应通过以下 gate：

```text
Local code quality
  npm run typecheck
  npm test
  npm run build
  npx playwright test

Supabase readiness
  run supabase/schema.sql
  run supabase/policies.sql
  run supabase/seed.sql
  npm run verify:supabase

Staging website readiness
  set DRIVEMATE_BASE_URL=https://<vercel-staging-url>
  npm run verify:staging

Staging e2e readiness
  generate real smoke tokens with npm run smoke:tokens
  set DRIVEMATE_SMOKE_E2E_CHECK=true only for resettable staging data
  verify trade order, warehouse dispatch, trade document access, and admin visibility
  pause and reactivate one approved trade account from admin
  confirm a paused trade account cannot submit a new order

Auth readiness
  create trade, warehouse, admin users
  attach user_profiles.role
  attach trade_account_id for trade users
  verify with real Supabase access tokens

Warehouse readiness
  confirm every stocked SKU has sku/barcode/oem_part_number mapping
  confirm every stocked SKU has a reorder point and reorder quantity before live sales
  update one SKU barcode/OEM field from admin
  update one SKU reorder threshold from admin and confirm it appears in reorder alerts when below threshold
  confirm the updated identifier resolves in one scanner workflow
  perform one inbound scan
  confirm inbound created or reused the expected batch and location
  perform one putaway scan from receiving to shelf bin
  confirm putaway preserved the batch and updated source/target bins
  perform one stock adjustment with a count reference
  confirm adjustment writes an audit row and updates on_hand only
  submit one trade order
  dispatch one order
  confirm stock movement audit

Document readiness
  confirm invoice, delivery record, and monthly statement records exist
  confirm business legal name, ABN, and accounts email are configured
  confirm downloaded account documents include order, PO/job, vehicle, SKU line details, and order totals
  confirm signed document links open for the correct trade account only
```

## Known V1 Limits / V1 已知边界

```text
VIN/rego lookup:
  current V1 has a mock/manual fitment engine; real VIN data provider integration is a later module.

Accounting documents:
  current V1 creates structured account document records and generated text files for workflow validation.
  final priced accounting PDFs should be connected before production invoicing.

Pricing:
  current V1 exposes login-only trade prices from server-side pricing rules and persists order totals.
  formal margin rules, customer-specific price books and accounting price sync are not in V1.

Payments and accounting:
  payment collection, BAS/GST reporting, and Xero/MYOB/QuickBooks integration are not in V1.

Inventory depth:
  V1 supports stock balance, reservation, putaway/bin transfer, dispatch, return, quarantine, stock adjustment, and audit.
  full purchasing, supplier backorder, formal cycle-count programs, and multi-warehouse transfers are later modules.
```
