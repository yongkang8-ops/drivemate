"use client";

import Link from "./StableLink";
import { WorkspaceNavigation } from "./WorkspaceNavigation";
import { PaginatedTable } from "./PaginatedTable";
import { useListFilters } from "../hooks/useListFilters";
import { confirmDiscardChanges, useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { WarehouseLocationLabel as LocationLabel } from "./WarehouseLocationLabel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildApiHeaders } from "../lib/clientAuth";
import { useSensitiveFetch } from "./MfaStepUpProvider";
import { parseLocationCodeBatch } from "../lib/inventoryLocations";
import type {
  InventoryLocation,
  InventoryLocationLatestLabelJob,
  InventoryLocationStatus,
  WarehouseLabelPrintItem,
  WarehouseLabelPrintJob,
} from "../lib/repository";

type LocationRecord = InventoryLocation & {
  latestLabelJob?: InventoryLocationLatestLabelJob | null;
};

type LocationSummary = {
  activePhysicalLocations: number;
  disabledOrArchivedLocations: number;
  locationsHoldingStock: number;
  pendingLocationLabelPrintJobs: number;
};

type ActivePrintJob = {
  job: WarehouseLabelPrintJob;
  items: WarehouseLabelPrintItem[];
};

type ApiFailure = { ok?: false; message?: string; error?: { formErrors?: string[] } };

function apiMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const candidate = body as ApiFailure;
  if (typeof candidate.message === "string" && candidate.message) return candidate.message;
  const formError = candidate.error?.formErrors?.find(Boolean);
  return formError || fallback;
}

function isLocationItemSnapshot(snapshot: Record<string, unknown>): snapshot is Record<string, unknown> & {
  locationCode: string;
  barcode: string;
} {
  return typeof snapshot.locationCode === "string" && typeof snapshot.barcode === "string";
}

function snapshotLocations(items: WarehouseLabelPrintItem[]) {
  return items.flatMap((item) => isLocationItemSnapshot(item.payloadSnapshot)
    ? [{ locationCode: item.payloadSnapshot.locationCode, barcode: item.payloadSnapshot.barcode }]
    : []);
}

function statusLabel(status: InventoryLocationStatus) {
  return status === "active" ? "Active" : status === "disabled" ? "Disabled" : "Archived";
}

export function InventoryLocationPanel() {
  const sensitiveFetch = useSensitiveFetch();
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [summary, setSummary] = useState<LocationSummary | null>(null);
  const [batch, setBatch] = useState("");
  const [previewedBatch, setPreviewedBatch] = useState("");
  const [previewedLocations, setPreviewedLocations] = useState<Array<{ locationCode: string; barcode: string }>>([]);
  const [listFilters, setListFilter] = useListFilters({ locationStatus: "all", locationSearch: "" }, "locations", { locationStatus: ["all", "active", "disabled", "archived"] });
  const locationStatus = listFilters.locationStatus;
  const search = listFilters.locationSearch;
  const setLocationStatus = (value: string) => setListFilter("locationStatus", value);
  const setSearch = (value: string) => setListFilter("locationSearch", value);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [labelPreview, setLabelPreview] = useState<Array<{ locationCode: string; barcode: string }>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editorRef = useRef<HTMLElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  const [editRequest, setEditRequest] = useState(0);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [activePrint, setActivePrint] = useState<ActivePrintJob | null>(null);
  const [selectedReprintItemIds, setSelectedReprintItemIds] = useState<string[]>([]);
  const [reprintReason, setReprintReason] = useState("");
  const [message, setMessage] = useState("Loading saved location register.");
  const [busy, setBusy] = useState(false);

  const loadLocations = useCallback(async (announce = true) => {
    try {
      const response = await fetch("/api/inventory/locations", {
        cache: "no-store",
        headers: await buildApiHeaders("partner"),
      });
      const body = await response.json() as { ok?: boolean; locations?: LocationRecord[]; summary?: LocationSummary } & ApiFailure;
      if (!response.ok || !body.ok || !body.locations || !body.summary) {
        setMessage(apiMessage(body, "Location register could not be loaded."));
        return;
      }
      setLocations(body.locations);
      setSummary(body.summary);
      setSelectedIds((current) => current.filter((id) => body.locations?.some((location) => location.id === id)));
      if (announce) setMessage("Saved location register loaded.");
    } catch {
      setMessage("Location register could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  const filteredLocations = useMemo(() => {
    const query = search.trim().toUpperCase();
    return locations.filter((location) => {
      if (locationStatus !== "all" && location.status !== locationStatus) return false;
      if (!query) return true;
      return [location.locationCode, location.barcode, location.physicalDescription, location.notes]
        .some((value) => value?.toUpperCase().includes(query));
    });
  }, [locationStatus, locations, search]);

  const selectedLocations = locations.filter((location) => selectedIds.includes(location.id)
    && location.status === "active" && location.isPutawayDestination);
  const editingLocation = locations.find((location) => location.id === editingId) ?? null;
  const editorDirty = Boolean(editingLocation && (description !== (editingLocation.physicalDescription ?? "") || notes !== (editingLocation.notes ?? "")));
  useUnsavedChanges(editorDirty || Boolean(batch.trim()) || busy);
  const hasFreshBatchPreview = previewedLocations.length > 0 && previewedBatch === batch;

  function previewBatch() {
    const parsed = parseLocationCodeBatch(batch);
    if (!parsed.ok || !parsed.locations.length) {
      setPreviewedLocations([]);
      setPreviewedBatch("");
      setMessage(parsed.ok ? "Enter at least one canonical BNE location code." : parsed.message);
      return;
    }
    setPreviewedLocations(parsed.locations.map((location) => ({
      locationCode: location.locationCode,
      barcode: location.barcode,
    })));
    setPreviewedBatch(batch);
    setMessage("Exact code and DMLOC preview ready. Create locations to save this reviewed batch.");
  }

  async function createLocations() {
    if (!hasFreshBatchPreview) {
      setMessage("Preview exact codes before creating locations.");
      return;
    }
    setBusy(true);
    try {
      const response = await sensitiveFetch("/api/inventory/locations", {
        method: "POST",
        headers: await buildApiHeaders("partner", { "Content-Type": "application/json" }),
        body: JSON.stringify({ locationCodes: previewedLocations.map((location) => location.locationCode) }),
      });
      const body = await response.json() as { ok?: boolean; locations?: LocationRecord[] } & ApiFailure;
      if (!response.ok || !body.ok) {
        setMessage(apiMessage(body, "Locations could not be created."));
        return;
      }
      setBatch("");
      setPreviewedBatch("");
      setPreviewedLocations([]);
      setMessage(`${body.locations?.length ?? 0} physical location${body.locations?.length === 1 ? "" : "s"} created.`);
      await loadLocations(false);
    } catch {
      setMessage("Locations could not be created.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!editRequest || !editingId) return;
    descriptionRef.current?.focus({ preventScroll: true });
    editorRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [editRequest, editingId]);

  function startEdit(location: LocationRecord, trigger: HTMLButtonElement) {
    if (!confirmDiscardChanges(editorDirty)) return;
    editTrigger.current = trigger;
    setEditingId(location.id);
    setDescription(location.physicalDescription ?? "");
    setNotes(location.notes ?? "");
    setEditRequest((current) => current + 1);
  }

  function closeEditor() {
    if (!confirmDiscardChanges(editorDirty)) return;
    setEditingId(null);
    editTrigger.current?.focus({ preventScroll: true });
    editTrigger.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }

  async function saveNotes() {
    if (!editingLocation) return;
    setBusy(true);
    try {
      const response = await sensitiveFetch(`/api/inventory/locations/${encodeURIComponent(editingLocation.id)}`, {
        method: "PATCH",
        headers: await buildApiHeaders("partner", { "Content-Type": "application/json" }),
        body: JSON.stringify({
          physicalDescription: description.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const body = await response.json() as { ok?: boolean } & ApiFailure;
      if (!response.ok || !body.ok) {
        setMessage(apiMessage(body, "Location notes could not be saved."));
        return;
      }
      setEditingId(null);
      setMessage("Location notes saved. Location code and barcode were not changed.");
      await loadLocations(false);
    } catch {
      setMessage("Location notes could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(location: LocationRecord, status: InventoryLocationStatus) {
    setBusy(true);
    try {
      const response = await sensitiveFetch(`/api/inventory/locations/${encodeURIComponent(location.id)}/status`, {
        method: "POST",
        headers: await buildApiHeaders("partner", { "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      });
      const body = await response.json() as { ok?: boolean } & ApiFailure;
      if (!response.ok || !body.ok) {
        setMessage(apiMessage(body, "Location status could not be updated."));
        return;
      }
      setMessage(`${location.locationCode} is now ${statusLabel(status).toLowerCase()}.`);
      await loadLocations(false);
    } catch {
      setMessage("Location status could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelection(location: LocationRecord, checked: boolean) {
    setSelectedIds((current) => checked
      ? [...new Set([...current, location.id])]
      : current.filter((id) => id !== location.id));
  }

  function previewLocationLabels() {
    if (!selectedLocations.length) {
      setMessage("Select active physical locations before previewing labels.");
      return;
    }
    setLabelPreview(selectedLocations.map((location) => ({
      locationCode: location.locationCode,
      barcode: location.barcode,
    })));
    setMessage(`${selectedLocations.length} exact 100 × 50 mm bin label${selectedLocations.length === 1 ? "" : "s"} ready for print review.`);
  }

  async function createPrintJob() {
    if (!selectedLocations.length) {
      setMessage("Select active physical locations before printing.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/inventory/locations/print", {
        method: "POST",
        headers: await buildApiHeaders("partner", { "Content-Type": "application/json" }),
        body: JSON.stringify({ locationIds: selectedLocations.map((location) => location.id) }),
      });
      const body = await response.json() as ({ ok?: boolean; job?: WarehouseLabelPrintJob; items?: WarehouseLabelPrintItem[] } & ApiFailure);
      if (!response.ok || !body.ok || !body.job || !body.items) {
        setMessage(apiMessage(body, "Location label print job could not be created."));
        return;
      }
      setActivePrint({ job: body.job, items: body.items });
      setLabelPreview(snapshotLocations(body.items));
      setSelectedReprintItemIds([]);
      setReprintReason("");
      setMessage("Location label print job created. Print the shown sheets, then confirm the physical result.");
      await loadLocations(false);
      window.print();
    } catch {
      setMessage("Location label print job could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function recordPrintOutcome(outcome: "printed" | "cancelled") {
    if (!activePrint) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/warehouse/labels/${encodeURIComponent(activePrint.job.id)}`, {
        method: "POST",
        headers: await buildApiHeaders("partner", { "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "outcome", outcome }),
      });
      const body = await response.json() as ({ ok?: boolean; job?: WarehouseLabelPrintJob } & ApiFailure);
      if (!response.ok || !body.ok || !body.job) {
        setMessage(apiMessage(body, "Print outcome could not be recorded."));
        return;
      }
      setActivePrint((current) => current ? { ...current, job: body.job! } : null);
      setMessage(outcome === "printed" ? "Printed confirmation recorded" : "Print cancelled");
      await loadLocations(false);
    } catch {
      setMessage("Print outcome could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  function toggleReprintItem(itemId: string, checked: boolean) {
    setSelectedReprintItemIds((current) => checked
      ? [...new Set([...current, itemId])]
      : current.filter((id) => id !== itemId));
  }

  async function createReprint() {
    if (!activePrint || !selectedReprintItemIds.length || !reprintReason.trim()) {
      setMessage("Select at least one original label and enter a reprint reason.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/warehouse/labels/${encodeURIComponent(activePrint.job.id)}`, {
        method: "POST",
        headers: await buildApiHeaders("partner", { "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "reprint",
          itemIds: selectedReprintItemIds,
          reason: reprintReason.trim(),
        }),
      });
      const body = await response.json() as ({ ok?: boolean; job?: WarehouseLabelPrintJob; items?: WarehouseLabelPrintItem[] } & ApiFailure);
      if (!response.ok || !body.ok || !body.job || !body.items) {
        setMessage(apiMessage(body, "Reprint job could not be created."));
        return;
      }
      setActivePrint({ job: body.job, items: body.items });
      setLabelPreview(snapshotLocations(body.items));
      setSelectedReprintItemIds([]);
      setReprintReason("");
      setMessage("Reprint job created. Print the shown sheets, then confirm the physical result.");
      await loadLocations(false);
      window.print();
    } catch {
      setMessage("Reprint job could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="inventory-location-app" aria-label="Inventory location workspace">
      <aside className="inventory-location-sidebar">
        <div className="inventory-location-brand">
          <img src="/assets/brand/DriveMate_Parts_Primary_Lockup_v2.0.svg" alt="DriveMate Parts" />
          <p>Partner workspace</p>
          <span>Physical location control</span>
        </div>
        <WorkspaceNavigation current="/inventory" className="inventory-location-nav" label="Partner operations navigation" />
        <div className="inventory-location-boundary">
          <span>Location boundary</span>
          <p>Physical BNE bins are maintained here. Receiving staging remains a system source and cannot be printed or selected for putaway.</p>
        </div>
      </aside>

      <div className="inventory-location-content">
        <header className="inventory-location-topbar">
          <div>
            <span>Partner operations</span>
            <h1>Location management</h1>
          </div>
          <b aria-label="Partner access">P</b>
        </header>

        <main className="inventory-location-main">
          <section className="inventory-location-intro">
            <div>
              <h2>Physical bins, labels and print audit</h2>
              <p>Maintain only real Brisbane bin destinations. BNE-RECEIVING-STAGING is retained below as a protected system source.</p>
            </div>
            <p role="status" aria-live="polite">{message}</p>
          </section>

          <section className="inventory-location-metrics" aria-label="Location summary">
            <article><span>Active physical locations</span><strong>{summary?.activePhysicalLocations ?? "–"}</strong><p>Available as putaway destinations</p></article>
            <article><span>Disabled/archived</span><strong>{summary?.disabledOrArchivedLocations ?? "–"}</strong><p>Physical labels kept out of selection</p></article>
            <article><span>Pending print confirmation</span><strong>{summary?.pendingLocationLabelPrintJobs ?? "–"}</strong><p>Saved bin-label jobs awaiting confirmation</p></article>
            <article><span>Locations holding stock</span><strong>{summary?.locationsHoldingStock ?? "–"}</strong><p>All saved locations with a recorded balance</p></article>
          </section>

          <section className="inventory-location-create-panel" aria-labelledby="location-create-heading">
            <div>
              <span>Controlled batch creation</span>
              <h2 id="location-create-heading">Create physical locations</h2>
              <p>One canonical BNE code per line. Preview locks the exact code and its immutable DMLOC barcode before saving.</p>
            </div>
            <div className="inventory-location-create-form">
              <label>
                Location code batch
                <textarea aria-label="Location code batch" value={batch} onChange={(event) => {
                  setBatch(event.target.value);
                  setPreviewedBatch("");
                  setPreviewedLocations([]);
                }} placeholder={"BNE-A01-03\nBNE-A01-04"} />
              </label>
              <div className="inventory-location-create-actions">
                <button className="button button-secondary" type="button" disabled={busy || !batch.trim()} onClick={previewBatch}>Preview exact codes</button>
                <button className="button button-primary" type="button" disabled={busy || !hasFreshBatchPreview} onClick={() => void createLocations()}>Create locations</button>
              </div>
            </div>
            {previewedLocations.length ? (
              <div className="inventory-location-batch-preview" aria-label="Exact location code preview">
                {previewedLocations.map((location) => <div key={location.locationCode}><code>{location.locationCode}</code><code>{location.barcode}</code></div>)}
              </div>
            ) : null}
          </section>

          <section className="inventory-location-register-panel" aria-labelledby="location-register-heading">
            <div className="inventory-location-panel-heading">
              <div><span>Saved location master</span><h2 id="location-register-heading">Location register</h2></div>
              <div className="inventory-location-filter-controls">
                <label>Location status<select aria-label="Location status" value={locationStatus} onChange={(event) => setLocationStatus(event.target.value as "all" | InventoryLocationStatus)}><option value="all">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option><option value="archived">Archived</option></select></label>
                <label>Search locations<input aria-label="Search locations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Code, DMLOC or note" /></label>
              </div>
            </div>

            <div className="inventory-location-table-shell">
              <PaginatedTable id="locations" label="Location register" total={filteredLocations.length}>
                <thead><tr><th scope="col">Print</th><th scope="col">Code</th><th scope="col">Physical description</th><th scope="col">Status</th><th scope="col">Balance</th><th scope="col">Label state</th><th scope="col">Actions</th></tr></thead>
                <tbody>
                  {filteredLocations.map((location) => {
                    const selectable = location.status === "active" && location.isPutawayDestination;
                    const isSystemSource = !location.isPutawayDestination;
                    return (
                      <tr key={location.id} className={isSystemSource ? "is-system-source" : ""}>
                        <td data-label="Print"><input type="checkbox" aria-label={`Select ${location.locationCode}`} checked={selectedIds.includes(location.id)} disabled={!selectable} onChange={(event) => toggleSelection(location, event.target.checked)} /></td>
                        <td data-label="Code"><code>{location.locationCode}</code><small>{location.barcode}</small></td>
                        <td data-label="Physical description"><span>{location.physicalDescription || (isSystemSource ? "System receiving staging source" : "Not described")}</span><small>{location.notes || (isSystemSource ? "Not a physical label or putaway destination" : "No notes")}</small></td>
                        <td data-label="Status"><b className={`inventory-location-status is-${location.status}`}>{statusLabel(location.status)}</b></td>
                        <td data-label="Balance"><span>{location.currentBalance}</span></td>
                        <td data-label="Label state">{isSystemSource ? <span className="inventory-location-label-state is-muted">System source only</span> : location.latestLabelJob ? <span className={`inventory-location-label-state is-${location.latestLabelJob.status}`}>{location.latestLabelJob.status === "printed" ? "Printed" : location.latestLabelJob.status === "pending" ? "Awaiting confirmation" : "Cancelled"}</span> : selectable ? <span className="inventory-location-label-state">Not printed</span> : <span className="inventory-location-label-state is-muted">Not printable</span>}</td>
                        <td data-label="Actions"><div className="inventory-location-row-actions">
                          {!isSystemSource ? <button type="button" onClick={(event) => startEdit(location, event.currentTarget)}>Edit {location.locationCode}</button> : null}
                          {!isSystemSource && location.status === "active" ? <><button type="button" disabled={busy} onClick={() => void updateStatus(location, "disabled")}>Disable when empty</button><button type="button" disabled={busy} onClick={() => void updateStatus(location, "archived")}>Archive when empty</button></> : null}
                          {!isSystemSource && location.status !== "active" ? <button type="button" disabled={busy} onClick={() => void updateStatus(location, "active")}>Reactivate</button> : null}
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </PaginatedTable>
              {!filteredLocations.length ? <p className="inventory-location-empty">No saved location matches this filter.</p> : null}
            </div>

            <div className="inventory-location-print-actions">
              <div><strong>{selectedLocations.length} active physical location{selectedLocations.length === 1 ? "" : "s"} selected</strong><span>Only active physical putaway destinations can enter a bin label job.</span></div>
              <div><button className="button button-secondary" type="button" disabled={!selectedLocations.length} onClick={previewLocationLabels}>Preview location labels</button><button className="button button-primary" type="button" disabled={busy || !selectedLocations.length || !labelPreview.length} onClick={() => void createPrintJob()}>Print location labels</button></div>
            </div>
          </section>

          {editingLocation ? <section ref={editorRef} className="inventory-location-editor" aria-labelledby="location-editor-heading">
            <div><span>Notes-only editor</span><h2 id="location-editor-heading">Edit {editingLocation.locationCode}</h2><p>Location code and barcode stay immutable.</p></div>
            <label>Physical description for {editingLocation.locationCode}<input ref={descriptionRef} aria-label={`Physical description for ${editingLocation.locationCode}`} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <label>Notes for {editingLocation.locationCode}<textarea aria-label={`Notes for ${editingLocation.locationCode}`} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            <div><button className="button button-secondary" type="button" onClick={closeEditor}>Close editor</button><button className="button button-primary" type="button" disabled={busy} onClick={() => void saveNotes()}>Save location notes</button></div>
          </section> : null}

          {labelPreview.length ? <section className="inventory-location-print-preview" aria-labelledby="location-label-preview-heading">
            <div className="inventory-location-panel-heading"><div><span>100 × 50 mm print layout</span><h2 id="location-label-preview-heading">Location label preview</h2></div><p>Every selected location has its own print sheet.</p></div>
            <div className="inventory-location-print-sheets">{labelPreview.map((location) => <div className="inventory-location-print-sheet" key={`${location.locationCode}-${location.barcode}`}><LocationLabel {...location} /></div>)}</div>
          </section> : null}

          {activePrint ? <section className="inventory-location-audit-panel" aria-labelledby="location-print-audit-heading">
            <div><span>Print audit</span><h2 id="location-print-audit-heading">{activePrint.job.status === "pending" ? "Awaiting physical confirmation" : activePrint.job.status === "printed" ? "Printed confirmation recorded" : "Print cancelled"}</h2><code aria-label="Location print job ID">{activePrint.job.id}</code></div>
            {activePrint.job.status === "pending" ? <div className="inventory-location-audit-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => void recordPrintOutcome("cancelled")}>Cancel print</button><button className="button button-primary" type="button" disabled={busy} onClick={() => void recordPrintOutcome("printed")}>Confirm printed</button></div> : null}
            {activePrint.job.status === "printed" ? <div className="inventory-location-reprint">
              <div><strong>Reprint selected labels</strong><p>Select the exact original label item(s), then record why a new print is required.</p></div>
              <div className="inventory-location-reprint-items">{activePrint.items.map((item) => {
                const snapshot = isLocationItemSnapshot(item.payloadSnapshot) ? item.payloadSnapshot : null;
                if (!snapshot) return null;
                return <label key={item.id}><input type="checkbox" aria-label={`Reprint label ${snapshot.locationCode}`} checked={selectedReprintItemIds.includes(item.id)} onChange={(event) => toggleReprintItem(item.id, event.target.checked)} />{snapshot.locationCode}</label>;
              })}</div>
              <label>Reprint reason<input aria-label="Reprint reason" value={reprintReason} onChange={(event) => setReprintReason(event.target.value)} placeholder="Reason is required" /></label>
              <button className="button button-secondary" type="button" disabled={busy || !selectedReprintItemIds.length || !reprintReason.trim()} onClick={() => void createReprint()}>Reprint selected labels</button>
            </div> : null}
          </section> : null}
        </main>
      </div>
    </section>
  );
}
