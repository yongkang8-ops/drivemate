"use client";

import { useEffect, useState } from "react";
import { buildApiHeaders } from "../lib/clientAuth";

type VehicleProfile = {
  make: string;
  model: string;
  year?: number;
  engine?: string;
  market: "AU-spec";
  confidence: "exact" | "manual_review";
};

type MatchedPart = {
  sku: string;
  brand: string;
  name: string;
  category: string;
  vehicle: string;
  fitment: string;
  available: number;
  tradePriceExGstCents?: number;
  fitmentConfidence: "exact" | "likely" | "confirm_vin";
};

type OrderLine = {
  sku: string;
  name: string;
  quantity: number;
  unitPriceExGstCents?: number;
  lineTotalExGstCents?: number;
  gstCents?: number;
  lineTotalIncGstCents?: number;
};

type TradeOrder = {
  id: string;
  poNumber?: string;
  status: string;
  createdAt?: string;
  subtotalExGstCents?: number;
  gstCents?: number;
  totalIncGstCents?: number;
  lines: Array<{ sku: string; quantity: number; lineTotalIncGstCents?: number }>;
};

type AccountDocument = {
  id: string;
  type: "order_confirmation" | "invoice" | "credit_note" | "statement" | "delivery_record";
  reference: string;
  createdAt: string;
};

function formatMoney(value: number | undefined) {
  if (value === undefined) return "Not priced";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value / 100);
}

export function TradePortalWorkspace() {
  const [rego, setRego] = useState("QLD 24ALPHA");
  const [vin, setVin] = useState("LGWFFEA6XRA000245");
  const [query, setQuery] = useState("GWM Cannon Alpha filters");
  const [vehicle, setVehicle] = useState<VehicleProfile | null>(null);
  const [matches, setMatches] = useState<MatchedPart[]>([]);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [orders, setOrders] = useState<TradeOrder[]>([]);
  const [accountDocuments, setAccountDocuments] = useState<AccountDocument[]>([]);
  const [poNumber, setPoNumber] = useState("JOB-1842");
  const [message, setMessage] = useState("Ready to search by rego, VIN or part number.");

  async function loadTradeState() {
    const response = await fetch("/api/trade-state", {
      headers: await buildApiHeaders("trade"),
    });

    if (!response.ok) {
      setMessage("Trade account records could not be loaded.");
      return;
    }

    const body = (await response.json()) as { orders: TradeOrder[]; accountDocuments: AccountDocument[] };
    setOrders(body.orders);
    setAccountDocuments(body.accountDocuments);
  }

  useEffect(() => {
    void loadTradeState();
  }, []);

  async function searchParts() {
    const response = await fetch("/api/vehicle-lookup", {
      method: "POST",
      headers: await buildApiHeaders("trade", { "Content-Type": "application/json" }),
      body: JSON.stringify({ rego, vin, query }),
    });

    if (!response.ok) {
      setMessage("Vehicle lookup request could not be processed.");
      return;
    }

    const body = (await response.json()) as { vehicle: VehicleProfile; matches: MatchedPart[] };
    setVehicle(body.vehicle);
    setMatches(body.matches);
    setMessage(body.vehicle.confidence === "manual_review" ? "No approved VIN match. A manual review request has been recorded." : `${body.matches.length} matching parts found for ${body.vehicle.make} ${body.vehicle.model}.`);
  }

  function addToOrder(part: MatchedPart) {
    setOrderLines((current) => {
      const existing = current.find((line) => line.sku === part.sku);
      if (existing) {
        return current.map((line) => {
          if (line.sku !== part.sku) return line;
          const quantity = line.quantity + 1;
          const lineTotalExGstCents = line.unitPriceExGstCents ? line.unitPriceExGstCents * quantity : undefined;
          const gstCents = lineTotalExGstCents ? Math.round(lineTotalExGstCents * 0.1) : undefined;
          return {
            ...line,
            quantity,
            lineTotalExGstCents,
            gstCents,
            lineTotalIncGstCents: lineTotalExGstCents && gstCents ? lineTotalExGstCents + gstCents : undefined,
          };
        });
      }
      return [
        ...current,
        {
          sku: part.sku,
          name: part.name,
          quantity: 1,
          unitPriceExGstCents: part.tradePriceExGstCents,
          lineTotalExGstCents: part.tradePriceExGstCents,
          gstCents: part.tradePriceExGstCents ? Math.round(part.tradePriceExGstCents * 0.1) : undefined,
          lineTotalIncGstCents: part.tradePriceExGstCents ? Math.round(part.tradePriceExGstCents * 1.1) : undefined,
        },
      ];
    });
    setMessage(`${part.sku} added to order pad.`);
  }

  async function submitOrder() {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: await buildApiHeaders("trade", { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }),
      body: JSON.stringify({
        poNumber,
        vehicleVin: vin,
        vehicleRego: rego,
        lines: orderLines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
      }),
    });

    const body = (await response.json()) as
      | { ok: true; order: { id: string; status: string } }
      | { ok: false; message: string };

    if (!response.ok || !body.ok) {
      setMessage("message" in body ? body.message : "Order could not be submitted.");
      return;
    }

    setOrderLines([]);
    await loadTradeState();
    setMessage(`Order ${body.order.id} submitted.`);
  }

  async function cancelOrder(orderId: string) {
    const response = await fetch(`/api/orders/${orderId}/cancel`, {
      method: "POST",
      headers: await buildApiHeaders("trade", { "Idempotency-Key": crypto.randomUUID() }),
    });

    const body = (await response.json()) as
      | { ok: true; order: { id: string; status: string } }
      | { ok: false; message: string };

    if (!response.ok || !body.ok) {
      setMessage("message" in body ? body.message : "Order could not be cancelled.");
      return;
    }

    await loadTradeState();
    setMessage(`Order ${body.order.id} cancelled.`);
  }

  async function openDocument(document: AccountDocument) {
    const response = await fetch(`/api/account-documents/${document.id}`, {
      headers: await buildApiHeaders("trade"),
    });
    const body = (await response.json()) as
      | { ok: true; downloadUrl: string }
      | { ok: false; message: string };

    if (!response.ok || !body.ok) {
      setMessage("message" in body ? body.message : "Document could not be opened.");
      return;
    }

    window.open(body.downloadUrl, "_blank", "noopener,noreferrer");
    setMessage(`${document.reference} opened.`);
  }

  const orderSubtotalExGstCents = orderLines.reduce((sum, line) => sum + (line.lineTotalExGstCents ?? 0), 0);
  const orderGstCents = orderLines.reduce((sum, line) => sum + (line.gstCents ?? 0), 0);
  const orderTotalIncGstCents = orderSubtotalExGstCents + orderGstCents;

  return (
    <>
      <section className="two-column" id="lookup" style={{ marginTop: 18 }}>
        <div className="panel">
          <h2>Vehicle lookup</h2>
          <div className="form-grid">
            <label>
              Rego
              <input value={rego} onChange={(event) => setRego(event.target.value)} />
            </label>
            <label>
              VIN
              <input value={vin} onChange={(event) => setVin(event.target.value)} />
            </label>
            <label>
              Search keyword
              <input value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label>
              PO / job number
              <input value={poNumber} onChange={(event) => setPoNumber(event.target.value)} />
            </label>
          </div>
          <p>
            <button className="primary-button" onClick={searchParts} type="button">
              Search matching parts
            </button>
          </p>
          {vehicle ? (
            <div className="card-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <div className="card">
                <span>Make</span>
                <strong>{vehicle.make}</strong>
              </div>
              <div className="card">
                <span>Model</span>
                <strong>{vehicle.model}</strong>
              </div>
              <div className="card">
                <span>Year</span>
                <strong>{vehicle.year ?? "Review"}</strong>
              </div>
              <div className="card">
                <span>Market</span>
                <strong>{vehicle.market}</strong>
              </div>
            </div>
          ) : null}
        </div>

        <div className="panel">
          <h2>Quote / order pad</h2>
          <p>Trade pricing and account terms are shown only after account approval and login.</p>
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Part</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {orderLines.length ? (
                  orderLines.map((line) => (
                    <tr key={line.sku}>
                      <td>{line.sku}</td>
                      <td>{line.name}</td>
                      <td>{line.quantity}</td>
                      <td>{formatMoney(line.unitPriceExGstCents)} ex GST</td>
                      <td>{formatMoney(line.lineTotalIncGstCents)} inc GST</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>No parts selected.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {orderLines.length ? (
            <p>
              Subtotal {formatMoney(orderSubtotalExGstCents)} ex GST · GST {formatMoney(orderGstCents)} · Total{" "}
              <strong>{formatMoney(orderTotalIncGstCents)} inc GST</strong>
            </p>
          ) : null}
          <p>
            <button className="primary-button" disabled={!orderLines.length} onClick={submitOrder} type="button">
              Submit order
            </button>
          </p>
        </div>
      </section>

      <p className="badge" role="status">
        {message}
      </p>

      <section className="table-shell" style={{ marginTop: 18 }}>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Brand</th>
              <th>Part</th>
              <th>Fitment</th>
              <th>Available</th>
              <th>Trade price</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {matches.length ? (
              matches.map((part) => (
                <tr key={part.sku}>
                  <td>{part.sku}</td>
                  <td>{part.brand}</td>
                  <td>{part.name}</td>
                  <td>{part.fitmentConfidence}</td>
                  <td>{part.available}</td>
                  <td>{formatMoney(part.tradePriceExGstCents)} ex GST</td>
                  <td>
                    <button
                      className="primary-button"
                      disabled={part.available <= 0}
                      onClick={() => addToOrder(part)}
                      type="button"
                    >
                      Add
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>Search for a vehicle to show matched parts.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="two-column" id="orders" style={{ marginTop: 18 }}>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>PO / job</th>
                <th>Lines</th>
                <th>Total</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.length ? (
                orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td>{order.status}</td>
                    <td>{order.poNumber ?? "Not supplied"}</td>
                    <td>{order.lines.map((line) => `${line.sku} x ${line.quantity}`).join(", ")}</td>
                    <td>{formatMoney(order.totalIncGstCents)} inc GST</td>
                    <td>
                      <button
                        className="secondary-button"
                        disabled={["dispatched", "cancelled"].includes(order.status)}
                        onClick={() => void cancelOrder(order.id)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>Submitted orders will appear here.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-shell" id="documents">
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Reference</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {accountDocuments.length ? (
                accountDocuments.map((document) => (
                  <tr key={document.id}>
                    <td>{document.type.replace("_", " ")}</td>
                    <td>{document.reference}</td>
                    <td>{new Date(document.createdAt).toLocaleDateString("en-AU")}</td>
                    <td>
                      <button className="secondary-button" onClick={() => void openDocument(document)} type="button">
                        Open {document.reference}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>Invoices, delivery records and statements will appear here after release.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
