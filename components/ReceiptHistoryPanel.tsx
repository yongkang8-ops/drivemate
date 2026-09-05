"use client";

import { ArrowClockwise, FunnelSimple, ListMagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { buildApiHeaders } from "../lib/clientAuth";
import {
  summarizeWarehouseHistoryScope,
  type WarehouseHistorySourceScope,
} from "../lib/warehouseHistory";

type HistoryRow = {
  id: string;
  date: string;
  time: string;
  timeZone: "Australia/Brisbane" | "Asia/Shanghai";
  action: string;
  actionLabel: string;
  actor?: string;
  reference: string;
  outcome: string;
};

type HistoryResponse =
  | { ok: true; rows: HistoryRow[] }
  | { ok: false; message?: string };

type ReceiptHistoryPanelProps = {
  selection: { shipmentId: string; cartonNumbers: string[] };
  sourceCartons?: WarehouseHistorySourceScope[];
};

export function ReceiptHistoryPanel({ selection, sourceCartons = [] }: ReceiptHistoryPanelProps) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [action, setAction] = useState("");
  const [timeZone, setTimeZone] = useState<HistoryRow["timeZone"]>("Australia/Brisbane");
  const sourceScopes = [...new Set(selection.cartonNumbers)].sort();
  const scopeKey = JSON.stringify([selection.shipmentId, sourceScopes]);
  const defaultCarton = sourceScopes.length === 1 ? sourceScopes[0] : "";
  const [scopeFilter, setScopeFilter] = useState({ key: scopeKey, value: defaultCarton });
  const cartonNumber = scopeFilter.key === scopeKey ? scopeFilter.value : defaultCarton;
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string; rows: HistoryRow[]; status: "loading" | "ready" | "empty" | "error"; message: string;
  }>({ key: "", rows: [], status: "loading", message: "Loading immutable warehouse audit records." });

  useEffect(() => {
    setScopeFilter({ key: scopeKey, value: defaultCarton });
  }, [scopeKey, defaultCarton]);

  const params = new URLSearchParams({ shipmentId: selection.shipmentId, timeZone });
  sourceScopes.forEach(scope => params.append("sourceScope", scope));
  if (cartonNumber) params.set("cartonNumber", cartonNumber);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (action) params.set("action", action);
  const url = `/api/warehouse/history?${params.toString()}`;
  const requestKey = JSON.stringify([url, retry]);
  const invalidDate = [from, to].some(value => value && (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  ));
  const validationError = invalidDate ? "Enter a valid date in YYYY-MM-DD format."
    : from && to && from > to ? "Date from must be before or equal to date to." : "";
  const current = validationError ? { rows: [], status: "error", message: validationError }
    : result.key === requestKey ? result
      : { rows: [], status: "loading", message: "Loading immutable warehouse audit records." };
  const { rows, message } = current;
  const busy = current.status === "loading";
  const scopeSummary = summarizeWarehouseHistoryScope({
    cartons: sourceCartons,
    selectedSourceScopes: cartonNumber ? [cartonNumber] : sourceScopes,
  });

  useEffect(() => {
    if (validationError) return;
    const controller = new AbortController();
    let active = true;
    setResult({ key: requestKey, rows: [], status: "loading", message: "Loading immutable warehouse audit records." });
    void (async () => {
      try {
        const headers = await buildApiHeaders("warehouse_staff");
        if (!active) return;
        const response = await fetch(url, { cache: "no-store", headers, signal: controller.signal });
        const body = (await response.json()) as HistoryResponse;
        if (!active) return;
        if (!response.ok || !body.ok) {
          setResult({ key: requestKey, rows: [], status: "error", message: ("message" in body && body.message) || "Audit history could not be loaded. Try again." });
          return;
        }
        setResult({ key: requestKey, rows: body.rows, status: body.rows.length ? "ready" : "empty", message: body.rows.length ? "Historical records are retained as the event occurred." : "No audit events match this view" });
      } catch {
        if (active) setResult({ key: requestKey, rows: [], status: "error", message: "Audit history could not be loaded. Try again." });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [url, requestKey, validationError]);

  function clearFilters() {
    setFrom("");
    setTo("");
    setAction("");
    setScopeFilter({ key: scopeKey, value: defaultCarton });
  }

  return (
    <section className="inbound-history-panel" id="receipt-history" aria-busy={busy}>
      <div className="inbound-work-heading"><div><h2>Receipt history</h2><p>Review print, receipt, difference and putaway records without changing stock.</p></div><ListMagnifyingGlass size={27} weight="duotone" /></div>
      <div className="inbound-history-filters" aria-label="History filters">
        <label>Action<select aria-label="Action" value={action} onChange={(event) => setAction(event.target.value)}><option value="">All actions</option><option value="print_confirmed">Label print confirmed</option><option value="print_cancelled">Label print cancelled</option><option value="reprint">Label reprint created</option><option value="receipt_confirmed">Receipt confirmed</option><option value="discrepancy_recorded">Receipt difference recorded</option><option value="putaway_confirmed">Putaway confirmed</option></select></label>
        <label>Source scope<select aria-label="Source scope" value={cartonNumber} onChange={(event) => setScopeFilter({ key: scopeKey, value: event.target.value })}><option value="">All source scopes</option>{selection.cartonNumbers.map((carton) => <option key={carton} value={carton}>{carton}</option>)}</select></label>
        <label>Date from<input aria-label="Date from" inputMode="numeric" pattern="\d{4}-\d{2}-\d{2}" placeholder="YYYY-MM-DD" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Date to<input aria-label="Date to" inputMode="numeric" pattern="\d{4}-\d{2}-\d{2}" placeholder="YYYY-MM-DD" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <label>Display timezone<select aria-label="Display timezone" value={timeZone} onChange={(event) => setTimeZone(event.target.value as HistoryRow["timeZone"])}><option value="Australia/Brisbane">Australia/Brisbane</option><option value="Asia/Shanghai">China Standard Time</option></select></label>
        <button className="button button-secondary" type="button" onClick={clearFilters}><FunnelSimple size={17} />Clear filters</button>
      </div>
      {sourceCartons.length ? <p className="inbound-history-scope-summary"><strong>{scopeSummary.sourceScopeCount}</strong> source {scopeSummary.sourceScopeCount === 1 ? "scope" : "scopes"} · <strong>{scopeSummary.physicalCartonCount}</strong> physical {scopeSummary.physicalCartonCount === 1 ? "carton" : "cartons"}{scopeSummary.cartonGroupCount ? ` · ${scopeSummary.cartonGroupCount} ${scopeSummary.cartonGroupCount === 1 ? "group" : "groups"}` : ""}</p> : null}
      <p className="inbound-history-timezone">{timeZone === "Asia/Shanghai" ? "China Standard Time" : "Australia/Brisbane"}</p>
      {rows.length ? <div className="inbound-history-table" role="table"><div role="row"><span>Date</span><span>Time</span><span>Action</span><span>Reference</span><span>Operator</span><span>Outcome</span></div>{rows.map((row) => <div role="row" key={row.id}><time data-label="Date">{row.date}</time><time data-label="Time">{row.time}</time><strong data-label="Action">{row.actionLabel}</strong><code data-label="Reference">{row.reference}</code><span data-label="Operator">{row.actor ?? "System"}</span><span data-label="Outcome">{row.outcome}</span></div>)}</div> : <div className="inbound-history-empty"><ListMagnifyingGlass size={24} /><strong role={current.status === "error" ? "alert" : undefined}>{message}</strong>{current.status === "error" && !validationError ? <button className="button button-secondary" disabled={busy} type="button" onClick={() => setRetry(value => value + 1)}><ArrowClockwise size={17} />Retry history</button> : null}</div>}
      <p className="inbound-message" role="status">{busy ? "Refreshing audit history..." : current.status === "error" ? "History is unavailable. No records have been changed." : rows.length ? message : "History view loaded."}</p>
    </section>
  );
}
