"use client";

import { useEffect, useState } from "react";
import { buildApiHeaders } from "../lib/clientAuth";
import { type InventoryRow } from "../lib/inventory";
import { ScannerInput } from "./ScannerInput";

type MovementRow = {
  id: string | number;
  sku: string;
  movement:
    | "Inbound"
    | "Putaway"
    | "Dispatch"
    | "Return"
    | "Quarantine"
    | "Adjustment"
    | "Quarantine Release"
    | "Quarantine Write-off";
  quantity: number;
  location: string;
  reference: string;
  createdBy?: string;
};

type PickOrder = {
  id: string;
  status: string;
  poNumber?: string;
  lines: Array<{ sku: string; quantity: number }>;
  createdBy?: string;
};

type BulkReceiveRow = {
  sku: string;
  quantity: number;
  reference: string;
  location: string;
};

function parseDispatchScans(value: string) {
  return value
    .split(/\r?\n|;/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(.+?)(?:\s*(?:x|\*)\s*(\d+)|\s*,\s*(\d+))?$/i);
      return {
        sku: (match?.[1] ?? entry).trim(),
        quantity: Number.parseInt(match?.[2] ?? match?.[3] ?? "1", 10),
      };
    });
}

export function WarehouseScannerPanel() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [pickOrders, setPickOrders] = useState<PickOrder[]>([]);
  const [receiveSku, setReceiveSku] = useState("DM-GWM-OF-001");
  const [receiveBatch, setReceiveBatch] = useState("BNE-2026-06-GWM-01");
  const [receiveQty, setReceiveQty] = useState("5");
  const [receiveLocation, setReceiveLocation] = useState("BNE receiving");
  const [putawaySku, setPutawaySku] = useState("DM-GWM-OF-001");
  const [putawayRef, setPutawayRef] = useState("PUT-1001");
  const [putawayQty, setPutawayQty] = useState("1");
  const [putawayFromLocation, setPutawayFromLocation] = useState("BNE receiving");
  const [putawayToLocation, setPutawayToLocation] = useState("BNE-A01-03");
  const [dispatchSku, setDispatchSku] = useState("DM-GWM-OF-001");
  const [dispatchRef, setDispatchRef] = useState("ORD-1042");
  const [dispatchQty, setDispatchQty] = useState("1");
  const [returnSku, setReturnSku] = useState("DM-GWM-OF-001");
  const [returnRef, setReturnRef] = useState("RET-1001");
  const [returnQty, setReturnQty] = useState("1");
  const [returnAction, setReturnAction] = useState<"return" | "quarantine">("quarantine");
  const [quarantineSku, setQuarantineSku] = useState("DM-GWM-OF-001");
  const [quarantineRef, setQuarantineRef] = useState("QA-1001");
  const [quarantineQty, setQuarantineQty] = useState("1");
  const [quarantineLocation, setQuarantineLocation] = useState("BNE quarantine");
  const [quarantineAction, setQuarantineAction] = useState<"release" | "writeoff">("release");
  const [adjustSku, setAdjustSku] = useState("DM-GWM-OF-001");
  const [adjustRef, setAdjustRef] = useState("COUNT-1001");
  const [adjustQty, setAdjustQty] = useState("1");
  const [adjustLocation, setAdjustLocation] = useState("BNE-A01-03");
  const [adjustDirection, setAdjustDirection] = useState<"increase" | "decrease">("decrease");
  const [bulkReceiveCsv, setBulkReceiveCsv] = useState(
    "sku,quantity,reference,location\nDMPGWMOF001,10,BNE-2026-06-PILOT,BNE receiving\nDMPGWMAF002,10,BNE-2026-06-PILOT,BNE receiving",
  );
  const [dispatchScansByOrder, setDispatchScansByOrder] = useState<Record<string, string>>({});
  const [dispatchMetaByOrder, setDispatchMetaByOrder] = useState<Record<string, { deliveryCharge: string; carrier: string; trackingNumber: string }>>({});
  const [message, setMessage] = useState("Ready to scan stock movements.");

  async function loadWarehouseState() {
    const response = await fetch("/api/warehouse-state", { headers: await buildApiHeaders("warehouse") });
    if (!response.ok) {
      setMessage("Warehouse state could not be loaded.");
      return;
    }

    const body = (await response.json()) as {
      inventory: InventoryRow[];
      pickOrders: PickOrder[];
      stockMovements: MovementRow[];
    };
    setRows(body.inventory);
    setPickOrders(body.pickOrders);
    setMovements(body.stockMovements);
    setMessage("Warehouse state loaded.");
  }

  useEffect(() => {
    void loadWarehouseState();
  }, []);

  function addMovement(movement: Omit<MovementRow, "id">) {
    setMovements((current) => [{ ...movement, id: Date.now() }, ...current].slice(0, 8));
  }

  async function submitMovement(input: {
    type: "inbound" | "putaway" | "dispatch" | "return" | "quarantine" | "adjustment";
    sku: string;
    quantity: number;
    reference: string;
    location?: string;
    fromLocation?: string;
    toLocation?: string;
    adjustmentDirection?: "increase" | "decrease";
    quarantineAction?: "release" | "writeoff";
  }) {
    const response = await fetch("/api/inventory-movement", {
      method: "POST",
      headers: await buildApiHeaders("warehouse", { "Content-Type": "application/json" }),
      body: JSON.stringify(input),
    });
    return response.json() as Promise<
      | { ok: true; inventory: InventoryRow[]; movement: MovementRow }
      | { ok: false; message: string }
      | { error: unknown }
    >;
  }

  function parseBulkReceiveRows(input: string): BulkReceiveRow[] {
    const lines = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return [];

    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const firstCells = lines[0].split(delimiter).map((cell) => cell.trim().toLowerCase().replace(/[\s_-]/g, ""));
    const hasHeader = firstCells.includes("sku");
    const columns = hasHeader ? firstCells : ["sku", "quantity", "reference", "location"];
    const dataLines = hasHeader ? lines.slice(1) : lines;

    return dataLines.map((line, index) => {
      const cells = line.split(delimiter).map((cell) => cell.trim());
      const get = (...keys: string[]) => {
        const normalizedKeys = keys.map((key) => key.replace(/[\s_-]/g, "").toLowerCase());
        const columnIndex = columns.findIndex((column) => normalizedKeys.includes(column));
        return columnIndex >= 0 ? cells[columnIndex] ?? "" : "";
      };
      const rowNumber = hasHeader ? index + 2 : index + 1;
      const sku = get("sku", "barcode", "identifier");
      const quantity = Number.parseInt(get("quantity", "qty"), 10);
      const reference = get("reference", "batch", "batchNo", "batchNumber");
      const location = get("location", "bin") || "BNE receiving";

      if (!sku || !Number.isInteger(quantity) || quantity <= 0 || !reference) {
        throw new Error(`Row ${rowNumber} must include sku, positive quantity and reference/batch.`);
      }

      return { sku, quantity, reference, location };
    });
  }

  async function importInboundReceipts() {
    let rows: BulkReceiveRow[];
    try {
      rows = parseBulkReceiveRows(bulkReceiveCsv);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bulk receiving content could not be parsed.");
      return;
    }

    if (!rows.length) {
      setMessage("Paste at least one receiving row before importing.");
      return;
    }

    const response = await fetch("/api/inventory-movement/import", {
      method: "POST",
      headers: await buildApiHeaders("warehouse", { "Content-Type": "application/json" }),
      body: JSON.stringify({
        rows: rows.map((row) => ({
          type: "inbound",
          sku: row.sku,
          quantity: row.quantity,
          reference: row.reference,
          location: row.location,
        })),
      }),
    });

    const body = (await response.json()) as
      | {
          ok: boolean;
          summary: { processed: number; created: number; failed: number };
          inventory: InventoryRow[];
          movements: MovementRow[];
          failures: Array<{ row: number; sku: string; message: string }>;
        }
      | { ok: false; message: string }
      | { error: unknown };

    if (!response.ok || !("summary" in body)) {
      setMessage("message" in body ? body.message : "Bulk receiving import could not be completed.");
      return;
    }

    if (body.inventory.length) setRows(body.inventory);
    setMovements((current) => [...body.movements, ...current].slice(0, 10));
    const failureNote = body.failures.length
      ? ` ${body.failures.length} failed; first issue: ${body.failures[0].sku} ${body.failures[0].message}.`
      : "";
    setMessage(`Bulk receiving complete: ${body.summary.created} movements recorded.${failureNote}`);
  }

  async function handleReceive(scannedIdentifier = receiveSku) {
    const quantity = Number.parseInt(receiveQty, 10);
    const result = await submitMovement({
      type: "inbound",
      sku: scannedIdentifier.trim(),
      quantity,
      reference: receiveBatch.trim() || "Unbatched",
      location: receiveLocation.trim() || "BNE receiving",
    });

    if ("error" in result) {
      setMessage("Movement request was invalid.");
      return;
    }

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setRows(result.inventory);
    addMovement(result.movement);
    setMessage(`${result.movement.sku} received into ${result.movement.location}.`);
  }

  async function handlePutaway(scannedIdentifier = putawaySku) {
    const quantity = Number.parseInt(putawayQty, 10);
    const result = await submitMovement({
      type: "putaway",
      sku: scannedIdentifier.trim(),
      quantity,
      reference: putawayRef.trim() || "Putaway",
      location: putawayToLocation.trim() || "BNE-A01-03",
      fromLocation: putawayFromLocation.trim() || "BNE receiving",
      toLocation: putawayToLocation.trim() || "BNE-A01-03",
    });

    if ("error" in result) {
      setMessage("Movement request was invalid.");
      return;
    }

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setRows(result.inventory);
    addMovement(result.movement);
    setMessage(`${result.movement.sku} moved to ${result.movement.location}.`);
  }

  async function handleDispatch(scannedIdentifier = dispatchSku) {
    const quantity = Number.parseInt(dispatchQty, 10);
    const result = await submitMovement({
      type: "dispatch",
      sku: scannedIdentifier.trim(),
      quantity,
      reference: dispatchRef.trim() || "Manual dispatch",
      location: "BNE dispatch",
    });

    if ("error" in result) {
      setMessage("Movement request was invalid.");
      return;
    }

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setRows(result.inventory);
    addMovement(result.movement);
    setMessage(`${result.movement.sku} dispatched for ${result.movement.reference}.`);
  }

  async function handleReturnMovement(scannedIdentifier = returnSku) {
    const quantity = Number.parseInt(returnQty, 10);
    const result = await submitMovement({
      type: returnAction,
      sku: scannedIdentifier.trim(),
      quantity,
      reference: returnRef.trim() || "Return review",
      location: returnAction === "return" ? "BNE returns" : "BNE quarantine",
    });

    if ("error" in result) {
      setMessage("Movement request was invalid.");
      return;
    }

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setRows(result.inventory);
    addMovement(result.movement);
    setMessage(`${result.movement.sku} recorded as ${result.movement.movement}.`);
  }

  async function handleAdjustment(scannedIdentifier = adjustSku) {
    const quantity = Number.parseInt(adjustQty, 10);
    const result = await submitMovement({
      type: "adjustment",
      sku: scannedIdentifier.trim(),
      quantity,
      reference: adjustRef.trim() || "Stock adjustment",
      location: adjustLocation.trim() || "BNE-A01-03",
      adjustmentDirection: adjustDirection,
    });

    if ("error" in result) {
      setMessage("Movement request was invalid.");
      return;
    }

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setRows(result.inventory);
    addMovement(result.movement);
    setMessage(`${result.movement.sku} adjusted at ${result.movement.location}.`);
  }

  async function handleQuarantineReview(scannedIdentifier = quarantineSku) {
    const quantity = Number.parseInt(quarantineQty, 10);
    const result = await submitMovement({
      type: "adjustment",
      sku: scannedIdentifier.trim(),
      quantity,
      reference: quarantineRef.trim() || "Quarantine review",
      location: quarantineLocation.trim() || "BNE quarantine",
      quarantineAction,
    });

    if ("error" in result) {
      setMessage("Movement request was invalid.");
      return;
    }

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setRows(result.inventory);
    addMovement(result.movement);
    setMessage(`${result.movement.sku} ${result.movement.movement.toLowerCase()} recorded.`);
  }

  async function dispatchOrder(orderId: string) {
    const scans = parseDispatchScans(dispatchScansByOrder[orderId] ?? "");
    const dispatchMeta = dispatchMetaByOrder[orderId];
    if (!scans.length) {
      setMessage("Scan each order line before confirming dispatch.");
      return;
    }
    if (!dispatchMeta?.carrier.trim() || !dispatchMeta.trackingNumber.trim() || !Number.isFinite(Number(dispatchMeta.deliveryCharge))) {
      setMessage("Delivery charge, carrier and tracking number are required before dispatch.");
      return;
    }

    const response = await fetch(`/api/orders/${orderId}/dispatch`, {
      method: "POST",
      headers: await buildApiHeaders("warehouse", { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }),
      body: JSON.stringify({ scans, deliveryChargeExGstCents: Math.round(Number(dispatchMeta.deliveryCharge) * 100), carrier: dispatchMeta.carrier.trim(), trackingNumber: dispatchMeta.trackingNumber.trim() }),
    });

    const body = (await response.json()) as
      | { ok: true; order: PickOrder; inventory: InventoryRow[]; movements: MovementRow[] }
      | { ok: false; message: string };

    if (!response.ok || !body.ok) {
      setMessage("message" in body ? body.message : "Order could not be dispatched.");
      return;
    }

    setRows(body.inventory);
    setMovements((current) => [...body.movements, ...current].slice(0, 10));
    setPickOrders((current) => current.filter((order) => order.id !== orderId));
    setDispatchScansByOrder((current) => {
      const next = { ...current };
      delete next[orderId];
      return next;
    });
    setMessage(`Order ${body.order.id} dispatched.`);
  }

  return (
    <>
      <section className="two-column" id="putaway" style={{ marginTop: 18 }}>
        <div className="panel">
          <h2>Inbound receiving</h2>
          <div className="form-grid">
            <ScannerInput
              label="Scan SKU / barcode"
              value={receiveSku}
              onChange={setReceiveSku}
              onScan={(value) => {
                setReceiveSku(value);
                void handleReceive(value);
              }}
              autoFocus
            />
            <label>
              Batch number
              <input value={receiveBatch} onChange={(event) => setReceiveBatch(event.target.value)} />
            </label>
            <label>
              Receive quantity
              <input value={receiveQty} type="number" min="1" onChange={(event) => setReceiveQty(event.target.value)} />
            </label>
            <label>
              Location
              <input value={receiveLocation} onChange={(event) => setReceiveLocation(event.target.value)} />
            </label>
          </div>
          <p>
            <button className="primary-button" onClick={() => void handleReceive()} type="button">
              Receive stock
            </button>
          </p>
        </div>

        <div className="panel">
          <h2>Bulk receiving import</h2>
          <p>Paste receiving rows from the shipment worksheet after SKU masters have been mapped.</p>
          <label>
            Receiving rows
            <textarea
              aria-label="Bulk receiving import rows"
              rows={6}
              value={bulkReceiveCsv}
              onChange={(event) => setBulkReceiveCsv(event.target.value)}
            />
          </label>
          <p>
            <button className="primary-button" onClick={() => void importInboundReceipts()} type="button">
              Import receiving rows
            </button>
          </p>
        </div>

        <div className="panel">
          <h2>Putaway / bin transfer</h2>
          <div className="form-grid">
            <ScannerInput
              label="Scan putaway SKU"
              value={putawaySku}
              onChange={setPutawaySku}
              onScan={(value) => {
                setPutawaySku(value);
                void handlePutaway(value);
              }}
            />
            <label>
              Move reference
              <input value={putawayRef} onChange={(event) => setPutawayRef(event.target.value)} />
            </label>
            <label>
              Move quantity
              <input value={putawayQty} type="number" min="1" onChange={(event) => setPutawayQty(event.target.value)} />
            </label>
            <label>
              From location
              <input value={putawayFromLocation} onChange={(event) => setPutawayFromLocation(event.target.value)} />
            </label>
            <label>
              To location
              <input value={putawayToLocation} onChange={(event) => setPutawayToLocation(event.target.value)} />
            </label>
          </div>
          <p>
            <button className="primary-button" onClick={() => void handlePutaway()} type="button">
              Move to bin
            </button>
          </p>
        </div>

        <div className="panel">
          <h2>Outbound scan</h2>
          <div className="form-grid">
            <label>
              Order / reference
              <input value={dispatchRef} onChange={(event) => setDispatchRef(event.target.value)} />
            </label>
            <ScannerInput
              label="Scan SKU / barcode"
              value={dispatchSku}
              onChange={setDispatchSku}
              onScan={(value) => {
                setDispatchSku(value);
                void handleDispatch(value);
              }}
            />
            <label>
              Dispatch quantity
              <input value={dispatchQty} type="number" min="1" onChange={(event) => setDispatchQty(event.target.value)} />
            </label>
            <label>
              Dispatch lane
              <input value="BNE dispatch" readOnly />
            </label>
          </div>
          <p>
            <button className="primary-button" onClick={() => void handleDispatch()} type="button">
              Dispatch stock
            </button>
          </p>
        </div>

        <div className="panel">
          <h2>Returns & quarantine</h2>
          <div className="form-grid">
            <ScannerInput
              label="Scan returned SKU"
              value={returnSku}
              onChange={setReturnSku}
              onScan={(value) => {
                setReturnSku(value);
                void handleReturnMovement(value);
              }}
            />
            <label>
              Return / case reference
              <input value={returnRef} onChange={(event) => setReturnRef(event.target.value)} />
            </label>
            <label>
              Return quantity
              <input value={returnQty} type="number" min="1" onChange={(event) => setReturnQty(event.target.value)} />
            </label>
            <label>
              Action
              <select
                value={returnAction}
                onChange={(event) => setReturnAction(event.target.value as "return" | "quarantine")}
              >
                <option value="quarantine">Move to quarantine</option>
                <option value="return">Return to available stock</option>
              </select>
            </label>
          </div>
          <p>
            <button className="primary-button" onClick={() => void handleReturnMovement()} type="button">
              Record movement
            </button>
          </p>
        </div>

        <div className="panel">
          <h2>Stock adjustment</h2>
          <div className="form-grid">
            <ScannerInput
              label="Scan adjustment SKU"
              value={adjustSku}
              onChange={setAdjustSku}
              onScan={(value) => {
                setAdjustSku(value);
                void handleAdjustment(value);
              }}
            />
            <label>
              Count / adjustment reference
              <input value={adjustRef} onChange={(event) => setAdjustRef(event.target.value)} />
            </label>
            <label>
              Adjustment quantity
              <input value={adjustQty} type="number" min="1" onChange={(event) => setAdjustQty(event.target.value)} />
            </label>
            <label>
              Adjustment location
              <input value={adjustLocation} onChange={(event) => setAdjustLocation(event.target.value)} />
            </label>
            <label>
              Direction
              <select
                value={adjustDirection}
                onChange={(event) => setAdjustDirection(event.target.value as "increase" | "decrease")}
              >
                <option value="decrease">Reduce available stock</option>
                <option value="increase">Increase on-hand stock</option>
              </select>
            </label>
          </div>
          <p>
            <button className="primary-button" onClick={() => void handleAdjustment()} type="button">
              Record adjustment
            </button>
          </p>
        </div>

        <div className="panel">
          <h2>Quarantine review</h2>
          <div className="form-grid">
            <ScannerInput
              label="Scan quarantined SKU"
              value={quarantineSku}
              onChange={setQuarantineSku}
              onScan={(value) => {
                setQuarantineSku(value);
                void handleQuarantineReview(value);
              }}
            />
            <label>
              QA / review reference
              <input value={quarantineRef} onChange={(event) => setQuarantineRef(event.target.value)} />
            </label>
            <label>
              Review quantity
              <input
                value={quarantineQty}
                type="number"
                min="1"
                onChange={(event) => setQuarantineQty(event.target.value)}
              />
            </label>
            <label>
              Quarantine location
              <input value={quarantineLocation} onChange={(event) => setQuarantineLocation(event.target.value)} />
            </label>
            <label>
              Outcome
              <select
                value={quarantineAction}
                onChange={(event) => setQuarantineAction(event.target.value as "release" | "writeoff")}
              >
                <option value="release">Release to available stock</option>
                <option value="writeoff">Write off from stock</option>
              </select>
            </label>
          </div>
          <p>
            <button className="primary-button" onClick={() => void handleQuarantineReview()} type="button">
              Record QA outcome
            </button>
          </p>
        </div>
      </section>

      <p className="badge" role="status">
        {message}
      </p>

      <section className="two-column" id="dispatch" style={{ marginTop: 18 }}>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>PO</th>
                <th>Lines</th>
                <th>Created by</th>
                <th>Scanned lines</th>
                <th>Delivery</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pickOrders.length ? (
                pickOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td>{order.status}</td>
                    <td>{order.poNumber ?? "No PO"}</td>
                    <td>{order.lines.map((line) => `${line.sku} x ${line.quantity}`).join(", ")}</td>
                    <td>{order.createdBy ?? "System"}</td>
                    <td>
                      <label className="inline-label">
                        <span className="sr-only">Scanned dispatch lines for {order.id}</span>
                        <textarea
                          aria-label={`Scanned dispatch lines for ${order.id}`}
                          placeholder="One scanned SKU per line, e.g. DMPGWMOF001 x 1"
                          value={dispatchScansByOrder[order.id] ?? ""}
                          onChange={(event) =>
                            setDispatchScansByOrder((current) => ({
                              ...current,
                              [order.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </td>
                    <td>
                      <div className="dispatch-meta">
                        <label>Charge ex GST<input inputMode="decimal" placeholder="0.00" value={dispatchMetaByOrder[order.id]?.deliveryCharge ?? ""} onChange={(event) => setDispatchMetaByOrder((current) => ({ ...current, [order.id]: { deliveryCharge: event.target.value, carrier: current[order.id]?.carrier ?? "", trackingNumber: current[order.id]?.trackingNumber ?? "" } }))} /></label>
                        <label>Carrier<input placeholder="Courier" value={dispatchMetaByOrder[order.id]?.carrier ?? ""} onChange={(event) => setDispatchMetaByOrder((current) => ({ ...current, [order.id]: { deliveryCharge: current[order.id]?.deliveryCharge ?? "", carrier: event.target.value, trackingNumber: current[order.id]?.trackingNumber ?? "" } }))} /></label>
                        <label>Tracking<input placeholder="Tracking number" value={dispatchMetaByOrder[order.id]?.trackingNumber ?? ""} onChange={(event) => setDispatchMetaByOrder((current) => ({ ...current, [order.id]: { deliveryCharge: current[order.id]?.deliveryCharge ?? "", carrier: current[order.id]?.carrier ?? "", trackingNumber: event.target.value } }))} /></label>
                      </div>
                    </td>
                    <td>
                      <button className="primary-button" onClick={() => void dispatchOrder(order.id)} type="button">
                        Confirm dispatch
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>No pick orders ready.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>On hand</th>
                <th>Reserved</th>
                <th>Quarantine</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.sku}>
                  <td>{row.sku}</td>
                  <td>{row.onHand}</td>
                  <td>{row.reserved}</td>
                  <td>{row.quarantine ?? 0}</td>
                  <td>{Math.max(row.onHand - row.reserved - (row.quarantine ?? 0), 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-shell" style={{ gridColumn: "1 / -1" }}>
          <table className="compact-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Movement</th>
                <th>Qty</th>
                <th>Reference</th>
                <th>Location</th>
                <th>Created by</th>
              </tr>
            </thead>
            <tbody>
              {movements.length ? (
                movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{movement.sku}</td>
                    <td>{movement.movement}</td>
                    <td>{movement.quantity}</td>
                    <td>{movement.reference}</td>
                    <td>{movement.location}</td>
                    <td>{movement.createdBy ?? "System"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No stock movements in this browser session.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
