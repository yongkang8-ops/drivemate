"use client";

import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  CaretRight,
  CheckCircle,
  ClipboardText,
  Package,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildApiHeaders } from "../lib/clientAuth";
import {
  mapPackingListServerErrors,
  packingListFieldKey,
  validatePackingListDraft,
  type PackingListFieldErrors,
  type PackingListServerError,
} from "../lib/prearrivalDraftValidation";
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
  | { ok: false; message?: string; error?: PackingListServerError };

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
  const payload = {
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
  return payload.pallets.length ? payload : initialPackingListPayload(shipment.shipmentId);
}

function blankPackingListLine() {
  return { sku: "", expectedQuantity: 1 };
}

function blankPackingListCarton() {
  return {
    sourceCartonNumber: "",
    lines: [blankPackingListLine()],
  };
}

function blankPackingListPallet() {
  return {
    sourcePalletNumber: "",
    cartons: [blankPackingListCarton()],
  };
}

function initialPackingListPayload(shipmentId: string): PackingListRevisionInput {
  return {
    shipmentId,
    pallets: [blankPackingListPallet()],
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
  const [fieldErrors, setFieldErrors] = useState<PackingListFieldErrors>({});
  const [errorSummary, setErrorSummary] = useState<string | null>(null);
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function clearDraftErrors() {
    setFieldErrors({});
    setErrorSummary(null);
  }

  function focusDraftField(field: string | undefined) {
    if (!field) return;
    requestAnimationFrame(() => fieldRefs.current[field]?.focus());
  }

  function clearFieldError(field: string) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      if (!Object.keys(next).length) setErrorSummary(null);
      return next;
    });
  }

  function cancelWorkingCopy() {
    setDraftPayload(null);
    clearDraftErrors();
    setMessage("Create and confirm the first Packing List before Australian warehouse work begins.");
  }

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
    setDraftPayload(null);
    clearDraftErrors();
    setSelection({ palletIndex: 0, cartonIndex: 0 });
    setMessage(body.shipment.packingListStatus === "confirmed"
      ? "Export packing data confirmed. Create a revision before changing any source quantity."
      : body.shipment.packingListStatus === "draft"
        ? "A prior immutable draft exists. Open a new working copy to complete and confirm the Packing List."
        : "Create and confirm the first Packing List before Australian warehouse work begins.");
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
    const requestedShipmentId = new URLSearchParams(window.location.search).get("shipmentId");
    const initialShipment = body.shipments.find(
      (candidate) => candidate.shipmentId === requestedShipmentId,
    ) ?? body.shipments[0];
    await loadShipment(initialShipment.shipmentId);
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
    clearDraftErrors();
    setDraftPayload(payloadFromShipment(shipment));
    setSelection({ palletIndex: 0, cartonIndex: 0 });
    setMessage(shipment.packingListStatus === "not_started"
      ? "First Packing List working copy opened. Add the complete pallet, carton and SKU structure before confirmation."
      : "Working revision opened. Confirming creates a new immutable Packing List version.");
  }

  function addPallet() {
    setDraftPayload((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.pallets.push(blankPackingListPallet());
      setSelection({ palletIndex: next.pallets.length - 1, cartonIndex: 0 });
      return next;
    });
  }

  function addCarton() {
    setDraftPayload((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const pallet = next.pallets[selection.palletIndex];
      if (!pallet) return current;
      pallet.cartons.push(blankPackingListCarton());
      setSelection({ palletIndex: selection.palletIndex, cartonIndex: pallet.cartons.length - 1 });
      return next;
    });
  }

  function addSkuLine() {
    setDraftPayload((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const carton = next.pallets[selection.palletIndex]?.cartons[selection.cartonIndex];
      if (!carton) return current;
      carton.lines.push(blankPackingListLine());
      return next;
    });
  }

  function removeSkuLine(lineIndex: number) {
    setDraftPayload((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const carton = next.pallets[selection.palletIndex]?.cartons[selection.cartonIndex];
      if (!carton || carton.lines.length === 1) return current;
      carton.lines.splice(lineIndex, 1);
      return next;
    });
  }

  function removeSelectedCarton() {
    setDraftPayload((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const pallet = next.pallets[selection.palletIndex];
      if (!pallet || pallet.cartons.length === 1) return current;
      pallet.cartons.splice(selection.cartonIndex, 1);
      setSelection({
        palletIndex: selection.palletIndex,
        cartonIndex: Math.max(0, selection.cartonIndex - 1),
      });
      return next;
    });
  }

  function removeSelectedPallet() {
    setDraftPayload((current) => {
      if (!current || current.pallets.length === 1) return current;
      const next = structuredClone(current);
      next.pallets.splice(selection.palletIndex, 1);
      setSelection({ palletIndex: Math.max(0, selection.palletIndex - 1), cartonIndex: 0 });
      return next;
    });
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
    const validation = validatePackingListDraft(draftPayload, shipment.productMasterSkus);
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setErrorSummary(validation.summary ?? null);
      focusDraftField(validation.firstField);
      return;
    }
    clearDraftErrors();
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
        const serverFieldErrors = mapPackingListServerErrors(
          "error" in created ? created.error : undefined,
        );
        const firstServerField = Object.keys(serverFieldErrors)[0];
        if (firstServerField) {
          setFieldErrors(serverFieldErrors);
          setErrorSummary("Review the highlighted Packing List fields and try again.");
          focusDraftField(firstServerField);
        } else {
          setErrorSummary(
            ("message" in created && created.message)
            || "The Packing List could not be saved. Review the form and try again.",
          );
        }
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
      setMessage(`Packing List v${confirmedRevision.revision.version} confirmed`);
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
  const structurePallets = draftPayload
    ? draftPayload.pallets
    : shipment.pallets.map((pallet) => ({
        sourcePalletNumber: pallet.sourcePalletNumber,
        cartons: shipment.cartons
          .filter((carton) => carton.sourcePalletNumber === pallet.sourcePalletNumber)
          .map((carton) => ({
            sourceCartonNumber: carton.sourceCartonNumber,
            lines: shipment.lines.filter(
              (line) => line.sourceCartonNumber === carton.sourceCartonNumber,
            ),
          })),
      }));
  const packingListConfirmed = shipment.packingListStatus === "confirmed";
  const palletField = packingListFieldKey([
    "pallets",
    selection.palletIndex,
    "sourcePalletNumber",
  ]);
  const cartonField = packingListFieldKey([
    "pallets",
    selection.palletIndex,
    "cartons",
    selection.cartonIndex,
    "sourceCartonNumber",
  ]);
  const errorId = (field: string) => `prearrival-error-${field.replace(/\./g, "-")}`;

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
        <div className="prearrival-phase-note"><span>Inbound gate</span><p>Label preparation remains locked until Packing List confirmation.</p></div>
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
            <p>{packingListConfirmed
              ? `Packing List v${confirmed?.version ?? shipment.confirmedPackingListVersion ?? 0} / ${shipment.pallets.length} pallets / ${shipment.cartons.length} cartons`
              : `${shipment.packingListStatus === "draft" ? "Draft exists" : "Packing List not started"} / Warehouse locked until confirmation`}</p>
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

          <section className={`prearrival-confirmation ${packingListConfirmed ? "" : "is-required"}`} role="status">
            {packingListConfirmed
              ? <CheckCircle size={26} weight="fill" />
              : <WarningCircle size={26} weight="fill" />}
            <div>
              {packingListConfirmed
                ? <strong>Export packing data confirmed</strong>
                : <h2>Packing List setup required</h2>}
              <p>{packingListConfirmed
                ? "The Australia warehouse can select this shipment for label preparation and receiving. A revision creates a new auditable version."
                : "Enter the export pallet, carton and SKU structure, then confirm the first immutable Packing List to unlock Warehouse."}</p>
            </div>
            {packingListConfirmed
              ? <span>Ready for AU</span>
              : draftPayload
                ? <span>Working copy open</span>
                : <button className="button button-primary" type="button" onClick={startRevision}>
                    Create first Packing List
                  </button>}
          </section>

          <div className="prearrival-workgrid">
            <section className="prearrival-structure">
              <h2>Packing structure</h2>
              <p>Original source numbers are retained.</p>
              <span className="prearrival-section-label">Pallets and cartons</span>
              {!structurePallets.length ? (
                <div className="prearrival-structure-empty">
                  <Package size={22} weight="duotone" />
                  <p>No pallet or carton lines are confirmed for this Shipment.</p>
                </div>
              ) : null}
              {structurePallets.map((pallet, palletIndex) => {
                const cartons = pallet.cartons;
                return (
                  <div className="prearrival-pallet" key={`${pallet.sourcePalletNumber}-${palletIndex}`}>
                    <button
                      className={selection.palletIndex === palletIndex ? "is-selected" : ""}
                      type="button"
                      onClick={() => setSelection({ palletIndex, cartonIndex: 0 })}
                    >
                      <strong>Pallet {pallet.sourcePalletNumber || `New ${palletIndex + 1}`}</strong><span>{cartons.length} carton{cartons.length === 1 ? "" : "s"}</span>
                    </button>
                    <div>
                      {cartons.map((carton, cartonIndex) => {
                        const quantity = carton.lines.reduce((sum, line) => sum + line.expectedQuantity, 0);
                        return (
                          <button
                            className={selection.palletIndex === palletIndex && selection.cartonIndex === cartonIndex ? "is-selected" : ""}
                            key={`${carton.sourceCartonNumber}-${cartonIndex}`}
                            type="button"
                            onClick={() => setSelection({ palletIndex, cartonIndex })}
                          >
                            <CaretRight size={14} /><strong>{carton.sourceCartonNumber || `New ${cartonIndex + 1}`}</strong><span>{quantity} units</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {draftPayload ? (
                <div className="prearrival-structure-actions" aria-label="Packing List structure actions">
                  <button className="secondary-button" type="button" onClick={addCarton}><Plus size={15} />Add carton</button>
                  <button className="secondary-button" type="button" onClick={addPallet}><Plus size={15} />Add pallet</button>
                  <button className="prearrival-remove-button" type="button" onClick={removeSelectedCarton} disabled={(selectedCarton?.draftPallet?.cartons.length ?? 0) <= 1}><Trash size={14} />Remove carton</button>
                  <button className="prearrival-remove-button" type="button" onClick={removeSelectedPallet} disabled={draftPayload.pallets.length <= 1}><Trash size={14} />Remove pallet</button>
                </div>
              ) : null}
              <div className="prearrival-phase-copy"><span>Export label position</span><p>No DriveMate label is required in China. Australian printing is prepared from this data.</p></div>
            </section>

            <section className="prearrival-detail" id="shipment-contents">
              <div className="prearrival-detail-heading">
                <div>
                  <h2>{selectedCarton
                    ? `Carton ${selectedCarton.sourceCartonNumber || "working copy"} expected contents`
                    : "Packing List contents"}</h2>
                  <p>{packingListConfirmed
                    ? "The selected carton determines Australian label quantities and receipt validation."
                    : "Complete every source identifier and SKU quantity before confirming the first Packing List."}</p>
                </div>
                <ClipboardText size={28} weight="duotone" />
              </div>

              <div className="prearrival-version-row" id="packing-list-history">
                <div><span>Packing List version</span><strong>{packingListConfirmed
                  ? `v${confirmed?.version ?? shipment.confirmedPackingListVersion ?? 0} confirmed on ${formatChinaTime(confirmed?.confirmedAt)} China Standard Time`
                  : shipment.packingListStatus === "draft"
                    ? `Draft v${shipment.latestPackingListVersion ?? 1} exists. Warehouse remains locked until a revision is confirmed.`
                    : "No confirmed version. Warehouse remains locked."}</strong></div>
                {packingListConfirmed
                  ? <button className="secondary-button" type="button" onClick={startRevision} disabled={busy}>Create revision</button>
                  : !draftPayload
                    ? <button className="secondary-button" type="button" onClick={startRevision} disabled={busy}>Open working copy</button>
                    : null}
              </div>

              {draftPayload && selectedCarton?.draftPallet && selectedCarton.draftCarton ? (
                <section className="prearrival-editor" aria-label="Packing list revision editor">
                  <h3>{packingListConfirmed ? "Working revision" : "First Packing List working copy"}</h3>
                  <p>{packingListConfirmed
                    ? "Confirming this copy creates a new immutable version. The existing confirmed record remains unchanged."
                    : "Build the complete export structure here. Confirmation creates immutable Packing List v1 and unlocks Warehouse."}</p>
                  {errorSummary ? <div className="prearrival-error-summary" role="alert">{errorSummary}</div> : null}
                  <div className="prearrival-editor-grid">
                    <label>Pallet number<input ref={(element) => { fieldRefs.current[palletField] = element; }} aria-invalid={Boolean(fieldErrors[palletField])} aria-describedby={fieldErrors[palletField] ? errorId(palletField) : undefined} value={selectedCarton.draftPallet.sourcePalletNumber} onChange={(event) => { clearFieldError(palletField); updateSelectedCarton("pallet", event.target.value); }} />{fieldErrors[palletField] ? <span className="prearrival-field-error" id={errorId(palletField)}>{fieldErrors[palletField]}</span> : null}</label>
                    <label>Carton number<input ref={(element) => { fieldRefs.current[cartonField] = element; }} aria-invalid={Boolean(fieldErrors[cartonField])} aria-describedby={fieldErrors[cartonField] ? errorId(cartonField) : undefined} value={selectedCarton.draftCarton.sourceCartonNumber} onChange={(event) => { clearFieldError(cartonField); updateSelectedCarton("carton", event.target.value); }} />{fieldErrors[cartonField] ? <span className="prearrival-field-error" id={errorId(cartonField)}>{fieldErrors[cartonField]}</span> : null}</label>
                    {selectedCarton.draftCarton.lines.map((line, lineIndex) => {
                      const skuField = packingListFieldKey(["pallets", selection.palletIndex, "cartons", selection.cartonIndex, "lines", lineIndex, "sku"]);
                      const quantityField = packingListFieldKey(["pallets", selection.palletIndex, "cartons", selection.cartonIndex, "lines", lineIndex, "expectedQuantity"]);
                      return (
                        <div className="prearrival-line-editor" key={`${line.sku}-${lineIndex}`}>
                          <label>{lineIndex === 0 ? "SKU" : `SKU ${lineIndex + 1}`}<input ref={(element) => { fieldRefs.current[skuField] = element; }} aria-invalid={Boolean(fieldErrors[skuField])} aria-describedby={fieldErrors[skuField] ? errorId(skuField) : undefined} value={line.sku} onChange={(event) => { clearFieldError(skuField); updateSelectedCarton("sku", event.target.value, lineIndex); }} />{fieldErrors[skuField] ? <span className="prearrival-field-error" id={errorId(skuField)}>{fieldErrors[skuField]}</span> : null}</label>
                          <label>{lineIndex === 0 ? "Expected quantity" : `Expected quantity ${lineIndex + 1}`}<input ref={(element) => { fieldRefs.current[quantityField] = element; }} aria-invalid={Boolean(fieldErrors[quantityField])} aria-describedby={fieldErrors[quantityField] ? errorId(quantityField) : undefined} min="1" type="number" value={line.expectedQuantity} onChange={(event) => { clearFieldError(quantityField); updateSelectedCarton("quantity", event.target.value, lineIndex); }} />{fieldErrors[quantityField] ? <span className="prearrival-field-error" id={errorId(quantityField)}>{fieldErrors[quantityField]}</span> : null}</label>
                          {lineIndex > 0 ? <button className="prearrival-remove-button" type="button" aria-label={`Remove SKU line ${lineIndex + 1}`} onClick={() => removeSkuLine(lineIndex)}><Trash size={14} />Remove line</button> : null}
                        </div>
                      );
                    })}
                  </div>
                  <button className="secondary-button prearrival-add-line" type="button" onClick={addSkuLine}><Plus size={15} />Add SKU line</button>
                  <div className="prearrival-editor-actions"><button className="button button-primary" type="button" onClick={() => void confirmRevision()} disabled={busy}>{busy ? "Confirming..." : "Confirm Packing List"}</button><button className="button button-secondary" type="button" onClick={cancelWorkingCopy} disabled={busy}>Cancel working copy</button></div>
                </section>
              ) : null}

              {activeLines.length ? (
                <div className="prearrival-table-shell">
                  <table>
                    <thead><tr><th>SKU</th><th>Product barcode</th><th>Expected qty</th><th>Label preparation</th></tr></thead>
                    <tbody>{activeLines.map((line) => <tr key={`${line.sku}-${line.sourceCartonNumber}`}><td data-label="SKU"><code>{line.sku || "Pending"}</code></td><td data-label="Product barcode"><code>{shipment.productBarcodes[line.sku] ?? "Not assigned"}</code></td><td data-label="Expected qty"><strong>{line.expectedQuantity}</strong></td><td data-label="Label preparation"><strong className="prearrival-ready">{line.sku ? `${line.expectedQuantity} Ready` : "Pending"}</strong></td></tr>)}</tbody>
                  </table>
                </div>
              ) : (
                <div className="prearrival-lines-empty">
                  <ClipboardText size={22} weight="duotone" />
                  <div><strong>No SKU lines are available until a working copy is opened.</strong><p>Use Create first Packing List to enter the export structure for this Shipment.</p></div>
                </div>
              )}

              <div className="prearrival-validation"><span>Validation before export confirmation</span><strong>Every carton must belong to one pallet and contain recognised SKU plus a positive expected quantity.</strong></div>
              <div className="prearrival-actions"><button className="secondary-button" type="button" onClick={() => setMessage(packingListConfirmed ? "The current confirmed Packing List is shown in this workspace." : "Confirm the first Packing List to make Australian label quantities available.")}>View Packing List</button>{packingListConfirmed ? <Link className="button button-primary" href={`/warehouse?shipmentId=${encodeURIComponent(shipment.shipmentId)}`}>Prepare AU labels <ArrowRight size={18} /></Link> : null}</div>
              <p className="prearrival-message" role="status">{message}</p>
            </section>
          </div>

          <section className="prearrival-ownership"><span>Data ownership</span><strong>Partners work from the same shipment record. Country changes timezone and operational context, never core permissions.</strong></section>
        </main>
      </section>
    </div>
  );
}
