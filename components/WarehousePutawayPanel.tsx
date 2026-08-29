"use client";

import { ArrowRight, CheckCircle, Package, Scan, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { buildApiHeaders } from "../lib/clientAuth";

type PutawayLine = {
  receiptSessionId: string;
  sku: string;
  productBarcode: string;
  actualQuantity: number;
  remainingQuantity: number;
};

type PutawayScopeResponse =
  | { ok: true; lines: PutawayLine[] }
  | { ok: false; message?: string };

type PutawayResponse =
  | {
      ok: true;
      sourceLocation: string;
      destinationLocation: string;
      remainingQuantity: number;
    }
  | { ok: false; message?: string };

type WarehousePutawayPanelProps = {
  selection: { shipmentId: string; cartonNumbers: string[] };
  onPutawayConfirmed?: (outcome: { quantity: number; destinationLocation: string }) => void;
};

function normalize(value: string) {
  return value.trim().toUpperCase();
}

function scopeUrl(selection: WarehousePutawayPanelProps["selection"]) {
  const params = new URLSearchParams({ shipmentId: selection.shipmentId });
  selection.cartonNumbers.forEach((cartonNumber) => params.append("cartonNumber", cartonNumber));
  return `/api/warehouse/putaway?${params.toString()}`;
}

export function WarehousePutawayPanel({
  selection,
  onPutawayConfirmed,
}: WarehousePutawayPanelProps) {
  const [lines, setLines] = useState<PutawayLine[]>([]);
  const [productBarcode, setProductBarcode] = useState("");
  const [destinationBarcode, setDestinationBarcode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [message, setMessage] = useState("Loading confirmed staging stock.");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PutawayResponse | null>(null);
  const scopeKey = `${selection.shipmentId}:${selection.cartonNumbers.join(",")}`;

  async function loadScope() {
    const response = await fetch(scopeUrl(selection), {
      cache: "no-store",
      headers: await buildApiHeaders("partner"),
    });
    const body = (await response.json()) as PutawayScopeResponse;
    if (!response.ok || !body.ok) {
      setLines([]);
      setMessage(("message" in body && body.message) || "Confirmed staging stock could not be loaded.");
      return;
    }
    setLines(body.lines);
    setMessage(body.lines.length ? "Scan the product and a DMLOC destination label to begin putaway." : "No confirmed staging stock remains in this scope.");
  }

  useEffect(() => {
    setProductBarcode("");
    setDestinationBarcode("");
    setQuantity("1");
    setResult(null);
    void loadScope();
    // scopeKey represents the selection value, avoiding a rerun for an equivalent array instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const selectedLine = useMemo(
    () => lines.find((line) => normalize(line.productBarcode) === normalize(productBarcode)),
    [lines, productBarcode],
  );
  const parsedQuantity = Number.parseInt(quantity || "0", 10) || 0;
  const destinationLooksScanned = normalize(destinationBarcode).startsWith("DMLOC:");
  const canConfirm = Boolean(
    selectedLine
      && destinationLooksScanned
      && parsedQuantity > 0
      && parsedQuantity <= selectedLine.remainingQuantity
      && !busy,
  );

  async function confirmPutaway() {
    if (!canConfirm) return;
    setBusy(true);
    try {
      const response = await fetch("/api/warehouse/putaway", {
        method: "POST",
        headers: await buildApiHeaders("partner", { "Content-Type": "application/json" }),
        body: JSON.stringify({
          selection,
          productBarcode,
          destinationBarcode,
          quantity: parsedQuantity,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const body = (await response.json()) as PutawayResponse;
      if (!response.ok || !body.ok) {
        setMessage(("message" in body && body.message) || "Putaway could not be confirmed.");
        return;
      }
      setResult(body);
      setLines((current) => current
        .map((line) => normalize(line.productBarcode) === normalize(productBarcode)
          ? { ...line, remainingQuantity: body.remainingQuantity }
          : line)
        .filter((line) => line.remainingQuantity > 0));
      setMessage(`Moved ${parsedQuantity} units from ${body.sourceLocation} to ${body.destinationLocation}.`);
      setProductBarcode("");
      setDestinationBarcode("");
      setQuantity("1");
      onPutawayConfirmed?.({ quantity: parsedQuantity, destinationLocation: body.destinationLocation });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inbound-workgrid" id="put-away">
      <section className="inbound-work-panel">
        <div className="inbound-work-heading">
          <div><h2>Put away</h2><p>Scan the product, scan the destination location label, then confirm the quantity.</p></div>
          <Package size={27} weight="duotone" />
        </div>
        <div className="inbound-putaway-steps">
          <section>
            <span>1</span>
            <div><strong>Scan product barcode</strong><p>Product barcode identifies the item to move.</p><input aria-label="Scan product barcode" value={productBarcode} onChange={(event) => setProductBarcode(event.target.value)} placeholder="Scanner ready. Scan products.barcode." /></div>
          </section>
          <section>
            <span>2</span>
            <div><strong>Scan destination location</strong><p>Location labels use the DMLOC namespace.</p><input aria-label="Scan destination location" value={destinationBarcode} onChange={(event) => setDestinationBarcode(event.target.value)} placeholder="Scanner ready. Scan DMLOC location." />{destinationBarcode ? <b className={destinationLooksScanned ? "is-valid" : "is-invalid"}>{destinationLooksScanned ? "Valid location" : "DMLOC required"}</b> : null}</div>
          </section>
          <section>
            <span>3</span>
            <div><strong>Move quantity</strong><p>{selectedLine ? `Maximum available in staging: ${selectedLine.remainingQuantity} units` : "Scan a recognised product to view staged quantity."}</p><input aria-label="Move quantity" min="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
          </section>
        </div>
        {lines.length === 0 ? <p className="inbound-empty-state"><WarningCircle size={18} />No confirmed staging stock remains in this scope.</p> : null}
        <div className="inbound-actions inbound-receipt-actions"><button className="button button-primary" disabled={!canConfirm} type="button" onClick={() => void confirmPutaway()}>{busy ? "Confirming..." : "Confirm put away"}<ArrowRight size={18} /></button></div>
      </section>

      <aside className="inbound-summary-panel inbound-putaway-summary">
        <h2>Move preview</h2><p>Validated before the inventory movement is recorded.</p>
        <span className="inbound-section-label">Product</span><strong className="inbound-mono-value">{selectedLine?.sku ?? "Awaiting product scan"}</strong>
        <span className="inbound-section-label">System source</span><strong>BNE-RECEIVING-STAGING</strong><p className="inbound-helper-copy">The source is resolved by the system and is not a scan field.</p>
        <span className="inbound-section-label">Scanned destination</span><strong className="inbound-mono-value">{destinationLooksScanned ? normalize(destinationBarcode).slice("DMLOC:".length) : "Awaiting DMLOC scan"}</strong>
        <span className="inbound-section-label">Movement quantity</span><strong className="inbound-putaway-quantity">{parsedQuantity > 0 ? `${parsedQuantity} units` : "Awaiting quantity"}</strong>
        <div className={`inbound-putaway-ready ${canConfirm ? "is-ready" : ""}`}>{canConfirm ? <CheckCircle size={18} weight="fill" /> : <Scan size={18} weight="duotone" />}<strong>{canConfirm ? "Ready to move" : "Scan required fields"}</strong></div>
        {result?.ok ? <p className="inbound-putaway-result">Putaway audit has been recorded.</p> : null}
      </aside>
      <p className="inbound-message" role="status">{message}</p>
    </div>
  );
}
