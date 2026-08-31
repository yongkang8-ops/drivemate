"use client";

import { ArrowClockwise, FunnelSimple, ListMagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { buildApiHeaders } from "../lib/clientAuth";

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
};

export function ReceiptHistoryPanel({ selection }: ReceiptHistoryPanelProps) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [action, setAction] = useState("");
  const [cartonNumber, setCartonNumber] = useState(selection.cartonNumbers[0] ?? "");
  const [timeZone, setTimeZone] = useState<HistoryRow["timeZone"]>("Australia/Brisbane");
  const [message, setMessage] = useState("Loading immutable warehouse audit records.");
  const [busy, setBusy] = useState(false);
  const scopeKey = `${selection.shipmentId}:${selection.cartonNumbers.join(",")}`;

  async function loadHistory() {
    setBusy(true);
    try {
      const params = new URLSearchParams({ shipmentId: selection.shipmentId, timeZone });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (cartonNumber) params.set("cartonNumber", cartonNumber);
      if (action) params.set("action", action);
      const response = await fetch(`/api/warehouse/history?${params.toString()}`, {
        cache: "no-store",
        headers: await buildApiHeaders("warehouse_staff"),
      });
      const body = (await response.json()) as HistoryResponse;
      if (!response.ok || !body.ok) {
        setRows([]);
        setMessage(("message" in body && body.message) || "Audit history could not be loaded.");
        return;
      }
      setRows(body.rows);
      setMessage(body.rows.length ? "Historical records are retained as the event occurred." : "No audit events match this view");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setCartonNumber(selection.cartonNumbers[0] ?? "");
    void loadHistory();
    // scopeKey represents the selection value, avoiding a rerun for an equivalent array instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, timeZone, from, to, action, cartonNumber]);

  function clearFilters() {
    setFrom("");
    setTo("");
    setAction("");
    setCartonNumber(selection.cartonNumbers[0] ?? "");
  }

  return (
    <section className="inbound-history-panel" id="receipt-history">
      <div className="inbound-work-heading"><div><h2>Receipt history</h2><p>Review print, receipt, difference and putaway records without changing stock.</p></div><ListMagnifyingGlass size={27} weight="duotone" /></div>
      <div className="inbound-history-filters" aria-label="History filters">
        <label>Action<select aria-label="Action" value={action} onChange={(event) => setAction(event.target.value)}><option value="">All actions</option><option value="print_confirmed">Label print confirmed</option><option value="print_cancelled">Label print cancelled</option><option value="reprint">Label reprint created</option><option value="receipt_confirmed">Receipt confirmed</option><option value="discrepancy_recorded">Receipt difference recorded</option><option value="putaway_confirmed">Putaway confirmed</option></select></label>
        <label>Carton<select aria-label="Carton" value={cartonNumber} onChange={(event) => setCartonNumber(event.target.value)}>{selection.cartonNumbers.map((carton) => <option key={carton} value={carton}>{carton}</option>)}</select></label>
        <label>Date from<input aria-label="Date from" inputMode="numeric" pattern="\d{4}-\d{2}-\d{2}" placeholder="YYYY-MM-DD" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Date to<input aria-label="Date to" inputMode="numeric" pattern="\d{4}-\d{2}-\d{2}" placeholder="YYYY-MM-DD" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <label>Display timezone<select aria-label="Display timezone" value={timeZone} onChange={(event) => setTimeZone(event.target.value as HistoryRow["timeZone"])}><option value="Australia/Brisbane">Australia/Brisbane</option><option value="Asia/Shanghai">China Standard Time</option></select></label>
        <button className="button button-secondary" type="button" onClick={clearFilters}><FunnelSimple size={17} />Clear filters</button>
      </div>
      <p className="inbound-history-timezone">{timeZone === "Asia/Shanghai" ? "China Standard Time" : "Australia/Brisbane"}</p>
      {rows.length ? <div className="inbound-history-table" role="table"><div role="row"><span>Date</span><span>Time</span><span>Action</span><span>Reference</span><span>Operator</span><span>Outcome</span></div>{rows.map((row) => <div role="row" key={row.id}><time data-label="Date">{row.date}</time><time data-label="Time">{row.time}</time><strong data-label="Action">{row.actionLabel}</strong><code data-label="Reference">{row.reference}</code><span data-label="Operator">{row.actor ?? "System"}</span><span data-label="Outcome">{row.outcome}</span></div>)}</div> : <div className="inbound-history-empty"><ListMagnifyingGlass size={24} /><strong>{message}</strong>{message !== "No audit events match this view" ? <button className="button button-secondary" disabled={busy} type="button" onClick={() => void loadHistory()}><ArrowClockwise size={17} />Retry history</button> : null}</div>}
      <p className="inbound-message" role="status">{busy ? "Refreshing audit history..." : rows.length ? message : "History view loaded."}</p>
    </section>
  );
}
