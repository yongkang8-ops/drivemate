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
import {
  deriveCartonStructureSummary,
  derivePalletMappingSummary,
  type PackingListCartonScopeInput,
  type PackingListRevisionInputV2,
  type PackingListRevisionInputV3,
} from "../lib/prearrivalShipment";

type ShipmentListResponse =
  | { ok: true; shipments: PrearrivalShipmentSummary[] }
  | { ok: false; message?: string };
type ShipmentResponse =
  | { ok: true; shipment: PrearrivalShipment }
  | { ok: false; message?: string };
type RevisionResponse =
  | { ok: true; revision: PackingListRevision }
  | { ok: false; message?: string; error?: PackingListServerError };

type CartonSelection = { cartonIndex: number };
type PackingListDraftPayload = PackingListRevisionInputV2 | PackingListRevisionInputV3;
type SelectedCarton = {
  sourcePalletNumber?: string | null;
  sourceCartonNumber: string;
  draftCarton?: PackingListDraftPayload["cartons"][number];
};
type DraftLineIds = string[][];

function toV3CartonScope(input: {
  sourceCartonNumber: string;
  sourcePalletNumber?: string | null;
  kind?: "carton" | "carton_group";
  physicalCartonCount?: number;
  memberCartonNumbers?: string[];
  lines: PackingListCartonScopeInput["lines"];
}): PackingListCartonScopeInput {
  if (input.kind === "carton_group") {
    return {
      sourceCartonNumber: input.sourceCartonNumber,
      sourcePalletNumber: input.sourcePalletNumber ?? null,
      kind: "carton_group",
      physicalCartonCount: input.physicalCartonCount ?? input.memberCartonNumbers?.length ?? 2,
      memberCartonNumbers: input.memberCartonNumbers?.length
        ? [...input.memberCartonNumbers]
        : ["", ""],
      lines: structuredClone(input.lines),
    };
  }
  return {
    sourceCartonNumber: input.sourceCartonNumber,
    sourcePalletNumber: input.sourcePalletNumber ?? null,
    kind: "carton",
    physicalCartonCount: 1,
    memberCartonNumbers: [input.sourceCartonNumber],
    lines: structuredClone(input.lines),
  };
}

function latestConfirmedRevision(shipment: PrearrivalShipment): PackingListRevision | undefined {
  return shipment.revisions
    .filter((revision) => revision.status === "confirmed")
    .sort((left, right) => right.version - left.version)[0];
}

function latestDraftRevision(shipment: PrearrivalShipment): PackingListRevision | undefined {
  const confirmed = latestConfirmedRevision(shipment);
  return shipment.revisions
    .filter((revision) => (
      revision.status === "draft"
      && (!confirmed || revision.version > confirmed.version)
    ))
    .sort((left, right) => right.version - left.version)[0];
}

function payloadFromShipment(shipment: PrearrivalShipment): PackingListDraftPayload {
  const confirmed = latestConfirmedRevision(shipment);
  if (confirmed) return upgradePayloadToV3(confirmed.payloadSnapshot);

  const payload: PackingListRevisionInputV3 = {
    schemaVersion: 3,
    shipmentId: shipment.shipmentId,
    physicalPalletCount: shipment.physicalPalletCount ?? null,
    cartons: shipment.cartons.map((carton) => toV3CartonScope({
      sourceCartonNumber: carton.sourceCartonNumber,
      sourcePalletNumber: carton.sourcePalletNumber ?? null,
      kind: carton.kind ?? "carton",
      physicalCartonCount: carton.physicalCartonCount ?? 1,
      memberCartonNumbers: carton.memberCartonNumbers?.length
        ? [...carton.memberCartonNumbers]
        : [carton.sourceCartonNumber],
      lines: shipment.lines
        .filter((line) => line.sourceCartonNumber === carton.sourceCartonNumber)
        .map((line) => ({
          sku: line.sku,
          expectedQuantity: line.expectedQuantity,
        })),
    })),
  };
  return payload.cartons.length ? payload : initialPackingListPayload(shipment.shipmentId);
}

function blankPackingListLine() {
  return { sku: "", expectedQuantity: 1 };
}

function blankPackingListCarton(schemaVersion: 2 | 3): PackingListDraftPayload["cartons"][number] {
  if (schemaVersion === 3) {
    return {
      sourceCartonNumber: "",
      sourcePalletNumber: null,
      kind: "carton",
      physicalCartonCount: 1,
      memberCartonNumbers: [""],
      lines: [blankPackingListLine()],
    };
  }
  return {
    sourceCartonNumber: "",
    sourcePalletNumber: null,
    lines: [blankPackingListLine()],
  };
}

function upgradePayloadToV3(
  payload: PackingListRevisionInputV2 | PackingListRevisionInputV3,
): PackingListRevisionInputV3 {
  if (payload.schemaVersion === 3) return structuredClone(payload);
  return {
    schemaVersion: 3,
    shipmentId: payload.shipmentId,
    physicalPalletCount: payload.physicalPalletCount ?? null,
    cartons: payload.cartons.map((carton) => ({
      ...structuredClone(carton),
      kind: "carton" as const,
      physicalCartonCount: 1 as const,
      memberCartonNumbers: [carton.sourceCartonNumber],
    })),
  };
}

function initialPackingListPayload(shipmentId: string): PackingListRevisionInputV3 {
  return {
    schemaVersion: 3,
    shipmentId,
    physicalPalletCount: null,
    cartons: [blankPackingListCarton(3) as PackingListRevisionInputV3["cartons"][number]],
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

function shipmentStatusMessage(shipment: PrearrivalShipment): string {
  return shipment.packingListStatus === "confirmed"
    ? "Export packing data confirmed. Create a revision before changing any source quantity."
    : shipment.packingListStatus === "draft"
      ? "A prior immutable draft exists. Open a new working copy to complete and confirm the Packing List."
      : "Create and confirm the first Packing List before Australian warehouse work begins.";
}

export function PrearrivalShipmentPanel() {
  const [shipments, setShipments] = useState<PrearrivalShipmentSummary[]>([]);
  const [shipment, setShipment] = useState<PrearrivalShipment | null>(null);
  const [selection, setSelection] = useState<CartonSelection>({ cartonIndex: 0 });
  const [draftPayload, setDraftPayload] = useState<PackingListDraftPayload | null>(null);
  const [message, setMessage] = useState("Loading pre-arrival shipment data.");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<PackingListFieldErrors>({});
  const [errorSummary, setErrorSummary] = useState<string | null>(null);
  const [pendingFocusField, setPendingFocusField] = useState<string | null>(null);
  const [pendingRevisionId, setPendingRevisionId] = useState<string | null>(null);
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const [draftLineIds, setDraftLineIds] = useState<DraftLineIds>([]);
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const loadRequestToken = useRef(0);
  const draftLineIdSequence = useRef(0);
  const editorLocked = busy || pendingRevisionId !== null || reconciliationRequired;

  function createDraftLineId(): string {
    draftLineIdSequence.current += 1;
    return `draft-line-${draftLineIdSequence.current}`;
  }

  function lineIdsForPayload(payload: PackingListDraftPayload): DraftLineIds {
    return payload.cartons.map((carton) =>
      carton.lines.map(() => createDraftLineId()));
  }

  function clearDraftErrors() {
    setFieldErrors({});
    setErrorSummary(null);
    setPendingFocusField(null);
  }

  function clearRevisionProgress() {
    setPendingRevisionId(null);
    setReconciliationRequired(false);
  }

  function focusDraftField(field: string | undefined) {
    if (!field) return;
    const selectionPath = /^cartons\.(\d+)/.exec(field);
    if (selectionPath) {
      setSelection({ cartonIndex: Number(selectionPath[1]) });
    }
    setPendingFocusField(field);
  }

  function clearFieldError(field: string) {
    if (!fieldErrors[field]) return;
    const next = { ...fieldErrors };
    delete next[field];
    setFieldErrors(next);
    if (!Object.keys(next).length) setErrorSummary(null);
  }

  function cancelWorkingCopy() {
    if (editorLocked) return;
    setDraftPayload(null);
    setDraftLineIds([]);
    clearDraftErrors();
    clearRevisionProgress();
    if (shipment) setMessage(shipmentStatusMessage(shipment));
  }

  function startCorrectedRevision() {
    if (!draftPayload || !pendingRevisionId || busy || reconciliationRequired) return;
    const nextPayload = upgradePayloadToV3(draftPayload);
    setDraftPayload(nextPayload);
    setDraftLineIds(lineIdsForPayload(nextPayload));
    setPendingRevisionId(null);
    clearDraftErrors();
    setMessage("Saved draft retained for audit. Edit this working copy to create a corrected revision.");
  }

  async function loadShipment(shipmentId: string) {
    const requestToken = ++loadRequestToken.current;
    try {
      const response = await fetch(
        `/api/prearrival/shipments?shipmentId=${encodeURIComponent(shipmentId)}`,
        { cache: "no-store", headers: await buildApiHeaders("partner") },
      );
      const body = (await response.json()) as ShipmentResponse;
      if (requestToken !== loadRequestToken.current) return;
      if (!response.ok || !body.ok) {
        setShipment(null);
        setMessage(("message" in body && body.message) || "Pre-arrival shipment could not be loaded.");
        return;
      }
      setShipment(body.shipment);
      clearDraftErrors();
      setSelection({ cartonIndex: 0 });
      const savedDraft = latestDraftRevision(body.shipment);
      if (savedDraft) {
        const savedPayload = structuredClone(savedDraft.payloadSnapshot);
        setDraftPayload(savedPayload);
        setDraftLineIds(lineIdsForPayload(savedPayload));
        setPendingRevisionId(savedDraft.id);
        setReconciliationRequired(false);
        setMessage("A saved Packing List draft is awaiting confirmation.");
      } else {
        setDraftPayload(null);
        setDraftLineIds([]);
        clearRevisionProgress();
        setMessage(shipmentStatusMessage(body.shipment));
      }
    } catch {
      if (requestToken !== loadRequestToken.current) return;
      setMessage("Pre-arrival shipment could not be loaded. Try reloading shipment status.");
    }
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

  useEffect(() => {
    if (!pendingFocusField) return;
    const frame = requestAnimationFrame(() => {
      const input = fieldRefs.current[pendingFocusField];
      if (!input) return;
      input.focus();
      setPendingFocusField(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingFocusField, selection]);

  const selectedCarton = useMemo<SelectedCarton | null>(() => {
    if (draftPayload) {
      const draftCarton = draftPayload.cartons[selection.cartonIndex] ?? draftPayload.cartons[0];
      return draftCarton
        ? {
            sourcePalletNumber: draftCarton.sourcePalletNumber,
            sourceCartonNumber: draftCarton.sourceCartonNumber,
            draftCarton,
          }
        : null;
    }
    const carton = shipment?.cartons[selection.cartonIndex] ?? shipment?.cartons[0];
    return carton
      ? {
          sourcePalletNumber: carton.sourcePalletNumber,
          sourceCartonNumber: carton.sourceCartonNumber,
        }
      : null;
  }, [draftPayload, selection, shipment]);

  const confirmed = shipment ? latestConfirmedRevision(shipment) : undefined;
  const selectedLines = shipment && selectedCarton
    ? shipment.lines.filter((line) => line.sourceCartonNumber === selectedCarton.sourceCartonNumber)
    : [];

  function startRevision() {
    if (!shipment || editorLocked) return;
    clearDraftErrors();
    clearRevisionProgress();
    const nextPayload = payloadFromShipment(shipment);
    setDraftPayload(nextPayload);
    setDraftLineIds(lineIdsForPayload(nextPayload));
    setSelection({ cartonIndex: 0 });
    setMessage(shipment.packingListStatus === "not_started"
      ? "First Packing List working copy opened. Add the complete carton and SKU structure before confirmation. Pallet mapping may be added later."
      : "Working revision opened. Confirming creates a new immutable Packing List version.");
  }

  function addCarton() {
    if (!draftPayload || editorLocked) return;
    const nextPayload = structuredClone(draftPayload);
    const nextLineIds = structuredClone(draftLineIds);
    clearDraftErrors();
    if (nextPayload.schemaVersion === 3) {
      nextPayload.cartons.push(blankPackingListCarton(3) as PackingListRevisionInputV3["cartons"][number]);
    } else {
      nextPayload.cartons.push(blankPackingListCarton(2) as PackingListRevisionInputV2["cartons"][number]);
    }
    nextLineIds.push([createDraftLineId()]);
    setDraftPayload(nextPayload);
    setDraftLineIds(nextLineIds);
    setSelection({ cartonIndex: nextPayload.cartons.length - 1 });
  }

  function addSkuLine() {
    if (!draftPayload || editorLocked) return;
    const nextPayload = structuredClone(draftPayload);
    const carton = nextPayload.cartons[selection.cartonIndex];
    if (!carton) return;
    const nextLineIds = structuredClone(draftLineIds);
    const cartonLineIds = nextLineIds[selection.cartonIndex];
    if (!cartonLineIds) return;
    clearDraftErrors();
    carton.lines.push(blankPackingListLine());
    cartonLineIds.push(createDraftLineId());
    setDraftPayload(nextPayload);
    setDraftLineIds(nextLineIds);
  }

  function removeSkuLine(lineIndex: number) {
    if (!draftPayload || editorLocked) return;
    const nextPayload = structuredClone(draftPayload);
    const carton = nextPayload.cartons[selection.cartonIndex];
    if (!carton || carton.lines.length === 1) return;
    const nextLineIds = structuredClone(draftLineIds);
    const cartonLineIds = nextLineIds[selection.cartonIndex];
    if (!cartonLineIds) return;
    clearDraftErrors();
    carton.lines.splice(lineIndex, 1);
    cartonLineIds.splice(lineIndex, 1);
    setDraftPayload(nextPayload);
    setDraftLineIds(nextLineIds);
  }

  function removeSelectedCarton() {
    if (!draftPayload || editorLocked) return;
    const nextPayload = structuredClone(draftPayload);
    if (nextPayload.cartons.length === 1) return;
    const nextLineIds = structuredClone(draftLineIds);
    clearDraftErrors();
    nextPayload.cartons.splice(selection.cartonIndex, 1);
    nextLineIds.splice(selection.cartonIndex, 1);
    setDraftPayload(nextPayload);
    setDraftLineIds(nextLineIds);
    setSelection({ cartonIndex: Math.max(0, selection.cartonIndex - 1) });
  }

  function updateSelectedCarton(
    field: "pallet" | "carton" | "sku" | "quantity",
    value: string,
    lineIndex = 0,
  ) {
    if (!draftPayload || editorLocked) return;
    const nextPayload = structuredClone(draftPayload);
    const carton = nextPayload.cartons[selection.cartonIndex];
    if (!carton) return;
    if (field === "pallet") carton.sourcePalletNumber = value || null;
    if (field === "carton") {
      carton.sourceCartonNumber = value;
      if ("kind" in carton && carton.kind === "carton") {
        carton.memberCartonNumbers = [value];
      }
    }
    if (field === "sku" && carton.lines[lineIndex]) carton.lines[lineIndex].sku = value;
    if (field === "quantity" && carton.lines[lineIndex]) {
      carton.lines[lineIndex].expectedQuantity = Number(value);
    }
    setDraftPayload(nextPayload);
  }

  function updateSelectedScopeKind(kind: "carton" | "carton_group") {
    if (!draftPayload || draftPayload.schemaVersion !== 3 || editorLocked) return;
    const nextPayload = structuredClone(draftPayload);
    const carton = nextPayload.cartons[selection.cartonIndex];
    if (!carton) return;
    clearDraftErrors();
    if (kind === "carton") {
      carton.kind = "carton";
      carton.physicalCartonCount = 1;
      carton.memberCartonNumbers = [carton.sourceCartonNumber];
    } else {
      carton.kind = "carton_group";
      carton.physicalCartonCount = Math.max(2, carton.physicalCartonCount);
      carton.memberCartonNumbers = Array.from(
        { length: carton.physicalCartonCount },
        (_, index) => carton.memberCartonNumbers[index] ?? "",
      );
    }
    setDraftPayload(nextPayload);
  }

  function updateSelectedPhysicalCartonCount(value: string) {
    if (!draftPayload || draftPayload.schemaVersion !== 3 || editorLocked) return;
    const nextPayload = structuredClone(draftPayload);
    const carton = nextPayload.cartons[selection.cartonIndex];
    if (!carton || carton.kind !== "carton_group") return;
    const nextCount = value === "" ? 0 : Number(value);
    carton.physicalCartonCount = nextCount;
    carton.memberCartonNumbers = Array.from(
      { length: Math.max(0, Number.isSafeInteger(nextCount) ? nextCount : 0) },
      (_, index) => carton.memberCartonNumbers[index] ?? "",
    );
    clearFieldError(packingListFieldKey([
      "cartons",
      selection.cartonIndex,
      "physicalCartonCount",
    ]));
    clearFieldError(packingListFieldKey([
      "cartons",
      selection.cartonIndex,
      "memberCartonNumbers",
    ]));
    setDraftPayload(nextPayload);
  }

  function updateSelectedMemberCarton(memberIndex: number, value: string) {
    if (!draftPayload || draftPayload.schemaVersion !== 3 || editorLocked) return;
    const nextPayload = structuredClone(draftPayload);
    const carton = nextPayload.cartons[selection.cartonIndex];
    if (!carton || carton.kind !== "carton_group" || carton.memberCartonNumbers[memberIndex] === undefined) return;
    carton.memberCartonNumbers[memberIndex] = value;
    clearFieldError(packingListFieldKey([
      "cartons",
      selection.cartonIndex,
      "memberCartonNumbers",
      memberIndex,
    ]));
    clearFieldError(packingListFieldKey([
      "cartons",
      selection.cartonIndex,
      "memberCartonNumbers",
    ]));
    setDraftPayload(nextPayload);
  }

  function updatePhysicalPalletCount(value: string) {
    if (!draftPayload || editorLocked) return;
    clearFieldError("physicalPalletCount");
    setDraftPayload({
      ...draftPayload,
      physicalPalletCount: value === "" ? null : Number(value),
    });
  }

  async function confirmRevision() {
    if (!draftPayload || !shipment || busy || reconciliationRequired) return;
    const mutationShipmentId = shipment.shipmentId;
    if (!pendingRevisionId) {
      const validation = validatePackingListDraft(draftPayload, shipment.productMasterSkus);
      if (!validation.ok) {
        setFieldErrors(validation.fieldErrors);
        setErrorSummary(validation.summary ?? null);
        focusDraftField(validation.firstField);
        return;
      }
    }
    clearDraftErrors();
    setBusy(true);
    let revisionId = pendingRevisionId;
    try {
      if (!revisionId) {
        const createResponse = await fetch(
          `/api/prearrival/shipments/${encodeURIComponent(mutationShipmentId)}/revisions`,
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
        revisionId = created.revision.id;
        setPendingRevisionId(revisionId);
      }

      const confirmResponse = await fetch(
        `/api/prearrival/revisions/${encodeURIComponent(revisionId)}/confirm`,
        {
          method: "POST",
          headers: await buildApiHeaders("partner"),
        },
      );
      const confirmedRevision = (await confirmResponse.json()) as RevisionResponse;
      if (!confirmResponse.ok || !confirmedRevision.ok) {
        setMessage(("message" in confirmedRevision && confirmedRevision.message) || "Packing-list revision could not be confirmed.");
        setErrorSummary("Packing List draft was saved, but confirmation could not be completed. Try Confirm Packing List again.");
        return;
      }

      clearRevisionProgress();
      setDraftPayload(null);
      setDraftLineIds([]);
      await loadShipment(mutationShipmentId);
      setMessage(`Packing List v${confirmedRevision.revision.version} confirmed`);
    } catch {
      if (revisionId) {
        setPendingRevisionId(revisionId);
        setReconciliationRequired(true);
        setErrorSummary("The Packing List confirmation result is unknown. Reload shipment status before trying again.");
        setMessage("Reload shipment status to reconcile the saved Packing List confirmation.");
      } else {
        setReconciliationRequired(true);
        setErrorSummary("The Packing List save result is unknown. Reload shipment status before trying again.");
        setMessage("Reload shipment status before attempting another Packing List save.");
      }
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
  const structureCartons = draftPayload
    ? draftPayload.cartons
    : shipment.cartons.map((carton) => ({
        sourceCartonNumber: carton.sourceCartonNumber,
        sourcePalletNumber: carton.sourcePalletNumber ?? null,
        kind: carton.kind ?? "carton",
        physicalCartonCount: carton.physicalCartonCount ?? 1,
        memberCartonNumbers: carton.memberCartonNumbers?.length
          ? [...carton.memberCartonNumbers]
          : [carton.sourceCartonNumber],
        lines: shipment.lines.filter(
          (line) => line.sourceCartonNumber === carton.sourceCartonNumber,
        ),
      }));
  const mappingSummary = derivePalletMappingSummary({
    physicalPalletCount: draftPayload?.physicalPalletCount ?? shipment.physicalPalletCount ?? null,
    cartons: structureCartons,
  });
  const cartonStructureSummary = deriveCartonStructureSummary({
    schemaVersion: 3,
    shipmentId: shipment.shipmentId,
    physicalPalletCount: draftPayload?.physicalPalletCount ?? shipment.physicalPalletCount ?? null,
    cartons: structureCartons.map((carton) => toV3CartonScope({
      sourceCartonNumber: carton.sourceCartonNumber,
      sourcePalletNumber: carton.sourcePalletNumber,
      kind: "kind" in carton ? carton.kind : "carton",
      physicalCartonCount: "physicalCartonCount" in carton ? carton.physicalCartonCount : 1,
      memberCartonNumbers: "memberCartonNumbers" in carton
        ? carton.memberCartonNumbers
        : [carton.sourceCartonNumber],
      lines: carton.lines,
    })),
  });
  const mappingLabel = {
    not_recorded: "Not recorded",
    partial: "Partial",
    complete: "Complete",
  }[mappingSummary.status];
  const packingListConfirmed = shipment.packingListStatus === "confirmed";
  const palletField = packingListFieldKey(["cartons", selection.cartonIndex, "sourcePalletNumber"]);
  const cartonField = packingListFieldKey([
    "cartons",
    selection.cartonIndex,
    "sourceCartonNumber",
  ]);
  const physicalCartonCountField = packingListFieldKey([
    "cartons",
    selection.cartonIndex,
    "physicalCartonCount",
  ]);
  const membersField = packingListFieldKey([
    "cartons",
    selection.cartonIndex,
    "memberCartonNumbers",
  ]);
  const errorId = (field: string) => `prearrival-error-${field.replace(/\./g, "-")}`;
  const fieldId = (field: string) => `prearrival-field-${field.replace(/\./g, "-")}`;

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
              ? `Packing List v${confirmed?.version ?? shipment.confirmedPackingListVersion ?? 0} / ${mappingSummary.physicalPalletCount ?? "Unknown"} physical pallets / ${cartonStructureSummary.sourceScopeCount} source scopes / ${cartonStructureSummary.physicalCartonCount} physical cartons`
              : `${shipment.packingListStatus === "draft" ? "Draft exists" : "Packing List not started"} / Warehouse locked until confirmation`}</p>
            <select
              aria-label="Shipment"
              disabled={editorLocked}
              value={shipment.shipmentId}
              onChange={(event) => {
                if (!editorLocked) void loadShipment(event.target.value);
              }}
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
                : "Enter the export carton and SKU structure, then confirm the first immutable Packing List to unlock Warehouse. Pallet mapping can be added later."}</p>
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
              <span className="prearrival-section-label">Source carton scopes</span>
              <div className="prearrival-carton-summary" aria-label="Carton structure summary">
                <span>Source scopes <strong>{cartonStructureSummary.sourceScopeCount}</strong></span>
                <span>Physical cartons <strong>{cartonStructureSummary.physicalCartonCount}</strong></span>
                <span>Carton groups <strong>{cartonStructureSummary.cartonGroupCount}</strong></span>
              </div>
              <div className="prearrival-mapping-summary" aria-label="Pallet mapping summary">
                <span>Physical pallets <strong>{mappingSummary.physicalPalletCount ?? "Unknown"}</strong></span>
                <span>Mapped pallets <strong>{mappingSummary.mappedPalletCount || "—"}</strong></span>
                <span>Mapping <strong>{mappingLabel}</strong></span>
              </div>
              {!structureCartons.length ? (
                <div className="prearrival-structure-empty">
                  <Package size={22} weight="duotone" />
                  <p>No carton lines are confirmed for this Shipment.</p>
                </div>
              ) : null}
              {structureCartons.map((carton, cartonIndex) => {
                const quantity = carton.lines.reduce((sum, line) => sum + line.expectedQuantity, 0);
                const isGroup = "kind" in carton && carton.kind === "carton_group";
                const physicalCartonCount = "physicalCartonCount" in carton
                  ? carton.physicalCartonCount
                  : 1;
                const members = "memberCartonNumbers" in carton
                  ? carton.memberCartonNumbers
                  : [carton.sourceCartonNumber];
                return (
                  <div className="prearrival-pallet" key={`${carton.sourceCartonNumber}-${cartonIndex}`}>
                    <button
                      className={selection.cartonIndex === cartonIndex ? "is-selected" : ""}
                      type="button"
                      onClick={() => setSelection({ cartonIndex })}
                    >
                      <strong><CaretRight size={14} />{carton.sourceCartonNumber || `New source scope ${cartonIndex + 1}`}{isGroup ? <b className="prearrival-scope-badge">Group</b> : null}</strong>
                      <span>{physicalCartonCount} physical {physicalCartonCount === 1 ? "carton" : "cartons"} · {quantity} units</span>
                      {isGroup ? <small>{members.filter(Boolean).join(", ") || "Member cartons pending"}</small> : null}
                    </button>
                  </div>
                );
              })}
              {draftPayload ? (
                <div className="prearrival-structure-actions" aria-label="Packing List structure actions">
                  <button className="secondary-button" type="button" onClick={addCarton} disabled={editorLocked}><Plus size={15} />Add source scope</button>
                  <button className="prearrival-remove-button" type="button" onClick={removeSelectedCarton} disabled={editorLocked || draftPayload.cartons.length <= 1}><Trash size={14} />Remove source scope</button>
                </div>
              ) : null}
              <div className="prearrival-phase-copy"><span>Export label position</span><p>No DriveMate label is required in China. Australian printing is prepared from this data.</p></div>
            </section>

            <section className="prearrival-detail" id="shipment-contents">
              <div className="prearrival-detail-heading">
                <div>
                  <h2>{selectedCarton
                    ? `Source scope ${selectedCarton.sourceCartonNumber || "working copy"} expected contents`
                    : "Packing List contents"}</h2>
                  <p>{packingListConfirmed
                    ? "The selected source scope determines Australian label quantities and receipt validation."
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
                  ? <button className="secondary-button" type="button" onClick={startRevision} disabled={editorLocked}>Create revision</button>
                  : !draftPayload
                    ? <button className="secondary-button" type="button" onClick={startRevision} disabled={editorLocked}>Open working copy</button>
                    : null}
              </div>

              {draftPayload && selectedCarton?.draftCarton ? (
                <section className="prearrival-editor" aria-label="Packing list revision editor">
                  <h3>{packingListConfirmed ? "Working revision" : "First Packing List working copy"}</h3>
                  <p>{packingListConfirmed
                    ? "Confirming this copy creates a new immutable version. The existing confirmed record remains unchanged."
                    : "Build the complete export structure here. Confirmation creates immutable Packing List v1 and unlocks Warehouse."}</p>
                  {errorSummary ? <div className="prearrival-error-summary" role="alert">{errorSummary}</div> : null}
                  {pendingRevisionId ? <p className="prearrival-message">Packing List draft saved. Editing is locked until confirmation, correction or reload.</p> : null}
                  {pendingRevisionId && !reconciliationRequired ? <button className="secondary-button" type="button" onClick={startCorrectedRevision} disabled={busy}>Start corrected revision</button> : null}
                  {pendingRevisionId || reconciliationRequired ? <button className="secondary-button prearrival-reconcile" type="button" onClick={() => void loadShipment(shipment.shipmentId)} disabled={busy}>Reload shipment status</button> : null}
                  <div className="prearrival-editor-grid">
                    <div className="prearrival-field"><label htmlFor="physical-pallet-count">Physical pallets <span>Optional</span></label><input id="physical-pallet-count" ref={(element) => { fieldRefs.current.physicalPalletCount = element; }} aria-invalid={Boolean(fieldErrors.physicalPalletCount)} aria-describedby={fieldErrors.physicalPalletCount ? errorId("physicalPalletCount") : undefined} disabled={editorLocked} min="1" type="number" value={draftPayload.physicalPalletCount ?? ""} onChange={(event) => updatePhysicalPalletCount(event.target.value)} />{fieldErrors.physicalPalletCount ? <span className="prearrival-field-error" id={errorId("physicalPalletCount")}>{fieldErrors.physicalPalletCount}</span> : null}</div>
                    <div className="prearrival-field"><label htmlFor={fieldId(palletField)}>Pallet number <span>Optional</span></label><input id={fieldId(palletField)} ref={(element) => { fieldRefs.current[palletField] = element; }} aria-invalid={Boolean(fieldErrors[palletField])} aria-describedby={fieldErrors[palletField] ? errorId(palletField) : undefined} disabled={editorLocked} placeholder="Not recorded" value={selectedCarton.draftCarton.sourcePalletNumber ?? ""} onChange={(event) => { clearFieldError(palletField); updateSelectedCarton("pallet", event.target.value); }} />{fieldErrors[palletField] ? <span className="prearrival-field-error" id={errorId(palletField)}>{fieldErrors[palletField]}</span> : null}</div>
                    {"kind" in selectedCarton.draftCarton ? <div className="prearrival-field"><label htmlFor={fieldId(`cartons.${selection.cartonIndex}.kind`)}>Scope type</label><select id={fieldId(`cartons.${selection.cartonIndex}.kind`)} aria-label="Scope type" disabled={editorLocked} value={selectedCarton.draftCarton.kind} onChange={(event) => updateSelectedScopeKind(event.target.value as "carton" | "carton_group")}><option value="carton">Single carton</option><option value="carton_group">Carton group</option></select></div> : null}
                    <div className="prearrival-field"><label htmlFor={fieldId(cartonField)}>Source scope number</label><input id={fieldId(cartonField)} ref={(element) => { fieldRefs.current[cartonField] = element; }} aria-invalid={Boolean(fieldErrors[cartonField])} aria-describedby={fieldErrors[cartonField] ? errorId(cartonField) : undefined} disabled={editorLocked} value={selectedCarton.draftCarton.sourceCartonNumber} onChange={(event) => { clearFieldError(cartonField); updateSelectedCarton("carton", event.target.value); }} />{fieldErrors[cartonField] ? <span className="prearrival-field-error" id={errorId(cartonField)}>{fieldErrors[cartonField]}</span> : null}</div>
                    {"kind" in selectedCarton.draftCarton ? <div className="prearrival-field"><label htmlFor={fieldId(physicalCartonCountField)}>Physical cartons</label><input id={fieldId(physicalCartonCountField)} ref={(element) => { fieldRefs.current[physicalCartonCountField] = element; }} aria-invalid={Boolean(fieldErrors[physicalCartonCountField])} aria-describedby={fieldErrors[physicalCartonCountField] ? errorId(physicalCartonCountField) : undefined} disabled={editorLocked || selectedCarton.draftCarton.kind === "carton"} min={selectedCarton.draftCarton.kind === "carton_group" ? 2 : 1} type="number" value={selectedCarton.draftCarton.physicalCartonCount} onChange={(event) => updateSelectedPhysicalCartonCount(event.target.value)} />{fieldErrors[physicalCartonCountField] ? <span className="prearrival-field-error" id={errorId(physicalCartonCountField)}>{fieldErrors[physicalCartonCountField]}</span> : null}</div> : null}
                    {"kind" in selectedCarton.draftCarton && selectedCarton.draftCarton.kind === "carton_group" ? <fieldset className="prearrival-member-editor"><legend>Member carton numbers</legend><p>Each physical carton can locate this source group. Operational records still use the source scope number above.</p>{fieldErrors[membersField] ? <span className="prearrival-field-error" id={errorId(membersField)}>{fieldErrors[membersField]}</span> : null}<div>{selectedCarton.draftCarton.memberCartonNumbers.map((member, memberIndex) => { const memberField = packingListFieldKey(["cartons", selection.cartonIndex, "memberCartonNumbers", memberIndex]); return <div className="prearrival-field" key={memberField}><label htmlFor={fieldId(memberField)}>Member carton {memberIndex + 1}</label><input id={fieldId(memberField)} ref={(element) => { fieldRefs.current[memberField] = element; }} aria-invalid={Boolean(fieldErrors[memberField])} aria-describedby={fieldErrors[memberField] ? errorId(memberField) : undefined} disabled={editorLocked} value={member} onChange={(event) => updateSelectedMemberCarton(memberIndex, event.target.value)} />{fieldErrors[memberField] ? <span className="prearrival-field-error" id={errorId(memberField)}>{fieldErrors[memberField]}</span> : null}</div>; })}</div></fieldset> : null}
                    {selectedCarton.draftCarton.lines.map((line, lineIndex) => {
                      const skuField = packingListFieldKey(["cartons", selection.cartonIndex, "lines", lineIndex, "sku"]);
                      const quantityField = packingListFieldKey(["cartons", selection.cartonIndex, "lines", lineIndex, "expectedQuantity"]);
                      const lineClientId = draftLineIds[selection.cartonIndex]?.[lineIndex];
                      if (!lineClientId) return null;
                      return (
                        <div className="prearrival-line-editor" key={lineClientId}>
                          <div className="prearrival-field"><label htmlFor={fieldId(skuField)}>{lineIndex === 0 ? "SKU" : `SKU ${lineIndex + 1}`}</label><input id={fieldId(skuField)} ref={(element) => { fieldRefs.current[skuField] = element; }} aria-invalid={Boolean(fieldErrors[skuField])} aria-describedby={fieldErrors[skuField] ? errorId(skuField) : undefined} disabled={editorLocked} value={line.sku} onChange={(event) => { clearFieldError(skuField); updateSelectedCarton("sku", event.target.value, lineIndex); }} />{fieldErrors[skuField] ? <span className="prearrival-field-error" id={errorId(skuField)}>{fieldErrors[skuField]}</span> : null}</div>
                          <div className="prearrival-field"><label htmlFor={fieldId(quantityField)}>{lineIndex === 0 ? "Expected quantity" : `Expected quantity ${lineIndex + 1}`}</label><input id={fieldId(quantityField)} ref={(element) => { fieldRefs.current[quantityField] = element; }} aria-invalid={Boolean(fieldErrors[quantityField])} aria-describedby={fieldErrors[quantityField] ? errorId(quantityField) : undefined} disabled={editorLocked} min="1" type="number" value={line.expectedQuantity} onChange={(event) => { clearFieldError(quantityField); updateSelectedCarton("quantity", event.target.value, lineIndex); }} />{fieldErrors[quantityField] ? <span className="prearrival-field-error" id={errorId(quantityField)}>{fieldErrors[quantityField]}</span> : null}</div>
                          {lineIndex > 0 ? <button className="prearrival-remove-button" type="button" aria-label={`Remove SKU line ${lineIndex + 1}`} onClick={() => removeSkuLine(lineIndex)} disabled={editorLocked}><Trash size={14} />Remove line</button> : null}
                        </div>
                      );
                    })}
                  </div>
                  <button className="secondary-button prearrival-add-line" type="button" onClick={addSkuLine} disabled={editorLocked}><Plus size={15} />Add SKU line</button>
                  <div className="prearrival-editor-actions"><button className="button button-primary" type="button" onClick={() => void confirmRevision()} disabled={busy || reconciliationRequired}>{busy ? "Confirming..." : "Confirm Packing List"}</button><button className="button button-secondary" type="button" onClick={cancelWorkingCopy} disabled={editorLocked}>Cancel working copy</button></div>
                </section>
              ) : null}

              {activeLines.length ? (
                <div className="prearrival-table-shell">
                  <table>
                    <thead><tr><th>SKU</th><th>Product barcode</th><th>Expected qty</th><th>Label preparation</th></tr></thead>
                    <tbody>{activeLines.map((line, lineIndex) => <tr key={`active-line-${lineIndex}`}><td data-label="SKU"><code>{line.sku || "Pending"}</code></td><td data-label="Product barcode"><code>{shipment.productBarcodes[line.sku] ?? "Not assigned"}</code></td><td data-label="Expected qty"><strong>{line.expectedQuantity}</strong></td><td data-label="Label preparation"><strong className="prearrival-ready">{line.sku ? `${line.expectedQuantity} Ready` : "Pending"}</strong></td></tr>)}</tbody>
                  </table>
                </div>
              ) : (
                <div className="prearrival-lines-empty">
                  <ClipboardText size={22} weight="duotone" />
                  <div><strong>No SKU lines are available until a working copy is opened.</strong><p>Use Create first Packing List to enter the export structure for this Shipment.</p></div>
                </div>
              )}

              <div className="prearrival-validation"><span>Validation before export confirmation</span><strong>Every source scope needs a unique number, recognised SKU and positive expected quantity. Carton groups also require one unique member number per physical carton. Pallet mapping is optional and can be revised later.</strong></div>
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
