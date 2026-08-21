"use client";

import { Calculator, ClipboardText, CreditCard } from "@phosphor-icons/react";
import { useState } from "react";
import { buildApiHeaders } from "../lib/clientAuth";

const emptyCosts = {
  domesticLogisticsMinor: 0,
  oceanFreightMinor: 0,
  insuranceMinor: 0,
  dutyMinor: 0,
  importGstMinor: 0,
  brokerageMinor: 0,
  portChargesMinor: 0,
  australiaDeliveryMinor: 0,
  otherCostsMinor: 0,
};
const costLabels: Array<[keyof typeof emptyCosts, string]> = [
  ["domesticLogisticsMinor", "China logistics"],
  ["oceanFreightMinor", "Ocean freight"],
  ["insuranceMinor", "Insurance"],
  ["dutyMinor", "Duty"],
  ["importGstMinor", "Import GST"],
  ["brokerageMinor", "Brokerage"],
  ["portChargesMinor", "Port charges"],
  ["australiaDeliveryMinor", "AU delivery"],
  ["otherCostsMinor", "Other"],
];

export function AdminOperationsPanel() {
  const [shipmentId, setShipmentId] = useState("");
  const [costStatus, setCostStatus] = useState<"provisional" | "final">(
    "provisional",
  );
  const [basis, setBasis] = useState<
    "value" | "quantity" | "weight" | "volume"
  >("value");
  const [costs, setCosts] = useState(emptyCosts);
  const [accountId, setAccountId] = useState("");
  const [entryType, setEntryType] = useState<
    "payment" | "credit_adjustment" | "debit_adjustment" | "rebate"
  >("payment");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [rmaId, setRmaId] = useState("");
  const [outcome, setOutcome] = useState<
    | "quality_confirmed"
    | "no_fault_found"
    | "customer_fitment_error"
    | "carrier_damage"
  >("quality_confirmed");
  const [credit, setCredit] = useState("0");
  const [message, setMessage] = useState(
    "Finance and RMA actions are audit logged.",
  );
  async function saveLandedCost() {
    const response = await fetch("/api/admin/landed-costs", {
      method: "POST",
      headers: await buildApiHeaders("admin", {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        shipmentId,
        status: costStatus,
        allocationBasis: basis,
        costs,
        sourceEvidence: [],
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const body = await response.json();
    setMessage(
      response.ok && body.ok
        ? `Landed cost ${body.landedCostId} saved. Cash AUD ${(body.cashTotalMinor / 100).toFixed(2)}; COGS AUD ${(body.cogsTotalMinor / 100).toFixed(2)}.`
        : body.message || "Landed cost could not be saved.",
    );
  }
  async function postAdjustment() {
    const response = await fetch(
      `/api/admin/accounts/${accountId}/adjustments`,
      {
        method: "POST",
        headers: await buildApiHeaders("admin", {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          entryType,
          amountCents: Math.round(Number(amount) * 100),
          reference,
          idempotencyKey: crypto.randomUUID(),
        }),
      },
    );
    const body = await response.json();
    setMessage(
      response.ok && body.ok
        ? `Account entry ${body.ledgerEntryId} posted.`
        : body.message || "Account entry could not be posted.",
    );
  }
  async function inspectRma() {
    const response = await fetch(`/api/admin/rma/${rmaId}/inspect`, {
      method: "POST",
      headers: await buildApiHeaders("admin", {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        outcome,
        creditAmountCents: Math.round(Number(credit) * 100),
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const body = await response.json();
    setMessage(
      response.ok && body.ok
        ? `RMA ${body.rmaId} inspection recorded.`
        : body.message || "RMA inspection could not be recorded.",
    );
  }
  return (
    <section className="operations-grid" id="compliance">
      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Shipment finance</p>
            <h2>Landed cost version</h2>
          </div>
          <Calculator size={26} />
        </div>
        <div className="form-grid">
          <label>
            Shipment ID
            <input
              value={shipmentId}
              onChange={(e) => setShipmentId(e.target.value)}
            />
          </label>
          <label>
            Status
            <select
              value={costStatus}
              onChange={(e) =>
                setCostStatus(e.target.value as typeof costStatus)
              }
            >
              <option value="provisional">Provisional</option>
              <option value="final">Final</option>
            </select>
          </label>
          <label>
            Allocation basis
            <select
              value={basis}
              onChange={(e) => setBasis(e.target.value as typeof basis)}
            >
              <option value="value">Purchase value</option>
              <option value="quantity">Quantity</option>
              <option value="weight">Weight</option>
              <option value="volume">Volume</option>
            </select>
          </label>
        </div>
        <div className="cost-grid">
          {costLabels.map(([key, label]) => (
            <label key={key}>
              {label} AUD
              <input
                inputMode="decimal"
                value={(costs[key] / 100).toString()}
                onChange={(e) =>
                  setCosts((current) => ({
                    ...current,
                    [key]: Math.round(Number(e.target.value || 0) * 100),
                  }))
                }
              />
            </label>
          ))}
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() => void saveLandedCost()}
        >
          Save cost version
        </button>
      </article>
      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Accounts</p>
            <h2>Payment or adjustment</h2>
          </div>
          <CreditCard size={26} />
        </div>
        <div className="form-grid">
          <label>
            Trade account ID
            <input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            />
          </label>
          <label>
            Entry type
            <select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as typeof entryType)}
            >
              <option value="payment">Payment</option>
              <option value="credit_adjustment">Credit adjustment</option>
              <option value="debit_adjustment">Debit adjustment</option>
              <option value="rebate">Manual rebate</option>
            </select>
          </label>
          <label>
            Amount AUD
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            Reference
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void postAdjustment()}
        >
          Post account entry
        </button>
      </article>
      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Returns</p>
            <h2>Inspect quarantined RMA</h2>
          </div>
          <ClipboardText size={26} />
        </div>
        <div className="form-grid">
          <label>
            RMA ID
            <input value={rmaId} onChange={(e) => setRmaId(e.target.value)} />
          </label>
          <label>
            Outcome
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as typeof outcome)}
            >
              <option value="quality_confirmed">Quality confirmed</option>
              <option value="no_fault_found">No fault found</option>
              <option value="customer_fitment_error">
                Workshop fitment error
              </option>
              <option value="carrier_damage">Carrier damage</option>
            </select>
          </label>
          <label>
            Credit amount AUD
            <input
              inputMode="decimal"
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
            />
          </label>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void inspectRma()}
        >
          Record inspection
        </button>
      </article>
      <p className="operations-message" role="status">
        {message}
      </p>
    </section>
  );
}
