"use client";

import { Calculator, ClipboardText, CreditCard } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { AdminSectionId } from "../lib/adminSections";
import { buildApiHeaders } from "../lib/clientAuth";
import { useSensitiveFetch } from "./MfaStepUpProvider";
import { useDraftChanges } from "../hooks/useDraftChanges";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";

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
const uncertainOutcome = "Result could not be confirmed. Check saved records before retrying.";

export function AdminOperationsPanel({ section = "all" }: { section?: AdminSectionId | "all" }) {
  const sensitiveFetch = useSensitiveFetch();
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
  const [messages, setMessages] = useState({ costs: "Finance actions are audit logged.", accounts: "Account actions are audit logged.", orders: "RMA actions are audit logged." });
  const [pending, setPending] = useState<"costs" | "accounts" | "orders" | null>(null);
  const [, markCostsSaved] = useDraftChanges({ shipmentId, costStatus, basis, costs });
  const [, markAccountSaved] = useDraftChanges({ accountId, entryType, amount, reference });
  const [, markRmaSaved] = useDraftChanges({ rmaId, outcome, credit });
  useUnsavedChanges(Boolean(pending));
  const locks = useRef(new Set<string>());
  const shipmentRef = useRef<HTMLInputElement>(null); const accountRef = useRef<HTMLInputElement>(null); const rmaRef = useRef<HTMLInputElement>(null);
  const invalidFocus = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (!pending && invalidFocus.current) { invalidFocus.current.focus(); invalidFocus.current = null; } }, [pending, messages]);
  function setOperationMessage(key: "costs" | "accounts" | "orders", value: string) { setMessages((current) => ({ ...current, [key]: value })); }
  async function runOperation(key: "costs" | "accounts" | "orders", action: () => Promise<void>) {
    if (locks.current.has(key)) return; locks.current.add(key); setPending(key);
    try { await action(); } catch { setOperationMessage(key, "Result could not be confirmed. Check saved records before retrying."); }
    finally { locks.current.delete(key); setPending((current) => current === key ? null : current); }
  }
  async function saveLandedCost() {
    if (!shipmentId.trim()) { setOperationMessage("costs", "Shipment ID is required."); invalidFocus.current = shipmentRef.current; return; }
    const response = await sensitiveFetch("/api/admin/landed-costs", {
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
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok === false) setOperationMessage("costs", body?.message || "Landed cost could not be saved.");
    else if (!body?.ok || typeof body.landedCostId !== "string" || typeof body.cashTotalMinor !== "number" || typeof body.cogsTotalMinor !== "number") setOperationMessage("costs", uncertainOutcome);
    else { markCostsSaved(); setOperationMessage("costs", `Landed cost ${body.landedCostId} saved. Cash AUD ${(body.cashTotalMinor / 100).toFixed(2)}; COGS AUD ${(body.cogsTotalMinor / 100).toFixed(2)}.`); }
  }
  async function postAdjustment() {
    if (!accountId.trim()) { setOperationMessage("accounts", "Trade account ID is required."); invalidFocus.current = accountRef.current; return; }
    const response = await sensitiveFetch(
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
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok === false) setOperationMessage("accounts", body?.message || "Account entry could not be posted.");
    else if (!body?.ok || typeof body.ledgerEntryId !== "string") setOperationMessage("accounts", uncertainOutcome);
    else { markAccountSaved(); setOperationMessage("accounts", `Account entry ${body.ledgerEntryId} posted.`); }
  }
  async function inspectRma() {
    if (!rmaId.trim()) { setOperationMessage("orders", "RMA ID is required."); invalidFocus.current = rmaRef.current; return; }
    const response = await sensitiveFetch(`/api/admin/rma/${rmaId}/inspect`, {
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
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok === false) setOperationMessage("orders", body?.message || "RMA inspection could not be recorded.");
    else if (!body?.ok || typeof body.rmaId !== "string") setOperationMessage("orders", uncertainOutcome);
    else { markRmaSaved(); setOperationMessage("orders", `RMA ${body.rmaId} inspection recorded.`); }
  }
  return (
    <fieldset className="operations-grid workspace-form-lock" disabled={Boolean(pending)} id="compliance" hidden={!["all", "costs", "accounts", "orders"].includes(section)}>
      <article className="panel" id="costs" hidden={section !== "all" && section !== "costs"}>
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
              ref={shipmentRef}
              aria-describedby={messages.costs.includes("required") ? "costs-error" : undefined}
              aria-invalid={messages.costs.includes("required") || undefined}
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
          disabled={pending === "costs"}
          onClick={() => void runOperation("costs", saveLandedCost)}
        >
          Save cost version
        </button>
        <p id="costs-error" role={messages.costs.includes("required") ? "alert" : "status"}>{messages.costs}</p>
      </article>
      <article className="panel" hidden={section !== "all" && section !== "accounts"}>
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
              ref={accountRef}
              aria-describedby={messages.accounts.includes("required") ? "accounts-error" : undefined}
              aria-invalid={messages.accounts.includes("required") || undefined}
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
          disabled={pending === "accounts"}
          onClick={() => void runOperation("accounts", postAdjustment)}
        >
          Post account entry
        </button>
        <p id="accounts-error" role={messages.accounts.includes("required") ? "alert" : "status"}>{messages.accounts}</p>
      </article>
      <article className="panel" hidden={section !== "all" && section !== "orders"}>
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
            <input ref={rmaRef} aria-describedby={messages.orders.includes("required") ? "orders-error" : undefined} aria-invalid={messages.orders.includes("required") || undefined} value={rmaId} onChange={(e) => setRmaId(e.target.value)} />
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
          disabled={pending === "orders"}
          onClick={() => void runOperation("orders", inspectRma)}
        >
          Record inspection
        </button>
        <p id="orders-error" role={messages.orders.includes("required") ? "alert" : "status"}>{messages.orders}</p>
      </article>
    </fieldset>
  );
}
