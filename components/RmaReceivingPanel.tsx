"use client";
import { ArrowBendDownLeft } from "@phosphor-icons/react";
import { useState } from "react";
import { buildApiHeaders } from "../lib/clientAuth";
export function RmaReceivingPanel() {
  const [rmaId, setRmaId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [lines, setLines] = useState("");
  const [message, setMessage] = useState(
    "Approved returns enter quarantine on receipt.",
  );
  async function receive() {
    const parsed = lines
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map((row) => {
        const [sku, quantity] = row.split(",").map((v) => v.trim());
        return { sku, quantity: Number(quantity) };
      });
    const response = await fetch(`/api/warehouse/rma/${rmaId}/receive`, {
      method: "POST",
      headers: await buildApiHeaders("warehouse", {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        locationId,
        lines: parsed,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const body = await response.json();
    setMessage(
      response.ok && body.ok
        ? `RMA ${body.rmaId} received into quarantine.`
        : body.message || "RMA could not be received.",
    );
  }
  return (
    <section className="panel" id="returns">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Returns</p>
          <h2>Receive RMA</h2>
        </div>
        <ArrowBendDownLeft size={26} />
      </div>
      <div className="form-grid">
        <label>
          RMA ID
          <input value={rmaId} onChange={(e) => setRmaId(e.target.value)} />
        </label>
        <label>
          Quarantine location ID
          <input
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          />
        </label>
        <label>
          Lines: SKU, quantity
          <textarea
            value={lines}
            onChange={(e) => setLines(e.target.value)}
            placeholder="DM-GWM-0001,1"
          />
        </label>
      </div>
      <button
        className="button button-secondary"
        type="button"
        onClick={() => void receive()}
      >
        Receive return
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
