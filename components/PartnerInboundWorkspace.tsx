"use client";

import Image from "next/image";
import Link from "next/link";
import JsBarcode from "jsbarcode";
import {
  ArrowRight,
  Barcode,
  CheckCircle,
  ClipboardText,
  Package,
  Printer,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildApiHeaders } from "../lib/clientAuth";
import type { PrearrivalShipmentSummary, WarehouseLabelPrintJob } from "../lib/repository";
import type { ReceiptDiscrepancyType, WarehouseReceiptScope } from "../lib/warehouseReceiving";
import { WarehousePutawayPanel } from "./WarehousePutawayPanel";
import { ReceiptHistoryPanel } from "./ReceiptHistoryPanel";

type WorkspaceView = "label_print" | "receive_stock" | "put_away" | "receipt_history";
type PrintPanelState = "select" | "preview" | "awaiting_outcome" | "confirmed" | "cancelled";

type ScopePreview = {
  shipment: {
    shipmentId: string;
    shipmentReference?: string;
    pallets: Array<{ sourcePalletNumber: string }>;
    cartons: Array<{ sourceCartonNumber: string; sourcePalletNumber?: string }>;
  };
  scope: WarehouseReceiptScope;
  printGate: { ok: boolean; message?: string };
};

type ScopePreviewResponse =
  | ({ ok: true } & ScopePreview)
  | { ok: false; message?: string };
type ShipmentListResponse =
  | { ok: true; shipments: PrearrivalShipmentSummary[] }
  | { ok: false; message?: string };
type PrintJobResponse =
  | { ok: true; job: WarehouseLabelPrintJob }
  | { ok: false; message?: string };
type ReceiptResponse =
  | { ok: true; stagingLocation?: string; session: { id: string; status: string } }
  | { ok: false; message?: string };
type PutawayScopeResponse =
  | { ok: true; lines: Array<{ remainingQuantity: number }> }
  | { ok: false; message?: string };

function normalizeBarcode(value: string) {
  return value.trim().toUpperCase();
}

function quantityFor(scope: WarehouseReceiptScope) {
  return scope.lines.reduce((total, line) => total + line.expectedQuantity, 0);
}

function defaultDiscrepancyType(actual: number, expected: number): ReceiptDiscrepancyType {
  return actual < expected ? "short_pack" : "over_received";
}

function ProductLabel({ sku, barcode }: { sku: string; barcode: string }) {
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!barcodeRef.current || !barcode) return;
    JsBarcode(barcodeRef.current, barcode, {
      format: "CODE128",
      displayValue: false,
      height: 38,
      margin: 0,
      width: 1.15,
    });
  }, [barcode]);

  return (
    <article className="inbound-product-label" aria-label={`Unit product label for ${sku}`}>
      <strong>DriveMate Parts</strong>
      <span>Unit product label</span>
      <code>Part No. {sku}</code>
      <svg ref={barcodeRef} aria-label={`Code 128 barcode ${barcode}`} role="img" />
      <code>{barcode}</code>
    </article>
  );
}

function makeScopeUrl(shipmentId: string, palletNumbers: string[]) {
  const params = new URLSearchParams({ shipmentId });
  palletNumbers.forEach((palletNumber) => params.append("palletNumber", palletNumber));
  return `/api/warehouse/labels?${params.toString()}`;
}

function WarehousePackingListGate({
  shipments,
  shipmentId,
  onShipmentChange,
}: {
  shipments: PrearrivalShipmentSummary[];
  shipmentId: string;
  onShipmentChange: (shipmentId: string) => void;
}) {
  const selectedShipment = shipments.find((shipment) => shipment.shipmentId === shipmentId);
  const statusCopy = selectedShipment?.packingListStatus === "draft"
    ? `Draft v${selectedShipment.latestPackingListVersion ?? 1} exists, but it has not been confirmed.`
    : "No Packing List revision has been confirmed for this Shipment.";

  return (
    <div className="inbound-app" id="inbound-operations">
      <aside className="inbound-sidebar" aria-label="Inbound operations navigation">
        <div className="inbound-brand">
          <Image src="/assets/brand/DriveMate_Parts_Primary_Lockup_v2.0.svg" alt="DriveMate Parts" width={135} height={34} priority />
          <p>Warehouse</p>
          <span>Internal operations</span>
        </div>
        <div className="inbound-section-title">Inbound operations</div>
        <nav className="inbound-nav" aria-label="Locked inbound operations">
          <span>Current work</span>
          <a aria-disabled="true" href="#packing-list-gate">Label print</a>
          <a aria-disabled="true" href="#packing-list-gate">Receive stock</a>
          <a aria-disabled="true" href="#packing-list-gate">Put away</a>
          <a aria-disabled="true" href="#packing-list-gate">Receipt history</a>
        </nav>
        <div className="inbound-rules">
          <span>Required source data</span>
          <p>Confirmed Packing List</p>
          <p>Pallet and carton structure</p>
          <p>Recognised SKU quantities</p>
        </div>
        <div className="inbound-phase-note"><span>Warehouse gate</span><p>Source data pending</p></div>
      </aside>

      <section className="inbound-content">
        <header className="inbound-topbar"><h1>Inbound operations</h1><div><span>Warehouse only</span><b>W</b></div></header>
        <main className="inbound-main" id="packing-list-gate">
          <section className="inbound-scope-bar">
            <div><span>Selected Shipment</span><strong>{selectedShipment?.shipmentReference ?? shipmentId}</strong></div>
            <p>Warehouse operations are unavailable until source quantities are confirmed.</p>
            <select aria-label="Shipment" value={shipmentId} onChange={(event) => onShipmentChange(event.target.value)}>
              {shipments.map((shipment) => <option key={shipment.shipmentId} value={shipment.shipmentId}>{shipment.shipmentReference ?? shipment.shipmentId}</option>)}
            </select>
          </section>

          <section className="inbound-packing-list-gate" role="status">
            <WarningCircle size={30} weight="fill" />
            <div>
              <span>Source data required</span>
              <h2>Packing List confirmation required</h2>
              <p>{statusCopy} Complete the export pallet, carton and SKU structure in Pre-arrival before printing or receiving stock.</p>
            </div>
            <Link className="button button-primary" href={`/prearrival?shipmentId=${encodeURIComponent(shipmentId)}`}>
              Open Pre-arrival <ArrowRight size={18} />
            </Link>
          </section>

          <section className="inbound-setup-explanation" aria-label="Warehouse unlock requirements">
            <div><strong>Confirm source structure</strong><p>Record every pallet, carton, SKU and expected quantity in an immutable Packing List version.</p></div>
            <div><strong>Prepare product labels</strong><p>Warehouse label selection becomes available from the confirmed quantities.</p></div>
            <div><strong>Receive and put away</strong><p>Print confirmation unlocks receipt, then confirmed receipt unlocks destination scanning.</p></div>
          </section>
        </main>
      </section>
    </div>
  );
}

export function PartnerInboundWorkspace() {
  const [shipments, setShipments] = useState<PrearrivalShipmentSummary[]>([]);
  const [shipmentId, setShipmentId] = useState("");
  const [selectedPallets, setSelectedPallets] = useState<string[]>([]);
  const [preview, setPreview] = useState<ScopePreview | null>(null);
  const [view, setView] = useState<WorkspaceView>("label_print");
  const [putawayReady, setPutawayReady] = useState(false);
  const [printState, setPrintState] = useState<PrintPanelState>("select");
  const [printJob, setPrintJob] = useState<WarehouseLabelPrintJob | null>(null);
  const [message, setMessage] = useState("Loading inbound shipment data.");
  const [busy, setBusy] = useState(false);
  const [scannerValue, setScannerValue] = useState("");
  const [activeBarcode, setActiveBarcode] = useState<string | null>(null);
  const [receiptMode, setReceiptMode] = useState<"scan_each" | "counted_quantity">("scan_each");
  const [scannedProductBarcodes, setScannedProductBarcodes] = useState<string[]>([]);
  const [completedCountedBarcodes, setCompletedCountedBarcodes] = useState<string[]>([]);
  const [actualByBarcode, setActualByBarcode] = useState<Record<string, number>>({});
  const [discrepancyReasonByBarcode, setDiscrepancyReasonByBarcode] = useState<Record<string, string>>({});
  const [discrepancyTypeByBarcode, setDiscrepancyTypeByBarcode] = useState<Record<string, ReceiptDiscrepancyType>>({});
  const [receiptResult, setReceiptResult] = useState<{ sessionId: string; stagingLocation?: string } | null>(null);
  const [putawayResult, setPutawayResult] = useState<{ quantity: number; destinationLocation: string } | null>(null);
  const [reprintReason, setReprintReason] = useState("");

  const receiptUnlocked = preview?.printGate.ok === true;
  const expectedUnits = preview ? quantityFor(preview.scope) : 0;
  const activePalletLabel = selectedPallets.length === 1
    ? `Pallet ${selectedPallets[0]}`
    : `${selectedPallets.length} pallets`;

  async function loadScope(nextShipmentId: string, palletNumbers: string[]) {
    if (!nextShipmentId) return;
    const response = await fetch(makeScopeUrl(nextShipmentId, palletNumbers), {
      cache: "no-store",
      headers: await buildApiHeaders("warehouse_staff"),
    });
    const body = (await response.json()) as ScopePreviewResponse;
    if (!response.ok || !body.ok) {
      setPreview(null);
      setMessage(("message" in body && body.message) || "Inbound scope could not be loaded.");
      return;
    }
    setPreview(body);
    setActualByBarcode(Object.fromEntries(
      body.scope.lines.map((line) => [normalizeBarcode(line.productBarcode), 0]),
    ));
    setScannedProductBarcodes([]);
    setCompletedCountedBarcodes([]);
    setActiveBarcode(null);
    setDiscrepancyReasonByBarcode({});
    setDiscrepancyTypeByBarcode({});
    setReceiptResult(null);
    setPutawayResult(null);
    void loadPutawayAvailability(nextShipmentId, body.scope.cartonNumbers);
    setMessage(body.printGate.ok ? "Label print confirmed. Receipt unlocked for this scope." : "Select the label queue, then confirm the physical print result.");
  }

  async function loadPutawayAvailability(nextShipmentId: string, cartonNumbers: string[]) {
    const params = new URLSearchParams({ shipmentId: nextShipmentId });
    cartonNumbers.forEach((cartonNumber) => params.append("cartonNumber", cartonNumber));
    const response = await fetch(`/api/warehouse/putaway?${params.toString()}`, {
      cache: "no-store",
      headers: await buildApiHeaders("warehouse_staff"),
    });
    const body = (await response.json()) as PutawayScopeResponse;
    setPutawayReady(response.ok && body.ok && body.lines.some((line) => line.remainingQuantity > 0));
  }

  async function loadWorkspace() {
    const response = await fetch("/api/prearrival/shipments", {
      cache: "no-store",
      headers: await buildApiHeaders("warehouse_staff"),
    });
    const body = (await response.json()) as ShipmentListResponse;
    if (!response.ok || !body.ok || !body.shipments.length) {
      setMessage(("message" in body && body.message) || "No inbound shipments are available.");
      return;
    }
    setShipments(body.shipments);
    const requestedShipmentId = new URLSearchParams(window.location.search).get("shipmentId");
    const requestedShipment = body.shipments.find(
      (shipment) => shipment.shipmentId === requestedShipmentId,
    );
    const firstShipment = requestedShipment
      ?? body.shipments.find((shipment) => shipment.packingListStatus === "confirmed")
      ?? body.shipments[0];
    const firstShipmentId = firstShipment.shipmentId;
    setShipmentId(firstShipmentId);

    if (firstShipment.packingListStatus !== "confirmed") {
      setPreview(null);
      setSelectedPallets([]);
      setMessage("Confirm the Shipment Packing List in Pre-arrival to unlock Warehouse.");
      return;
    }

    const allScopeResponse = await fetch(makeScopeUrl(firstShipmentId, []), {
      cache: "no-store",
      headers: await buildApiHeaders("warehouse_staff"),
    });
    const allScope = (await allScopeResponse.json()) as ScopePreviewResponse;
    if (!allScopeResponse.ok || !allScope.ok) {
      setMessage(("message" in allScope && allScope.message) || "Inbound scope could not be loaded.");
      return;
    }
    const firstPallet = allScope.shipment.pallets[0]?.sourcePalletNumber;
    const initialPallets = firstPallet ? [firstPallet] : [];
    setSelectedPallets(initialPallets);
    await loadScope(firstShipmentId, initialPallets);
  }

  useEffect(() => {
    void loadWorkspace();
  }, []);

  function switchShipment(nextShipmentId: string) {
    setShipmentId(nextShipmentId);
    setPrintJob(null);
    setPrintState("select");
    setPutawayReady(false);
    setPutawayResult(null);
    const nextShipment = shipments.find((shipment) => shipment.shipmentId === nextShipmentId);
    if (nextShipment?.packingListStatus !== "confirmed") {
      setPreview(null);
      setSelectedPallets([]);
      setMessage("Confirm the Shipment Packing List in Pre-arrival to unlock Warehouse.");
      return;
    }
    void (async () => {
      const response = await fetch(makeScopeUrl(nextShipmentId, []), {
        cache: "no-store",
        headers: await buildApiHeaders("warehouse_staff"),
      });
      const body = (await response.json()) as ScopePreviewResponse;
      if (!response.ok || !body.ok) {
        setMessage(("message" in body && body.message) || "Inbound scope could not be loaded.");
        return;
      }
      const firstPallet = body.shipment.pallets[0]?.sourcePalletNumber;
      const nextPallets = firstPallet ? [firstPallet] : [];
      setSelectedPallets(nextPallets);
      await loadScope(nextShipmentId, nextPallets);
    })();
  }

  function togglePallet(palletNumber: string, checked: boolean) {
    const nextPallets = checked
      ? [...new Set([...selectedPallets, palletNumber])]
      : selectedPallets.filter((value) => value !== palletNumber);
    if (!nextPallets.length) {
      setMessage("Keep at least one pallet selected for label preparation.");
      return;
    }
    setSelectedPallets(nextPallets);
    setPrintJob(null);
    setPrintState("select");
    setPutawayReady(false);
    setPutawayResult(null);
    void loadScope(shipmentId, nextPallets);
  }

  async function createPrintJob() {
    if (!preview) return;
    setBusy(true);
    try {
      const response = await fetch("/api/warehouse/labels", {
        method: "POST",
        headers: await buildApiHeaders("warehouse_staff", { "Content-Type": "application/json" }),
        body: JSON.stringify({
          selection: { shipmentId, palletNumbers: selectedPallets },
          templateId: "unit_product",
        }),
      });
      const body = (await response.json()) as PrintJobResponse;
      if (!response.ok || !body.ok) {
        setMessage(("message" in body && body.message) || "Label print job could not be created.");
        return;
      }
      setPrintJob(body.job);
      setPrintState("awaiting_outcome");
      setMessage("Windows print dialog opened. Confirm the physical result after labels are available.");
      window.print();
    } finally {
      setBusy(false);
    }
  }

  async function recordPrintOutcome(outcome: "printed" | "cancelled") {
    if (!printJob) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/warehouse/labels/${encodeURIComponent(printJob.id)}`, {
        method: "POST",
        headers: await buildApiHeaders("warehouse_staff", { "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "outcome", outcome }),
      });
      const body = (await response.json()) as PrintJobResponse;
      if (!response.ok || !body.ok) {
        setMessage(("message" in body && body.message) || "Print outcome could not be recorded.");
        return;
      }
      setPrintJob(body.job);
      setPrintState(outcome === "printed" ? "confirmed" : "cancelled");
      await loadScope(shipmentId, selectedPallets);
      setMessage(outcome === "printed" ? "Receipt unlocked for the selected scope." : "Print cancelled. Receipt remains locked.");
    } finally {
      setBusy(false);
    }
  }

  async function createReprint() {
    if (!printJob || !reprintReason.trim()) {
      setMessage("A reprint reason is required.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/warehouse/labels/${encodeURIComponent(printJob.id)}`, {
        method: "POST",
        headers: await buildApiHeaders("warehouse_staff", { "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "reprint",
          requestedQuantity: printJob.requestedQuantity,
          reason: reprintReason.trim(),
        }),
      });
      const body = (await response.json()) as PrintJobResponse;
      if (!response.ok || !body.ok) {
        setMessage(("message" in body && body.message) || "Reprint job could not be created.");
        return;
      }
      setPrintJob(body.job);
      setPrintState("awaiting_outcome");
      setReprintReason("");
      setMessage("Reprint job created. Print the selected labels, then confirm the physical result.");
      window.print();
    } finally {
      setBusy(false);
    }
  }

  function recordProductScan() {
    if (!preview) return;
    const barcode = normalizeBarcode(scannerValue);
    const expectedLine = preview.scope.lines.find(
      (line) => normalizeBarcode(line.productBarcode) === barcode,
    );
    if (!expectedLine) {
      setMessage("This product barcode is outside the selected receipt scope.");
      return;
    }
    setScannedProductBarcodes((current) => [...current, barcode]);
    setActiveBarcode(barcode);
    if (receiptMode === "counted_quantity") {
      setCompletedCountedBarcodes((current) => current.filter((value) => value !== barcode));
    }
    if (receiptMode === "scan_each") {
      setActualByBarcode((current) => ({
        ...current,
        [barcode]: (current[barcode] ?? 0) + 1,
      }));
    }
    setScannerValue("");
    setMessage(`${expectedLine.sku} recognised for the selected receipt scope.`);
  }

  function updateActual(barcode: string, value: string, expected: number) {
    const actual = Math.max(0, Number.parseInt(value || "0", 10) || 0);
    setActualByBarcode((current) => ({ ...current, [barcode]: actual }));
    if (actual !== expected) {
      setDiscrepancyTypeByBarcode((current) => ({
        ...current,
        [barcode]: current[barcode] ?? defaultDiscrepancyType(actual, expected),
      }));
    }
  }

  const receiptLines = useMemo(() => preview?.scope.lines.map((line) => {
    const barcode = normalizeBarcode(line.productBarcode);
    return {
      ...line,
      barcode,
      actualQuantity: actualByBarcode[barcode] ?? 0,
      scanned: scannedProductBarcodes.includes(barcode),
    };
  }) ?? [], [actualByBarcode, preview, scannedProductBarcodes]);

  const totalActual = receiptLines.reduce((total, line) => total + line.actualQuantity, 0);
  const activeReceiptLine = activeBarcode
    ? receiptLines.find((line) => line.barcode === activeBarcode)
    : undefined;
  const activeLineHasDifferenceReason = activeReceiptLine
    ? (discrepancyReasonByBarcode[activeReceiptLine.barcode] ?? "").trim().length >= 3
    : false;
  const activeLineCanBeRecorded = Boolean(
    activeReceiptLine && (
      activeReceiptLine.actualQuantity === activeReceiptLine.expectedQuantity || activeLineHasDifferenceReason
    ),
  );
  const canConfirmReceipt = receiptUnlocked && !busy && !receiptResult && receiptLines.length > 0 && receiptLines.every((line) => {
    if (!line.scanned) return false;
    if (receiptMode === "scan_each") return line.actualQuantity === line.expectedQuantity;
    return completedCountedBarcodes.includes(line.barcode)
      && (line.actualQuantity === line.expectedQuantity || (discrepancyReasonByBarcode[line.barcode] ?? "").trim().length >= 3);
  });

  function recordCountedLine() {
    if (!activeReceiptLine || !activeLineCanBeRecorded) return;
    setCompletedCountedBarcodes((current) => [...new Set([...current, activeReceiptLine.barcode])]);
    setActiveBarcode(null);
    setMessage(`${activeReceiptLine.sku} count recorded for this receipt.`);
  }

  async function confirmReceipt() {
    if (!preview || !canConfirmReceipt) return;
    setBusy(true);
    try {
      const response = await fetch("/api/warehouse/receipts", {
        method: "POST",
        headers: await buildApiHeaders("warehouse_staff", { "Content-Type": "application/json" }),
        body: JSON.stringify({
          selection: {
            shipmentId: preview.scope.shipmentId,
            cartonNumbers: preview.scope.cartonNumbers,
          },
          mode: receiptMode,
          scannedProductBarcodes,
          countedLines: receiptMode === "counted_quantity"
            ? receiptLines.map((line) => ({
                productBarcode: line.productBarcode,
                actualQuantity: line.actualQuantity,
                ...(line.actualQuantity !== line.expectedQuantity
                  ? {
                      discrepancy: {
                        type: discrepancyTypeByBarcode[line.barcode] ?? defaultDiscrepancyType(line.actualQuantity, line.expectedQuantity),
                        reason: discrepancyReasonByBarcode[line.barcode]?.trim() ?? "",
                      },
                    }
                  : {}),
              }))
            : [],
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const body = (await response.json()) as ReceiptResponse;
      if (!response.ok || !body.ok) {
        setMessage(("message" in body && body.message) || "Receipt could not be confirmed.");
        return;
      }
      setReceiptResult({ sessionId: body.session.id, stagingLocation: body.stagingLocation });
      void loadPutawayAvailability(preview.scope.shipmentId, preview.scope.cartonNumbers);
      setMessage("Receipt confirmed. Actual quantities are recorded in system staging.");
    } finally {
      setBusy(false);
    }
  }

  const selectedShipment = shipments.find((item) => item.shipmentId === shipmentId);
  if (!preview && selectedShipment && selectedShipment.packingListStatus !== "confirmed") {
    return <WarehousePackingListGate shipments={shipments} shipmentId={shipmentId} onShipmentChange={switchShipment} />;
  }

  if (!preview) {
    return <section className="inbound-loading" role="status"><Package size={28} weight="duotone" />{message}</section>;
  }

  const sampleLine = preview.scope.lines[0];
  const receiptDifference = totalActual - expectedUnits;
  const activeGateReady = view === "put_away" ? putawayReady : receiptUnlocked;
  const activeGateTitle = view === "put_away"
    ? putawayReady ? "Receipt confirmed" : "Confirmed receipt required"
    : receiptUnlocked ? "Label print confirmed" : "Physical print confirmation required";
  const activeGateCopy = view === "put_away"
    ? putawayReady ? "Put away is unlocked. The source location is resolved by the system." : "Complete receipt confirmation before putaway begins."
    : receiptUnlocked ? "Receipt is unlocked for the selected scope." : "Send product labels to the Windows print dialog, then confirm the physical result.";
  const isHistoryView = view === "receipt_history";
  const showPutawayResult = view === "put_away" && putawayResult;
  const bottomLabel = isHistoryView ? "Pre-trade boundary" : showPutawayResult ? "Putaway result" : receiptResult ? "System result after confirmation" : "Print audit boundary";
  const bottomTitle = isHistoryView ? "This history records warehouse operations only." : showPutawayResult ? `The system moves ${putawayResult.quantity} units from internal staging to ${putawayResult.destinationLocation} and records an inventory movement.` : receiptResult ? `Receipt ${receiptResult.sessionId} is recorded in ${receiptResult.stagingLocation ?? "system staging"}.` : "Printing creates an audited task only. Stock is unchanged until receipt confirmation.";
  const bottomCopy = isHistoryView ? "It does not create customer orders, invoices, GST, payment or dispatch activity." : showPutawayResult ? "The staging source is resolved by the system. The movement remains in warehouse audit history." : receiptResult ? "No source-location scan. No public availability, sale, GST, payment or real dispatch is created." : "Preview → Windows print → Operator confirms Printed";

  return (
    <div className="inbound-app" id="inbound-operations">
      <aside className="inbound-sidebar" aria-label="Inbound operations navigation">
        <div className="inbound-brand">
          <Image src="/assets/brand/DriveMate_Parts_Primary_Lockup_v2.0.svg" alt="DriveMate Parts" width={135} height={34} priority />
          <p>Warehouse</p>
          <span>Internal operations</span>
        </div>
        <div className="inbound-section-title">Inbound operations</div>
        <nav className="inbound-nav">
          <span>Current work</span>
          <a className={view === "label_print" ? "is-active" : ""} href="#label-print" onClick={(event) => { event.preventDefault(); setView("label_print"); }}>Label print</a>
          <a className={view === "receive_stock" ? "is-active" : ""} aria-disabled={!receiptUnlocked} href="#receive-stock" onClick={(event) => { event.preventDefault(); if (receiptUnlocked) setView("receive_stock"); }}>Receive stock</a>
          <a className={view === "put_away" ? "is-active" : ""} aria-disabled={!putawayReady} href="#put-away" onClick={(event) => { event.preventDefault(); if (putawayReady) setView("put_away"); }}>Put away</a>
          <a className={view === "receipt_history" ? "is-active" : ""} href="#receipt-history" onClick={(event) => { event.preventDefault(); setView("receipt_history"); }}>Receipt history</a>
        </nav>
        <div className="inbound-rules">
          <span>{view === "label_print" ? "Print rule" : view === "receive_stock" ? "Receipt mode" : view === "put_away" ? "Putaway rule" : "Audit rule"}</span>
          {view === "label_print" ? <><p>Receipt stays locked</p><p className="is-amber">Reprint needs a reason</p></> : view === "receive_stock" ? <><p>Product barcode required</p><p className="is-amber">Difference reason required</p></> : view === "put_away" ? <><p>Product barcode required</p><p>DMLOC destination required</p><p>Source is system-only</p></> : <><p>Print outcome retained</p><p>Receipt reason retained</p><p>Movement reference retained</p></>}
        </div>
        <div className="inbound-phase-note"><span>Phase 1</span><p>Sample data only</p></div>
      </aside>

      <section className="inbound-content">
        <header className="inbound-topbar"><h1>Inbound operations</h1><div><span>Warehouse only</span><b>W</b></div></header>
        <main className="inbound-main">
          <section className="inbound-scope-bar">
            <div><span>Active inbound scope</span><strong>{preview.shipment.shipmentReference ?? `Shipment ${preview.shipment.shipmentId}`}</strong></div>
            <p>{activePalletLabel} / {preview.scope.cartonNumbers.join(", ")} / {expectedUnits} expected units</p>
            <select aria-label="Shipment" value={shipmentId} onChange={(event) => switchShipment(event.target.value)}>
              {shipments.map((shipment) => <option key={shipment.shipmentId} value={shipment.shipmentId}>{shipment.shipmentReference ?? shipment.shipmentId}</option>)}
            </select>
          </section>

          <fieldset className="inbound-pallet-picker">
            <legend>Scope selection</legend>
            {preview.shipment.pallets.map((pallet) => <label key={pallet.sourcePalletNumber}><input aria-label={`Pallet ${pallet.sourcePalletNumber}`} checked={selectedPallets.includes(pallet.sourcePalletNumber)} onChange={(event) => togglePallet(pallet.sourcePalletNumber, event.target.checked)} type="checkbox" />Pallet {pallet.sourcePalletNumber}</label>)}
          </fieldset>

          <section className={`inbound-gate ${isHistoryView ? "is-neutral" : activeGateReady ? "is-unlocked" : "is-locked"}`} role="status">
            {isHistoryView ? <ClipboardText size={25} weight="duotone" /> : activeGateReady ? <CheckCircle size={25} weight="fill" /> : <WarningCircle size={25} weight="fill" />}
            <div><strong>{isHistoryView ? "Audit records for the selected inbound scope" : activeGateTitle}</strong><p>{isHistoryView ? "Filtering changes the view only. Historical records are retained as the event occurred." : activeGateCopy}</p></div>
            <span>{isHistoryView ? "Read only" : view === "put_away" ? activeGateReady ? "Putaway ready" : "Putaway locked" : activeGateReady ? "Receipt unlocked" : "Receipt locked"}</span>
          </section>

          {view === "label_print" ? (
            <div className="inbound-workgrid" id="label-print">
              <section className="inbound-work-panel">
                <div className="inbound-work-heading"><div><h2>Label print</h2><p>Create product labels from packing-list quantities before receiving begins.</p></div><Printer size={27} weight="duotone" /></div>
                <span className="inbound-section-label">Print range</span>
                <div className="inbound-range-row"><strong>{activePalletLabel}</strong><span>Selected</span><strong>{preview.scope.cartonNumbers.join(", ")}</strong><span>{expectedUnits} labels</span></div>
                <span className="inbound-section-label">Product label queue</span>
                <div className="inbound-queue" role="table"><div className="inbound-queue-head" role="row"><span>SKU</span><span>Expected</span><span>Labels</span><span>Status</span></div>{preview.scope.lines.map((line) => <div className="inbound-queue-row" role="row" key={line.sku}><code>{line.sku}</code><strong>{line.expectedQuantity}</strong><strong>{line.expectedQuantity}</strong><b>Ready</b></div>)}</div>
                <div className="inbound-actions"><button className="button button-secondary" type="button" onClick={() => setPrintState("preview")}>Preview labels</button><button className="button button-primary" type="button" disabled={busy || printState === "awaiting_outcome"} onClick={() => void createPrintJob()}><Printer size={18} />Print labels</button></div>
                {printState === "preview" ? <p className="inbound-message" role="status">Preview ready. The queue contains {expectedUnits} fixed-size Unit Product labels.</p> : null}
                {printJob ? <section className="inbound-job-row"><div><span>Print job</span><strong>{printJob.id}</strong></div><div><span>Status</span><strong>{printState === "awaiting_outcome" ? "Awaiting physical confirmation" : printJob.status === "printed" ? "Printed confirmation recorded" : "Cancelled"}</strong></div>{printState === "awaiting_outcome" ? <div className="inbound-job-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => void recordPrintOutcome("cancelled")}>Cancel print</button><button className="button button-primary" type="button" disabled={busy} onClick={() => void recordPrintOutcome("printed")}>Confirm printed</button></div> : null}</section> : null}
              </section>
              <aside className="inbound-summary-panel"><h2>Product label preview</h2><p>70 × 50 mm product label</p>{sampleLine ? <div className="warehouse-label-print-sheet"><ProductLabel sku={sampleLine.sku} barcode={sampleLine.productBarcode} /></div> : null}<span className="inbound-section-label">Reprint control</span><div className="inbound-reprint-note"><strong>Need another copy?</strong><p>Select labels and record a reprint reason.</p></div><label className="inbound-reprint-input">Reprint reason<input aria-label="Reprint reason" value={reprintReason} onChange={(event) => setReprintReason(event.target.value)} placeholder="Reason is required" /></label>{printJob?.status === "printed" ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => void createReprint()}>Reprint labels</button> : null}</aside>
            </div>
          ) : view === "receive_stock" ? (
            <div className="inbound-workgrid" id="receive-stock">
              <section className="inbound-work-panel">
                <div className="inbound-work-heading"><div><h2>Receive stock</h2><p>Confirm actual incoming quantities against the selected packing-list scope.</p></div><ClipboardText size={27} weight="duotone" /></div>
                <div className="inbound-mode-tabs"><button className={receiptMode === "scan_each" ? "is-active" : ""} type="button" onClick={() => { setReceiptMode("scan_each"); setActiveBarcode(null); }}>Scan each unit</button><button className={receiptMode === "counted_quantity" ? "is-active" : ""} type="button" onClick={() => { setReceiptMode("counted_quantity"); setActiveBarcode(null); }}>Counted quantity</button></div>
                <label className="inbound-scan-field">Scan product barcode<input aria-label="Scan product barcode" value={scannerValue} onChange={(event) => setScannerValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); recordProductScan(); } }} placeholder="Scanner ready. Scan products.barcode then press Enter." /></label>
                {receiptMode === "scan_each" ? <section className="inbound-latest-scan"><span>Latest scan</span><code>{activeReceiptLine?.sku ?? "Scanner ready"}</code><div><span>Count</span><strong>{activeReceiptLine ? `${activeReceiptLine.actualQuantity} / ${activeReceiptLine.expectedQuantity}` : "0"}</strong></div><b>{activeReceiptLine ? "Product recognised" : "Awaiting scan"}</b></section> : activeReceiptLine ? <section className="inbound-current-line"><div><span>Expected quantity</span><strong>{activeReceiptLine.expectedQuantity} units</strong></div><label>Actual counted quantity<input aria-label={`Actual quantity for ${activeReceiptLine.sku}`} min="0" type="number" value={activeReceiptLine.actualQuantity} onChange={(event) => updateActual(activeReceiptLine.barcode, event.target.value, activeReceiptLine.expectedQuantity)} /></label>{activeReceiptLine.actualQuantity !== activeReceiptLine.expectedQuantity ? <div className="inbound-difference"><label>Difference type<select aria-label={`Difference type for ${activeReceiptLine.sku}`} value={discrepancyTypeByBarcode[activeReceiptLine.barcode] ?? defaultDiscrepancyType(activeReceiptLine.actualQuantity, activeReceiptLine.expectedQuantity)} onChange={(event) => setDiscrepancyTypeByBarcode((current) => ({ ...current, [activeReceiptLine.barcode]: event.target.value as ReceiptDiscrepancyType }))}><option value="short_pack">Short pack</option><option value="over_received">Over received</option><option value="damaged">Damaged</option><option value="wrong_item">Wrong item</option><option value="unknown_barcode">Unknown barcode</option></select></label><label>Difference reason<input aria-label={`Difference reason for ${activeReceiptLine.sku}`} value={discrepancyReasonByBarcode[activeReceiptLine.barcode] ?? ""} onChange={(event) => setDiscrepancyReasonByBarcode((current) => ({ ...current, [activeReceiptLine.barcode]: event.target.value }))} placeholder="Record a specific reason" /></label></div> : null}<button className="button button-primary inbound-add-line" type="button" disabled={!activeLineCanBeRecorded} onClick={recordCountedLine}>Add receipt line</button></section> : <section className="inbound-awaiting-line"><strong>Scan a recognised product barcode to start a counted receipt line.</strong><p>Actual quantity and a difference reason are recorded one SKU at a time.</p></section>}
                <div className={`inbound-receipt-check ${canConfirmReceipt ? "is-ready" : ""}`}><span>Receipt check</span><strong>Expected {expectedUnits} units</strong><strong>Actual {totalActual} units</strong><strong>Difference {receiptDifference >= 0 ? "+" : ""}{receiptDifference} units</strong>{!canConfirmReceipt && !receiptResult ? <p>{receiptMode === "scan_each" ? "Scan every expected unit, or switch to Counted quantity to record a difference reason." : "Scan each SKU once and record a reason for every quantity difference."}</p> : null}</div>
                <div className="inbound-actions inbound-receipt-actions"><button className="button button-primary" type="button" disabled={!canConfirmReceipt} onClick={() => void confirmReceipt()}>{busy ? "Confirming..." : "Confirm receipt"}<ArrowRight size={18} /></button></div>
              </section>
              <aside className="inbound-summary-panel"><h2>{receiptMode === "counted_quantity" ? "Receipt review" : "Expected and audit"}</h2><p>{receiptMode === "counted_quantity" ? "Confirmation is available after each line is valid." : `Packing-list expectation for ${preview.scope.cartonNumbers.join(", ")}.`}</p>{receiptMode === "counted_quantity" ? <><span className="inbound-section-label">Current line</span><div className="inbound-current-line-summary"><strong>{activeReceiptLine?.sku ?? "No product scanned"}</strong><span>{activeReceiptLine ? `Expected ${activeReceiptLine.expectedQuantity}` : "Scan a product to begin"}</span><span>{activeReceiptLine ? `Actual ${activeReceiptLine.actualQuantity}` : ""}</span><b>{activeReceiptLine ? activeReceiptLine.actualQuantity !== activeReceiptLine.expectedQuantity ? activeLineHasDifferenceReason ? "Difference recorded" : "Difference reason required" : "Ready to record" : ""}</b></div></> : null}<div className="inbound-audit-table"><div><span>SKU</span><span>Expected</span><span>Actual</span></div>{receiptLines.map((line) => <div key={line.barcode}><code>{line.sku}</code><strong>{line.expectedQuantity}</strong><strong>{line.actualQuantity}</strong></div>)}</div><span className="inbound-section-label">Print audit</span><div className={`inbound-print-audit ${receiptUnlocked ? "is-confirmed" : ""}`}><strong>{printJob?.id ?? "No print job"}</strong><span>{receiptUnlocked ? "Printed confirmation recorded" : "Receipt remains locked"}</span><b>{receiptUnlocked ? "Confirmed" : "Locked"}</b></div><span className="inbound-section-label">Receipt destination</span><div className="inbound-staging-note"><strong>BNE-RECEIVING-STAGING</strong><p>System-only location. No source scan required.</p></div></aside>
            </div>
          ) : view === "put_away" ? <WarehousePutawayPanel selection={{ shipmentId: preview.scope.shipmentId, cartonNumbers: preview.scope.cartonNumbers }} onPutawayConfirmed={(outcome) => { setPutawayResult(outcome); void loadPutawayAvailability(preview.scope.shipmentId, preview.scope.cartonNumbers); }} /> : <ReceiptHistoryPanel selection={{ shipmentId: preview.scope.shipmentId, cartonNumbers: preview.scope.cartonNumbers }} />}

          <section className="inbound-bottom-note"><div><span>{bottomLabel}</span><strong>{bottomTitle}</strong><p>{bottomCopy}</p></div><button className="button button-secondary" type="button" onClick={() => setView("receipt_history")}>View receipt history</button></section>
          <p className="inbound-message" role="status">{isHistoryView ? "Read-only audit view." : message}</p>
        </main>
      </section>
    </div>
  );
}
