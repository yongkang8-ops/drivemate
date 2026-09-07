"use client";

import Image from "next/image";
import Link from "next/link";
import { WarehouseProductLabel } from "./WarehouseProductLabel";
import { describeProductLabelIssues, type ProductLabelReadiness } from "../lib/warehouseLabelContent";
import { resolveWarehouseScopeLookup } from "../lib/warehouseScopeLookup";
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
import { flushSync } from "react-dom";
import { buildApiHeaders } from "../lib/clientAuth";
import type { PrearrivalShipmentSummary, WarehouseLabelPrintJob, WarehouseLabelPrintItem } from "../lib/repository";
import { prepareProductLabelBatch, type ProductLabelPage } from "../lib/productLabelBatch";
import { ProductLabelPrintBatch } from "./ProductLabelPrintBatch";
import type { ReceiptDiscrepancyType, WarehouseReceiptScope } from "../lib/warehouseReceiving";
import { describeUnmappedPalletSelection } from "../lib/warehouseScopePresentation";
import { WarehousePutawayPanel } from "./WarehousePutawayPanel";
import { ReceiptHistoryPanel } from "./ReceiptHistoryPanel";
import { useWorkspaceRole } from "./RoleGate";

type WorkspaceView = "label_print" | "receive_stock" | "put_away" | "receipt_history";
type PrintPanelState = "select" | "preview" | "awaiting_outcome" | "confirmed" | "cancelled";

const workspaceViews: Array<{ value: WorkspaceView; label: string }> = [
  { value: "label_print", label: "Label print" },
  { value: "receive_stock", label: "Receive stock" },
  { value: "put_away", label: "Put away" },
  { value: "receipt_history", label: "Receipt history" },
];

function viewFromLocation(): WorkspaceView {
  const value = new URLSearchParams(window.location.search).get("view")
    ?? window.location.hash.slice(1).replaceAll("-", "_");
  return workspaceViews.find((item) => item.value === value)?.value ?? "label_print";
}

function WarehouseNavigation({ view, shipmentId, onViewChange }: {
  view: WorkspaceView; shipmentId: string; onViewChange: (view: WorkspaceView) => void;
}) {
  const viewerRole = useWorkspaceRole();
  const canOpenPartnerWorkspaces = viewerRole === "admin" || viewerRole === "partner";
  return <>
    <nav className="inbound-nav inbound-workspace-nav" aria-label="Workspace navigation">
      <span>Workspace</span>
      {canOpenPartnerWorkspaces ? <><Link href="/partner">Dashboard</Link>
      <Link href={`/prearrival?shipmentId=${encodeURIComponent(shipmentId)}`}>Pre-arrival shipments</Link>
      <Link href="/inventory">Inventory &amp; locations</Link>
      <Link href="/admin/staff">Staff management</Link></> : null}
      <Link href="/">Public website</Link>
    </nav>
    <nav className="inbound-nav" aria-label="Inbound operations navigation">
      <span>Current work</span>
      {workspaceViews.map((item) => <a key={item.value}
        className={view === item.value ? "is-active" : ""}
        aria-current={view === item.value ? "page" : undefined}
        href={`/warehouse?shipmentId=${encodeURIComponent(shipmentId)}&view=${item.value}`}
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onViewChange(item.value);
        }}>{item.label}</a>)}
    </nav>
  </>;
}

type ScopePreview = {
  labelProducts?: ProductLabelReadiness[];
  shipment: {
    productIdentifiers?: string[];
    shipmentId: string;
    shipmentReference?: string;
    pallets: Array<{ sourcePalletNumber: string }>;
    cartons: Array<{
      sourceCartonNumber: string;
      sourcePalletNumber?: string;
      kind?: "carton" | "carton_group";
      physicalCartonCount?: number;
      memberCartonNumbers?: string[];
    }>;
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
  | { ok: true; job: WarehouseLabelPrintJob; items?: WarehouseLabelPrintItem[] }
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

function makeScopeUrl(
  shipmentId: string,
  palletNumbers: string[] = [],
  cartonNumbers: string[] = [],
) {
  const params = new URLSearchParams({ shipmentId });
  palletNumbers.forEach((palletNumber) => params.append("palletNumber", palletNumber));
  cartonNumbers.forEach((cartonNumber) => params.append("cartonNumber", cartonNumber));
  return `/api/warehouse/labels?${params.toString()}`;
}

function WarehousePackingListGate({
  shipments,
  shipmentId,
  onShipmentChange,
  view,
  setView,
}: {
  shipments: PrearrivalShipmentSummary[];
  shipmentId: string;
  onShipmentChange: (shipmentId: string) => void;
  view: WorkspaceView;
  setView: (view: WorkspaceView) => void;
}) {
  const selectedShipment = shipments.find((shipment) => shipment.shipmentId === shipmentId);
  const statusCopy = selectedShipment?.packingListStatus === "draft"
    ? `Draft v${selectedShipment.latestPackingListVersion ?? 1} exists, but it has not been confirmed.`
    : "No Packing List revision has been confirmed for this Shipment.";
  const isHistoryView = view === "receipt_history";
  const moduleTitle = view === "label_print" ? "Label print" : view === "receive_stock" ? "Receive stock" : "Put away";
  const moduleCopy = view === "label_print"
    ? "Confirm this Shipment's Packing List to make product-label quantities available."
    : view === "receive_stock"
      ? "Confirmed source quantities and a physically confirmed label print are required before receipt can be recorded."
      : "A confirmed receipt in BNE-RECEIVING-STAGING is required before destination scanning can begin.";
  const moduleNextStep = view === "label_print"
    ? "Complete the pallet, carton, recognised SKU and expected quantity structure in Pre-arrival."
    : view === "receive_stock"
      ? "Confirm the Packing List, prepare the selected labels and record the physical print outcome."
      : "Confirm receipt into system staging before scanning a product and its active DMLOC destination.";

  return (
    <div className="inbound-app" id="inbound-operations">
      <aside className="inbound-sidebar" aria-label="Inbound operations navigation">
        <div className="inbound-brand">
          <Image src="/assets/brand/DriveMate_Parts_Primary_Lockup_v2.0.svg" alt="DriveMate Parts" width={135} height={34} priority />
          <p>Warehouse</p>
          <span>Internal operations</span>
        </div>
        <div className="inbound-section-title">Inbound operations</div>
        <WarehouseNavigation view={view} shipmentId={shipmentId} onViewChange={setView} />
        <div className="inbound-rules">
          <span>{isHistoryView ? "Audit rule" : "Required operational record"}</span>
          {isHistoryView ? <><p>Read-only records</p><p>Timezone display choice</p><p>Filters never change stock</p></> : <><p>Module remains accessible</p><p>Write controls need source data</p><p>Server validation remains active</p></>}
        </div>
        <div className="inbound-phase-note"><span>Warehouse control</span><p>Pages stay open. Inventory writes remain sequence controlled.</p></div>
      </aside>

      <section className="inbound-content">
        <header className="inbound-topbar"><h1>Inbound operations</h1><div><span>Warehouse only</span><b>W</b></div></header>
        <main className="inbound-main" id="packing-list-gate">
          <section className="inbound-scope-bar">
            <div><span>Selected Shipment</span><strong>{selectedShipment?.shipmentReference ?? shipmentId}</strong></div>
            <p>All modules are available. Write controls appear when their required operational records exist.</p>
            <select aria-label="Shipment" value={shipmentId} onChange={(event) => onShipmentChange(event.target.value)}>
              {shipments.map((shipment) => <option key={shipment.shipmentId} value={shipment.shipmentId}>{shipment.shipmentReference ?? shipment.shipmentId}</option>)}
            </select>
          </section>

          {isHistoryView ? <>
            <section className="inbound-gate is-neutral" role="status">
              <ClipboardText size={25} weight="duotone" />
              <div><strong>Warehouse audit remains available</strong><p>Filtering changes the view only. Historical records are retained as the event occurred.</p></div>
              <span>Read only</span>
            </section>
            <ReceiptHistoryPanel selection={{ shipmentId, cartonNumbers: [] }} />
          </> : <>
            <section className="inbound-packing-list-gate" role="status">
              <WarningCircle size={30} weight="fill" />
              <div>
                <span>Source data required</span>
                <h2>Packing List confirmation required</h2>
                <p>{statusCopy} Complete the export pallet, carton and SKU structure in Pre-arrival before recording this operation.</p>
              </div>
              <Link className="button button-primary" href={`/prearrival?shipmentId=${encodeURIComponent(shipmentId)}`}>
                Open Pre-arrival <ArrowRight size={18} />
              </Link>
            </section>

            <div className="inbound-workgrid" id={view === "label_print" ? "label-print" : view === "receive_stock" ? "receive-stock" : "put-away"}>
              <section className="inbound-work-panel">
                <div className="inbound-work-heading"><div><h2>{moduleTitle}</h2><p>The workspace is available while the required source record is prepared.</p></div>{view === "label_print" ? <Printer size={27} weight="duotone" /> : view === "receive_stock" ? <ClipboardText size={27} weight="duotone" /> : <Package size={27} weight="duotone" />}</div>
                <section className="inbound-awaiting-line"><strong>{moduleCopy}</strong><p>{moduleNextStep}</p></section>
                <div className="inbound-actions"><Link className="button button-primary" href={`/prearrival?shipmentId=${encodeURIComponent(shipmentId)}`}>Prepare source data <ArrowRight size={18} /></Link></div>
              </section>
              <aside className="inbound-summary-panel">
                <h2>Operational prerequisites</h2>
                <p>Each completed record unlocks the next write control without hiding the workspace.</p>
                <span className="inbound-section-label">Current sequence</span>
                <div className="inbound-staging-note"><strong>Packing List → Printed labels → Receipt → Put away</strong><p>Existing API and inventory validation remains authoritative.</p></div>
              </aside>
            </div>
          </>}

          <section className="inbound-bottom-note"><div><span>Data integrity</span><strong>{isHistoryView ? "This history records warehouse operations without changing stock." : "The module is open. Write controls appear when the required operational record exists."}</strong><p>{isHistoryView ? "It does not create orders, invoices, GST, payment or dispatch activity." : "No label job, receipt session or inventory movement has been created from this empty state."}</p></div>{!isHistoryView ? <button className="button button-secondary" type="button" onClick={() => setView("receipt_history")}>View receipt history</button> : null}</section>
          <p className="inbound-message" role="status">{isHistoryView ? "Read-only audit view." : `${moduleTitle} workspace available. Prerequisite pending.`}</p>
        </main>
      </section>
    </div>
  );
}

export function PartnerInboundWorkspace() {
  const [shipments, setShipments] = useState<PrearrivalShipmentSummary[]>([]);
  const [shipmentId, setShipmentId] = useState("");
  const [selectedPallets, setSelectedPallets] = useState<string[]>([]);
  const [selectedCartons, setSelectedCartons] = useState<string[]>([]);
  const [availableCartons, setAvailableCartons] = useState<ScopePreview["shipment"]["cartons"]>([]);
  const [scopeLookup, setScopeLookup] = useState("");
  const [scopeLookupMessage, setScopeLookupMessage] = useState("");
  const [scopeLookupInvalid, setScopeLookupInvalid] = useState(false);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeError, setScopeError] = useState(false);
  const [preview, setPreview] = useState<ScopePreview | null>(null);
  const [view, setViewState] = useState<WorkspaceView>("label_print");
  const [putawayReady, setPutawayReady] = useState(false);
  const [printState, setPrintState] = useState<PrintPanelState>("select");
  const [printJob, setPrintJob] = useState<WarehouseLabelPrintJob | null>(null);
  const [printBatch, setPrintBatch] = useState<{ jobId: string; labels: ProductLabelPage[] } | null>(null);
  const [openedPrintJobId, setOpenedPrintJobId] = useState<string | null>(null);
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
  const scopeRequestToken = useRef(0);
  const requestedViewFocus = useRef<WorkspaceView | null>(null);
  const [viewNavigationCount, setViewNavigationCount] = useState(0);

  function setView(nextView: WorkspaceView) {
    requestedViewFocus.current = nextView;
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    if (shipmentId) url.searchParams.set("shipmentId", shipmentId);
    url.hash = "";
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
    setViewState(nextView);
    setViewNavigationCount((current) => current + 1);
  }

  useEffect(() => {
    const initialView = viewFromLocation();
    if (new URLSearchParams(window.location.search).has("view") || window.location.hash) requestedViewFocus.current = initialView;
    setViewState(initialView);
    const restoreView = () => {
      requestedViewFocus.current = null;
      setViewState(viewFromLocation());
    };
    window.addEventListener("popstate", restoreView);
    window.addEventListener("hashchange", restoreView);
    return () => {
      window.removeEventListener("popstate", restoreView);
      window.removeEventListener("hashchange", restoreView);
    };
  }, []);

  useEffect(() => {
    if (requestedViewFocus.current !== view) return;
    const panel = document.getElementById(view.replaceAll("_", "-"));
    if (!panel) return;
    const heading = panel.querySelector<HTMLElement>("h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    panel.scrollIntoView({ block: "start", behavior: "instant" });
    requestedViewFocus.current = null;
  }, [view, preview, shipmentId, viewNavigationCount]);

  useEffect(() => {
    const restoreShipment = () => {
      const requested = new URLSearchParams(window.location.search).get("shipmentId");
      if (requested && requested !== shipmentId && shipments.some((item) => item.shipmentId === requested)) {
        switchShipment(requested, false);
      }
    };
    window.addEventListener("popstate", restoreShipment);
    return () => window.removeEventListener("popstate", restoreShipment);
  }, [shipments, shipmentId]);

  useEffect(() => {
    setPrintBatch(null);
    setOpenedPrintJobId(null);
  }, [shipmentId, selectedPallets, selectedCartons]);

  useEffect(() => { setPrintBatch(null); }, [view]);

  function printSavedBatch(job: WarehouseLabelPrintJob, items?: WarehouseLabelPrintItem[]) {
    setOpenedPrintJobId(null);
    const labels = prepareProductLabelBatch(job, items ?? []);
    flushSync(() => setPrintBatch({ jobId: job.id, labels }));
    const output = document.querySelector(".warehouse-product-print-batch");
    const renderedLabels = output?.querySelectorAll("article");
    if (output?.getAttribute("data-job-id") !== job.id
      || renderedLabels?.length !== job.requestedQuantity
      || !Array.from(renderedLabels).every(label => label.querySelector("svg rect"))) {
      throw new Error("Product label output could not be prepared. Cancel this job and try again.");
    }
    window.print();
    setOpenedPrintJobId(job.id);
    setMessage(`${labels.length} labels prepared from saved job items. Use 70 × 50 mm paper, 100% scale, no headers or footers, and Copies = 1. Confirm printed only after checking every physical label.`);
  }

  const receiptUnlocked = !scopeLoading && !scopeError && preview?.printGate.ok === true;
  const expectedUnits = preview ? quantityFor(preview.scope) : 0;
  const activeSourceScopes = availableCartons.filter((carton) => (
    preview?.scope.cartonNumbers.includes(carton.sourceCartonNumber)
  ));
  const activePhysicalCartons = activeSourceScopes.reduce(
    (total, carton) => total + (carton.physicalCartonCount ?? 1),
    0,
  );
  const activeCartonGroups = activeSourceScopes.filter(
    (carton) => carton.kind === "carton_group",
  ).length;
  const activePalletLabel = selectedPallets.length === 1
    ? `Pallet ${selectedPallets[0]}`
    : selectedPallets.length > 1
      ? `${selectedPallets.length} pallets`
      : selectedCartons.length === 1
        ? `Source scope ${selectedCartons[0]}`
        : selectedCartons.length > 1
          ? `${selectedCartons.length} source scopes`
          : "Full shipment";

  async function loadScope(
    nextShipmentId: string,
    palletNumbers: string[],
    cartonNumbers: string[] = [],
  ) {
    if (!nextShipmentId) return;
    const requestToken = ++scopeRequestToken.current;
    setScopeLoading(true);
    setScopeError(false);
    setMessage("Loading selected inbound scope.");
    try {
      const response = await fetch(makeScopeUrl(nextShipmentId, palletNumbers, cartonNumbers), {
        cache: "no-store",
        headers: await buildApiHeaders("warehouse_staff"),
      });
      const body = (await response.json()) as ScopePreviewResponse;
      if (requestToken !== scopeRequestToken.current) return;
      if (!response.ok || !body.ok) {
        setScopeError(true);
        setMessage(("message" in body && body.message) || "Inbound scope could not be loaded.");
        return;
      }
      setAvailableCartons(body.shipment.cartons);
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
    } catch {
      if (requestToken === scopeRequestToken.current) {
        setScopeError(true);
        setMessage("Inbound scope could not be loaded. Try selecting the scope again.");
      }
    } finally {
      if (requestToken === scopeRequestToken.current) setScopeLoading(false);
    }
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
      setSelectedCartons([]);
      setAvailableCartons([]);
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
    setAvailableCartons(allScope.shipment.cartons);
    setSelectedPallets(initialPallets);
    setSelectedCartons([]);
    await loadScope(firstShipmentId, initialPallets, []);
  }

  useEffect(() => {
    void loadWorkspace();
  }, []);

  function switchShipment(nextShipmentId: string, updateUrl = true) {
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("shipmentId", nextShipmentId);
      window.history.replaceState(null, "", url);
    }
    setShipmentId(nextShipmentId);
    setPrintJob(null);
    setPrintState("select");
    setPutawayReady(false);
    setPutawayResult(null);
    setScopeLookup("");
    setScopeLookupMessage("");
    const nextShipment = shipments.find((shipment) => shipment.shipmentId === nextShipmentId);
    if (nextShipment?.packingListStatus !== "confirmed") {
      setPreview(null);
      setSelectedPallets([]);
      setSelectedCartons([]);
      setAvailableCartons([]);
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
      setAvailableCartons(body.shipment.cartons);
      setSelectedPallets(nextPallets);
      setSelectedCartons([]);
      await loadScope(nextShipmentId, nextPallets, []);
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
    setSelectedCartons([]);
    setScopeLookupMessage("");
    setPrintJob(null);
    setPrintState("select");
    setPutawayReady(false);
    setPutawayResult(null);
    void loadScope(shipmentId, nextPallets, []);
  }

  function resetOperationState() {
    setPrintJob(null);
    setPrintState("select");
    setPutawayReady(false);
    setPutawayResult(null);
  }

  function toggleSourceScope(sourceCartonNumber: string, checked: boolean) {
    const nextCartons = checked
      ? [...new Set([...selectedCartons, sourceCartonNumber])]
      : selectedCartons.filter((value) => value !== sourceCartonNumber);
    setSelectedCartons(nextCartons);
    setSelectedPallets([]);
    setScopeLookupMessage("");
    resetOperationState();
    void loadScope(shipmentId, [], nextCartons);
  }

  function selectFullShipment() {
    setScopeLookupInvalid(false);
    setSelectedPallets([]);
    setSelectedCartons([]);
    setScopeLookupMessage("Full shipment selected.");
    resetOperationState();
    void loadScope(shipmentId, [], []);
  }

  function resolveScopeLookup() {
    const result = resolveWarehouseScopeLookup(scopeLookup, availableCartons, preview?.shipment.productIdentifiers ?? []);
    setScopeLookupInvalid(result.status !== "matched");
    if (result.status !== "matched") {
      setScopeLookupMessage(result.status === "empty" ? "Enter a carton or source-group number from the list below."
        : result.status === "wrong_kind" ? "This is a product SKU or barcode. Find scope searches carton and source-group numbers only. Choose a source scope below."
        : `No carton or source group matches ${scopeLookup.trim()}. Check the carton number or choose from the list below. Your selection has not changed.`);
      return;
    }
    const sourceScope = result.carton;
    setSelectedPallets([]);
    setSelectedCartons([sourceScope.sourceCartonNumber]);
    setScopeLookup("");
    resetOperationState();
    const isMember = result.isMember;
    setScopeLookupMessage(isMember
      ? `Member carton ${scopeLookup.trim()} resolved to source group ${sourceScope.sourceCartonNumber}.`
      : `Source scope ${sourceScope.sourceCartonNumber} selected.`);
    void loadScope(shipmentId, [], [sourceScope.sourceCartonNumber]);
  }

  async function createPrintJob() {
    if (!preview || scopeLoading || scopeError) return;
    setBusy(true);
    try {
      const response = await fetch("/api/warehouse/labels", {
        method: "POST",
        headers: await buildApiHeaders("warehouse_staff", { "Content-Type": "application/json" }),
        body: JSON.stringify({
          selection: {
            shipmentId,
            ...(selectedPallets.length ? { palletNumbers: selectedPallets } : {}),
            ...(selectedCartons.length ? { cartonNumbers: selectedCartons } : {}),
          },
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
      printSavedBatch(body.job, body.items);
    } catch (error) {
      setPrintBatch(null);
      setOpenedPrintJobId(null);
      setMessage(error instanceof Error ? error.message : "Print preparation failed. Check the job in Receipt history before retrying.");
    } finally {
      setBusy(false);
    }
  }

  async function recordPrintOutcome(outcome: "printed" | "cancelled") {
    if (!printJob || (outcome === "printed" && openedPrintJobId !== printJob.id)) return;
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
      setPrintBatch(null);
      setOpenedPrintJobId(null);
      setPrintState(outcome === "printed" ? "confirmed" : "cancelled");
      await loadScope(shipmentId, selectedPallets, selectedCartons);
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
      printSavedBatch(body.job, body.items);
    } catch (error) {
      setPrintBatch(null);
      setOpenedPrintJobId(null);
      setMessage(error instanceof Error ? error.message : "Reprint preparation failed. Check the job in Receipt history before retrying.");
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
  const canConfirmReceipt = receiptUnlocked && !scopeLoading && !busy && !receiptResult && receiptLines.length > 0 && receiptLines.every((line) => {
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
    return <WarehousePackingListGate shipments={shipments} shipmentId={shipmentId} onShipmentChange={switchShipment} view={view} setView={setView} />;
  }

  if (!preview) {
    return <section className="inbound-loading" role="status"><Package size={28} weight="duotone" />{message}</section>;
  }

  const sampleLine = preview.scope.lines[0];
  const labelProblems = preview.scope.lines.filter(line => !preview.labelProducts?.find(product => product.sku === line.sku)?.content);
  const sampleContent = preview.labelProducts?.find(product => product.sku === sampleLine?.sku)?.content;
  const receiptDifference = totalActual - expectedUnits;
  const activeGateReady = view === "put_away" ? putawayReady || Boolean(putawayResult) : receiptUnlocked;
  const activeGateTitle = view === "put_away"
    ? putawayReady ? "Receipt confirmed" : putawayResult ? "Putaway recorded" : "No stock awaiting put away"
    : receiptUnlocked ? "Label print confirmed" : "Physical print confirmation required";
  const activeGateCopy = view === "put_away"
    ? putawayReady ? "Put away is unlocked. The source location is resolved by the system." : "No confirmed staging stock remains in this scope. Review receipt history before recording another operation."
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
        <WarehouseNavigation view={view} shipmentId={shipmentId} onViewChange={setView} />
        <div className="inbound-rules">
          <span>{view === "label_print" ? "Print rule" : view === "receive_stock" ? "Receipt mode" : view === "put_away" ? "Putaway rule" : "Audit rule"}</span>
          {view === "label_print" ? <><p>Receipt stays locked</p><p className="is-amber">Reprint needs a reason</p></> : view === "receive_stock" ? <><p>Product barcode required</p><p className="is-amber">Difference reason required</p></> : view === "put_away" ? <><p>Product barcode required</p><p>DMLOC destination required</p><p>Source is system-only</p></> : <><p>Print outcome retained</p><p>Receipt reason retained</p><p>Movement reference retained</p></>}
        </div>
        <div className="inbound-phase-note"><span>Warehouse control</span><p>Receipt remains locked until product-label print confirmation.</p></div>
      </aside>

      <section className="inbound-content">
        <header className="inbound-topbar"><h1>Inbound operations</h1><div><span>Warehouse only</span><b>W</b></div></header>
        {printBatch ? <ProductLabelPrintBatch jobId={printBatch.jobId} labels={printBatch.labels} /> : null}
        <main className="inbound-main">
          <section className="inbound-scope-bar">
            <div><span>Active inbound scope</span><strong>{preview.shipment.shipmentReference ?? `Shipment ${preview.shipment.shipmentId}`}</strong></div>
            <p>{scopeLoading ? "Loading selected scope…" : scopeError ? "Selected scope could not be loaded. Choose a scope to retry." : `${activePalletLabel} / ${preview.scope.cartonNumbers.join(", ")} / ${expectedUnits} expected units`}</p>
            <select disabled={busy} aria-label="Shipment" value={shipmentId} onChange={(event) => switchShipment(event.target.value)}>
              {shipments.map((shipment) => <option key={shipment.shipmentId} value={shipment.shipmentId}>{shipment.shipmentReference ?? shipment.shipmentId}</option>)}
            </select>
          </section>

          <fieldset className="inbound-pallet-picker">
            <legend>Optional pallet filter</legend>
            {preview.shipment.pallets.length
              ? preview.shipment.pallets.map((pallet) => <label key={pallet.sourcePalletNumber}><input aria-label={`Pallet ${pallet.sourcePalletNumber}`} checked={selectedPallets.includes(pallet.sourcePalletNumber)} disabled={scopeLoading || busy} onChange={(event) => togglePallet(pallet.sourcePalletNumber, event.target.checked)} type="checkbox" />Pallet {pallet.sourcePalletNumber}</label>)
              : <span className="inbound-pallet-unmapped">{describeUnmappedPalletSelection(selectedCartons)}</span>}
          </fieldset>

          <section className="inbound-source-scope-picker" aria-labelledby="source-scope-heading">
            <div className="inbound-source-scope-heading">
              <div><span>Canonical receipt scope</span><h2 id="source-scope-heading">Source carton scopes</h2><p>Select a complete source scope. A member carton lookup always resolves to its parent group.</p></div>
              <button className="button button-secondary" disabled={scopeLoading || busy} type="button" onClick={selectFullShipment}>Full shipment</button>
            </div>
            <form className="inbound-scope-lookup" onSubmit={(event) => { event.preventDefault(); resolveScopeLookup(); }}>
              <label htmlFor="warehouse-scope-lookup">Find source scope or member carton</label>
              <div><input id="warehouse-scope-lookup" aria-invalid={scopeLookupInvalid} aria-describedby="warehouse-scope-feedback" disabled={scopeLoading || busy} value={scopeLookup} onChange={(event) => { setScopeLookup(event.target.value); setScopeLookupInvalid(false); setScopeLookupMessage(""); }} placeholder={`Carton number, e.g. ${availableCartons[0]?.sourceCartonNumber ?? "1#"}`} /><button className="button button-secondary" disabled={scopeLoading || busy} type="submit">{scopeLoading ? "Loading scope…" : "Find scope"}</button></div>
              <p id="warehouse-scope-feedback" className={`scope-lookup-feedback${scopeLookupInvalid ? " is-error" : ""}`} role={scopeLookupInvalid ? "alert" : "status"}>{scopeLoading ? "Loading the selected source scope…" : scopeLookupMessage || "Enter a carton or group number, not a product SKU. A member carton selects its complete parent group."}</p>
            </form>
            <div className="inbound-source-scope-grid">
              {availableCartons.map((carton) => {
                const isGroup = carton.kind === "carton_group";
                const count = carton.physicalCartonCount ?? 1;
                return <label className={selectedCartons.includes(carton.sourceCartonNumber) ? "is-selected" : ""} key={carton.sourceCartonNumber}><input aria-label={`Source scope ${carton.sourceCartonNumber}`} checked={selectedCartons.includes(carton.sourceCartonNumber)} disabled={scopeLoading || busy} onChange={(event) => toggleSourceScope(carton.sourceCartonNumber, event.target.checked)} type="checkbox" /><span><strong>{carton.sourceCartonNumber}</strong>{isGroup ? <b>Group</b> : null}<small>{count} physical {count === 1 ? "carton" : "cartons"} · {carton.memberCartonNumbers?.join(", ") || carton.sourceCartonNumber}</small></span></label>;
              })}
            </div>
            <p className="inbound-scope-summary"><strong>{activeSourceScopes.length}</strong> source {activeSourceScopes.length === 1 ? "scope" : "scopes"} · <strong>{activePhysicalCartons}</strong> physical {activePhysicalCartons === 1 ? "carton" : "cartons"}{activeCartonGroups ? ` · ${activeCartonGroups} ${activeCartonGroups === 1 ? "group" : "groups"}` : ""}</p>
          </section>

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
                <div className="inbound-queue" role="table"><div className="inbound-queue-head" role="row"><span>SKU</span><span>Expected</span><span>Labels</span><span>Status</span></div>{preview.scope.lines.map((line) => <div className="inbound-queue-row" role="row" key={line.sku}><code>{line.sku}</code><strong>{line.expectedQuantity}</strong><strong>{line.expectedQuantity}</strong><b>{labelProblems.some(product => product.sku === line.sku) ? "Details needed" : "Ready"}</b></div>)}</div>
                {labelProblems.length ? <div className="label-readiness-alert" role="alert"><strong>Complete label details for {labelProblems.length} selected products</strong><ul>{labelProblems.map(line => <li key={line.sku}>{line.sku}: {describeProductLabelIssues(preview.labelProducts?.find(product => product.sku === line.sku)?.issues ?? ["labelProfile"])}</li>)}</ul><p>An authorised product editor can complete these details in the SKU master. Existing receipt records and saved print jobs are unchanged.</p></div> : null}
                <div className="inbound-actions"><button className="button button-secondary" type="button" disabled={scopeLoading || scopeError || busy || labelProblems.length > 0 || printState === "awaiting_outcome"} onClick={() => setPrintState("preview")}>Preview labels</button><button className="button button-primary" type="button" disabled={scopeLoading || scopeError || busy || labelProblems.length > 0 || printState === "awaiting_outcome"} onClick={() => void createPrintJob()}><Printer size={18} />Print labels</button></div>
                {printState === "preview" ? <p className="inbound-message" role="status">Preview ready. The queue contains {expectedUnits} fixed-size Unit Product labels.</p> : null}
                {printJob ? <section className="inbound-job-row"><div><span>Print job</span><strong>{printJob.id}</strong></div><div><span>Status</span><strong>{printState === "awaiting_outcome" ? "Awaiting physical confirmation" : printJob.status === "printed" ? "Printed confirmation recorded" : "Cancelled"}</strong></div>{printState === "awaiting_outcome" ? <div className="inbound-job-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => void recordPrintOutcome("cancelled")}>Cancel print</button><button className="button button-primary" type="button" disabled={busy || openedPrintJobId !== printJob.id} onClick={() => void recordPrintOutcome("printed")}>Confirm printed</button></div> : null}</section> : null}
              </section>
              <aside className="inbound-summary-panel"><h2>Product label preview</h2><p>70 × 50 mm · first SKU sample only</p><p>Print labels outputs every saved item, one label per page. Set Copies to 1 and scale to 100%. Enable background graphics for the black title band.</p>{sampleLine && sampleContent ? <div className="warehouse-label-print-sheet"><WarehouseProductLabel label={{ itemId: "preview", sequence: 1, sku: sampleLine.sku, barcode: sampleLine.productBarcode, labelContent: sampleContent }} /></div> : <p className="label-readiness-alert">The first product's label details need completion before preview.</p>}<span className="inbound-section-label">Reprint control</span><div className="inbound-reprint-note"><strong>Need another copy?</strong><p>Reprints retain the original saved artwork, including legacy labels. Record a reason.</p></div><label className="inbound-reprint-input">Reprint reason<input aria-label="Reprint reason" value={reprintReason} onChange={(event) => setReprintReason(event.target.value)} placeholder="Reason is required" /></label>{printJob?.status === "printed" ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => void createReprint()}>Reprint labels</button> : null}</aside>
            </div>
          ) : (view === "receive_stock" && !receiptUnlocked) || (view === "put_away" && !putawayReady && !putawayResult) ? (
            <section className="inbound-work-panel" id={view === "receive_stock" ? "receive-stock" : "put-away"}>
              <div className="inbound-work-heading"><div><h2>{view === "receive_stock" ? "Receive stock" : "Put away"}</h2><p>This workspace is available. Complete the prerequisite before recording stock.</p></div></div>
              <section className="inbound-awaiting-line"><strong>{view === "receive_stock" ? "Physical label confirmation required" : "Confirmed staging stock required"}</strong><p>{scopeLoading ? "Checking the selected scope." : scopeError ? "The selected scope could not be verified. Select the scope again to retry." : view === "receive_stock" ? "Print the selected product labels and confirm the physical result before receiving." : "There are no units awaiting put away in this scope. Review its receipt and movement history; completed stock must not be received again."}</p></section>
              <button className="button button-secondary" type="button" onClick={() => setView(view === "receive_stock" ? "label_print" : "receipt_history")}>{view === "receive_stock" ? "Open label print" : "Open receipt history"}</button>
            </section>
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
          ) : view === "put_away" ? <WarehousePutawayPanel selection={{ shipmentId: preview.scope.shipmentId, cartonNumbers: preview.scope.cartonNumbers }} onPutawayConfirmed={(outcome) => { setPutawayResult(outcome); void loadPutawayAvailability(preview.scope.shipmentId, preview.scope.cartonNumbers); }} /> : <ReceiptHistoryPanel selection={{ shipmentId: preview.scope.shipmentId, cartonNumbers: preview.scope.cartonNumbers }} sourceCartons={availableCartons} />}

          <section className="inbound-bottom-note"><div><span>{bottomLabel}</span><strong>{bottomTitle}</strong><p>{bottomCopy}</p></div><button className="button button-secondary" type="button" onClick={() => setView("receipt_history")}>View receipt history</button></section>
          <p className="inbound-message" role="status">{isHistoryView ? "Read-only audit view." : message}</p>
        </main>
      </section>
    </div>
  );
}
