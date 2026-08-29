"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  CaretRight,
  CheckCircle,
  ClipboardText,
  Package,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { buildApiHeaders } from "../lib/clientAuth";
import type {
  PackingListRevision,
  PrearrivalShipment,
  PrearrivalShipmentSummary,
} from "../lib/repository";
import type { PackingListRevisionInput } from "../lib/prearrivalShipment";

type ShipmentListResponse =
  | { ok: true; shipments: PrearrivalShipmentSummary[] }
  | { ok: false; message?: string };
type ShipmentResponse =
  | { ok: true; shipment: PrearrivalShipment }
  | { ok: false; message?: string };
type RevisionResponse =
  | { ok: true; revision: PackingListRevision }
  | { ok: false; message?: string };

type CartonSelection = { palletIndex: number; cartonIndex: number };
type SelectedCarton = {
  sourcePalletNumber: string;
  sourceCartonNumber: string;
  draftPallet?: PackingListRevisionInput["pallets"][number];
  draftCarton?: PackingListRevisionInput["pallets"][number]["cartons"][number];
};

function latestConfirmedRevision(shipment: PrearrivalShipment): PackingListRevision | undefined {
  return shipment.revisions
    .filter((revision) => revision.status === "confirmed")
    .sort((left, right) => right.version - left.version)[0];
}

function payloadFromShipment(shipment: PrearrivalShipment): PackingListRevisionInput {
  const confirmed = latestConfirmedRevision(shipment);
  if (confirmed) return structuredClone(confirmed.payloadSnapshot);

  const cartonsByPallet = new Map<string, PrearrivalShipment["cartons"]>();
  for (const carton of shipment.cartons) {
    const pallet = carton.sourcePalletNumber ?? "UNASSIGNED";
    cartonsByPallet.set(pallet, [...(cartonsByPallet.get(pallet) ?? []), carton]);
  }
  return {
    shipmentId: shipment.shipmentId,
    pallets: [...cartonsByPallet.entries()].map(([sourcePalletNumber, cartons]) => ({
      sourcePalletNumber,
      cartons: cartons.map((carton) => ({
        sourceCartonNumber: carton.sourceCartonNumber,
        lines: shipment.lines
          .filter((line) => line.sourceCartonNumber === carton.sourceCartonNumber)
          .map((line) => ({
            sku: line.sku,
            expectedQuantity: line.expectedQuantity,
          })),
      })),
    })),
  };
}

function formatChinaTime(value?: string) {
  if (!value) return "Confirmation pending";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

export function PrearrivalShipmentPanel() {
  const [shipments, setShipments] = useState<PrearrivalShipmentSummary[]>([]);
  const [shipment, setShipment] = useState<PrearrivalShipment | null>(null);
  const [selection, setSelection] = useState<CartonSelection>({ palletIndex: 0, cartonIndex: 0 });
  const [draftPayload, setDraftPayload] = useState<PackingListRevisionInput | null>(null);
  const [message, setMessage] = useState("Loading pre-arrival shipment data.");
  const [busy, setBusy] = useState(false);

  async function loadShipment(shipmentId: string) {
    const response = await fetch(
      `/api/prearrival/shipments?shipmentId=${encodeURIComponent(shipmentId)}`,
      { cache: "no-store", headers: await buildApiHeaders("partner") },
    );
    const body = (await response.json()) as ShipmentResponse;
    if (!response.ok || !body.ok) {
      setShipment(null);
      setMessage(("message" in body && body.message) || "Pre-arrival shipment could not be loaded.");
      return;
    }
    setShipment(body.shipment);
    setSelection({ palletIndex: 0, cartonIndex: 0 });
    setMessage("Export packing data confirmed. Create a revision before changing any source quantity.");
  }

  async function loadWorkspace() {
    const response = await fetch("/api/prearrival/shipments", {
      cache: "no-store",
      headers: await buildApiHeaders("partner"),
    });
    const body = (await response.json()) as ShipmentListResponse;
    if (!response.ok || !body.ok || !body.shipments.length) {
      setMessage(("message" in body && body.message) || "No pre-arrival shipments are available.");
      return;
    }
    setShipments(body.shipments);
    await loadShipment(body.shipments[0].shipmentId);
  }

  useEffect(() => {
    void loadWorkspace();
  }, []);

  const selectedCarton = useMemo<SelectedCarton | null>(() => {
    if (draftPayload) {
      const draftPallet = draftPayload.pallets[selection.palletIndex] ?? draftPayload.pallets[0];
      const draftCarton = draftPallet?.cartons[selection.cartonIndex] ?? draftPallet?.cartons[0];
      return draftPallet && draftCarton
        ? {
            sourcePalletNumber: draftPallet.sourcePalletNumber,
            sourceCartonNumber: draftCarton.sourceCartonNumber,
            draftPallet,
            draftCarton,
          }
        : null;
    }
    const pallet = shipment?.pallets[selection.palletIndex] ?? shipment?.pallets[0];
    const cartons = shipment?.cartons.filter(
      (carton) => carton.sourcePalletNumber === pallet?.sourcePalletNumber,
    ) ?? [];
    const carton = cartons[selection.cartonIndex] ?? cartons[0];
    return pallet && carton
      ? {
          sourcePalletNumber: pallet.sourcePalletNumber,
          sourceCartonNumber: carton.sourceCartonNumber,
        }
      : null;
  }, [draftPayload, selection, shipment]);

  const confirmed = shipment ? latestConfirmedRevision(shipment) : undefined;
  const selectedLines = shipment && selectedCarton
    ? shipment.lines.filter((line) => line.sourceCartonNumber === selectedCarton.sourceCartonNumber)
    : [];

  function startRevision() {
    if (!shipment) return;
    setDraftPayload(payloadFromShipment(shipment));
    setMessage("Working revision opened. Confirming creates a new immutable packing-list version.");
  }

  function updateSelectedCarton(
    field: "pallet" | "carton" | "sku" | "quantity",
    value: string,
    lineIndex = 0,
  ) {
    setDraftPayload((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const pallet = next.pallets[selection.palletIndex];
      const carton = pallet?.cartons[selection.cartonIndex];
      if (!pallet || !carton) return current;
      if (field === "pallet") pallet.sourcePalletNumber = value;
      if (field === "carton") carton.sourceCartonNumber = value;
      if (field === "sku" && carton.lines[lineIndex]) carton.lines[lineIndex].sku = value;
      if (field === "quantity" && carton.lines[lineIndex]) {
        carton.lines[lineIndex].expectedQuantity = Number(value);
      }
      return next;
    });
  }

  async function confirmRevision() {
    if (!draftPayload || !shipment) return;
    setBusy(true);
    try {
      const createResponse = await fetch(
        `/api/prearrival/shipments/${encodeURIComponent(shipment.shipmentId)}/revisions`,
        {
          method: "POST",
          headers: await buildApiHeaders("partner", { "Content-Type": "application/json" }),
          body: JSON.stringify(draftPayload),
        },
      );
      const created = (await createResponse.json()) as RevisionResponse;
      if (!createResponse.ok || !created.ok) {
        setMessage(("message" in created && created.message) || "Packing-list revision could not be created.");
        return;
      }

      const confirmResponse = await fetch(
        `/api/prearrival/revisions/${encodeURIComponent(created.revision.id)}/confirm`,
        {
          method: "POST",
          headers: await buildApiHeaders("partner"),
        },
      );
      const confirmedRevision = (await confirmResponse.json()) as RevisionResponse;
      if (!confirmResponse.ok || !confirmedRevision.ok) {
        setMessage(("message" in confirmedRevision && confirmedRevision.message) || "Packing-list revision could not be confirmed.");
        return;
      }

      setDraftPayload(null);
      await loadShipment(shipment.shipmentId);
      setMessage(`Packing list v${confirmedRevision.revision.version} confirmed`);
    } finally {
      setBusy(false);
    }
  }

  if (!shipment) {
    return <section className="prearrival-loading" role="status"><Package size={28} weight="duotone" />{message}</section>;
  }

  const activeLines = draftPayload && selectedCarton
    ? (selectedCarton.draftCarton?.lines ?? []).map((line) => ({
      ...line,
      sourceCartonNumber: selectedCarton.sourceCartonNumber,
    }))
    : selectedLines;

  return (
    <div className="prearrival-app" id="prearrival-workspace">
      <aside className="prearrival-sidebar" aria-label="Partner workspace navigation">
        <div className="prearrival-brand">
          <Image src="/assets/brand/DriveMate_Parts_Primary_Lockup_v2.0.svg" alt="DriveMate Parts" width={135} height={34} priority />
          <p>Partner workspace</p>
          <span>Unified operational access</span>
        </div>
        <nav className="prearrival-nav">
          <span>Workspace</span>
          <a href="#shipment-overview">Dashboard</a>
          <a className="is-active" href="#prearrival-workspace">Pre-arrival shipments</a>
          <Link href="/warehouse">Inbound operations</Link>
          <a href="#shipment-contents">Inventory</a>
          <a href="#packing-list-history">History and audit</a>
        </nav>
        <div className="prearrival-access-note">
          <span>Partner access</span>
          <p>Same workflow rights</p>
          <p>Actor always recorded</p>
          <p>Timezone is a display choice</p>
        </div>
        <div className="prearrival-phase-note"><span>Phase 1</span><p>Sample data only</p></div>
      </aside>

      <section className="prearrival-content">
        <header className="prearrival-topbar">
          <h1>Pre-arrival shipments</h1>
          <div><span>Partner</span><span>Australia/Brisbane</span><b>P</b></div>
        </header>

        <main className="prearrival-main">
          <section className="prearrival-shipment-bar" id="shipment-overview">
            <div>
              <span>Pre-arrival shipment</span>
              <strong>{shipments.find((item) => item.shipmentId === shipment.shipmentId)?.shipmentReference ?? shipment.shipmentId}</strong>
            </div>
            <p>Packing List v{confirmed?.version ?? 0} / {shipment.pallets.length} pallets / {shipment.cartons.length} cartons</p>
            <select
              aria-label="Shipment"
              value={shipment.shipmentId}
              onChange={(event) => void loadShipment(event.target.value)}
            >
              {shipments.map((item) => (
                <option key={item.shipmentId} value={item.shipmentId}>
                  {item.shipmentReference ?? item.shipmentId}
                </option>
              ))}
            </select>
          </section>

          <section className="prearrival-confirmation" role="status">
            <CheckCircle size={26} weight="fill" />
            <div><strong>Export packing data confirmed</strong><p>The Australia warehouse can select this shipment for label preparation and receiving. A revision creates a new auditable version.</p></div>
            <span>Ready for AU</span>
          </section>

          <div className="prearrival-workgrid">
            <section className="prearrival-structure">
              <h2>Packing structure</h2>
              <p>Original source numbers are retained.</p>
              <span className="prearrival-section-label">Pallets and cartons</span>
              {shipment.pallets.map((pallet, palletIndex) => {
                const cartons = shipment.cartons.filter((carton) => carton.sourcePalletNumber === pallet.sourcePalletNumber);
                return (
                  <div className="prearrival-pallet" key={pallet.sourcePalletNumber}>
                    <button
                      className={selection.palletIndex === palletIndex ? "is-selected" : ""}
                      type="button"
                      onClick={() => setSelection({ palletIndex, cartonIndex: 0 })}
                    >
                      <strong>Pallet {pallet.sourcePalletNumber}</strong><span>{cartons.length} carton{cartons.length === 1 ? "" : "s"}</span>
                    </button>
                    <div>
                      {cartons.map((carton, cartonIndex) => {
                        const quantity = shipment.lines
                          .filter((line) => line.sourceCartonNumber === carton.sourceCartonNumber)
                          .reduce((sum, line) => sum + line.expectedQuantity, 0);
                        return (
                          <button
                            className={selection.palletIndex === palletIndex && selection.cartonIndex === cartonIndex ? "is-selected" : ""}
                            key={carton.sourceCartonNumber}
                            type="button"
                            onClick={() => setSelection({ palletIndex, cartonIndex })}
                          >
                            <CaretRight size={14} /><strong>{carton.sourceCartonNumber}</strong><span>{quantity} units</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="prearrival-phase-copy"><span>Phase 1 label position</span><p>No DriveMate label is required in China. Australian printing is prepared from this data.</p></div>
            </section>

            <section className="prearrival-detail" id="shipment-contents">
              <div className="prearrival-detail-heading">
                <div>
                  <h2>Carton {selectedCarton?.sourceCartonNumber} expected contents</h2>
                  <p>The selected carton determines Australian label quantities and receipt validation.</p>
                </div>
                <ClipboardText size={28} weight="duotone" />
              </div>

              <div className="prearrival-version-row" id="packing-list-history">
                <div><span>Packing list version</span><strong>v{confirmed?.version ?? 0} confirmed on {formatChinaTime(confirmed?.confirmedAt)} China Standard Time</strong></div>
                <button className="secondary-button" type="button" onClick={startRevision} disabled={busy}>Create revision</button>
              </div>

              {draftPayload && selectedCarton?.draftPallet && selectedCarton.draftCarton ? (
                <section className="prearrival-editor" aria-label="Packing list revision editor">
                  <h3>Working revision</h3>
                  <p>Confirming this copy creates a new immutable version. The existing confirmed record remains unchanged.</p>
                  <div className="prearrival-editor-grid">
                    <label>Pallet number<input value={selectedCarton.draftPallet.sourcePalletNumber} onChange={(event) => updateSelectedCarton("pallet", event.target.value)} /></label>
                    <label>Carton number<input value={selectedCarton.draftCarton.sourceCartonNumber} onChange={(event) => updateSelectedCarton("carton", event.target.value)} /></label>
                    {selectedCarton.draftCarton.lines.map((line, lineIndex) => (
                      <div className="prearrival-line-editor" key={`${line.sku}-${lineIndex}`}>
                        <label>{lineIndex === 0 ? "SKU" : `SKU ${lineIndex + 1}`}<input value={line.sku} onChange={(event) => updateSelectedCarton("sku", event.target.value, lineIndex)} /></label>
                        <label>{lineIndex === 0 ? "Expected quantity" : `Expected quantity ${lineIndex + 1}`}<input min="1" type="number" value={line.expectedQuantity} onChange={(event) => updateSelectedCarton("quantity", event.target.value, lineIndex)} /></label>
                      </div>
                    ))}
                  </div>
                  <div className="prearrival-editor-actions"><button className="button button-primary" type="button" onClick={() => void confirmRevision()} disabled={busy}>{busy ? "Confirming..." : "Confirm packing list"}</button><button className="button button-secondary" type="button" onClick={() => setDraftPayload(null)} disabled={busy}>Cancel working copy</button></div>
                </section>
              ) : null}

              <div className="prearrival-table-shell">
                <table>
                  <thead><tr><th>SKU</th><th>Product barcode</th><th>Expected qty</th><th>Label preparation</th></tr></thead>
                  <tbody>{activeLines.map((line) => <tr key={`${line.sku}-${line.sourceCartonNumber}`}><td data-label="SKU"><code>{line.sku}</code></td><td data-label="Product barcode"><code>{shipment.productBarcodes[line.sku] ?? "Not assigned"}</code></td><td data-label="Expected qty"><strong>{line.expectedQuantity}</strong></td><td data-label="Label preparation"><strong className="prearrival-ready">{line.expectedQuantity} Ready</strong></td></tr>)}</tbody>
                </table>
              </div>

              <div className="prearrival-validation"><span>Validation before export confirmation</span><strong>Every carton must belong to one pallet and contain recognised SKU plus a positive expected quantity.</strong></div>
              <div className="prearrival-actions"><button className="secondary-button" type="button" onClick={() => setMessage("The current confirmed packing list is shown in this workspace.")}>View packing list</button><Link className="button button-primary" href={`/warehouse?shipmentId=${encodeURIComponent(shipment.shipmentId)}`}>Prepare AU labels <ArrowRight size={18} /></Link></div>
              <p className="prearrival-message" role="status">{message}</p>
            </section>
          </div>

          <section className="prearrival-ownership"><span>Data ownership</span><strong>Partners work from the same shipment record. Country changes timezone and operational context, never core permissions.</strong></section>
        </main>
      </section>
    </div>
  );
}
