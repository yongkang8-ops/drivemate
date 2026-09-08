"use client";
import { FileArrowUp, SealCheck } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { buildApiHeaders } from "../lib/clientAuth";
import { useSensitiveFetch } from "./MfaStepUpProvider";
import { PurchasePreviewTable, type PurchasePreviewRow } from "./PurchasePreviewTable";

type Preview = { summary: { lineCount: number; uniquePartNumbers: number; quantity: number; subtotalMinor: number; discountMinor: number; finalTotalMinor: number; riskCounts: { low: number; medium: number; high: number }; supplementedLines: number }; warnings: string[]; sourceSha256: string; lines: PurchasePreviewRow[] };
export function PurchaseImportPanel() {
  const sensitiveFetch = useSensitiveFetch();
  const [pi, setPi] = useState<File | null>(null); const [supplemental, setSupplemental] = useState<File | null>(null); const [preview, setPreview] = useState<Preview | null>(null); const [token, setToken] = useState(""); const [message, setMessage] = useState("Select the authoritative PI and optional packing JSON. Preview writes no business data.");
  const [previewVersion, setPreviewVersion] = useState(-1); const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const filesVersion = useRef(0); const requestLock = useRef(false); const commitKey = useRef("");
  const [committedFilesVersion, setCommittedFilesVersion] = useState(-1);
  useUnsavedChanges(Boolean(busy) || Boolean((pi || supplemental) && committedFilesVersion !== filesVersion.current));
  function invalidatePreview() { filesVersion.current += 1; setPreview(null); setToken(""); setPreviewVersion(-1); commitKey.current = ""; }
  async function send(mode: "preview" | "commit") {
    if (requestLock.current) return;
    if (!pi) { setMessage("Select the authoritative PI first."); return; }
    if (mode === "commit" && (!token || previewVersion !== filesVersion.current)) return;
    requestLock.current = true; setBusy(mode); const requestVersion = filesVersion.current;
    const form = new FormData(); form.set("pi", pi); if (supplemental) form.set("supplemental", supplemental);
    if (mode === "commit") { form.set("previewToken", token); commitKey.current ||= crypto.randomUUID(); form.set("idempotencyKey", commitKey.current); }
    setMessage(mode === "preview" ? "Validating file hash and control totals..." : "Committing approved purchase data...");
    try {
      const response = await sensitiveFetch(`/api/admin/imports/purchase-order/${mode}`, { method: "POST", headers: await buildApiHeaders("admin"), body: form });
      const body = await response.json().catch(() => null);
      if (requestVersion !== filesVersion.current) return;
      if (!body) { setMessage(mode === "commit" ? "Result could not be confirmed. Check saved records before retrying." : "Purchase validation returned an unreadable response. Try validating again."); return; }
      if (!response.ok || !body.ok) { setMessage(body.message || (mode === "commit" ? "Result could not be confirmed. Check saved records before retrying." : "Purchase import failed.")); return; }
      if (mode === "preview" && body.preview && body.previewToken) { setPreview(body.preview); setToken(body.previewToken); setPreviewVersion(requestVersion); commitKey.current = crypto.randomUUID(); setMessage("Preview passed. Review the totals and risk split before commit."); }
      else if (mode === "commit") { if (typeof body.importRunId !== "string") { setMessage("Result could not be confirmed. Check saved records before retrying."); return; } setCommittedFilesVersion(requestVersion); const quantity = body.quantity ?? preview?.summary.quantity; setMessage(`Import committed as ${body.importRunId}. ${quantity ?? "Imported"} units remain on order and unavailable.`); setToken(""); setPreviewVersion(-1); commitKey.current = ""; }
      else setMessage("Purchase validation returned an incomplete response. Try validating again.");
    } catch { if (requestVersion === filesVersion.current) setMessage(mode === "commit" ? "Result could not be confirmed. Check saved records before retrying." : "Purchase validation could not be completed. Check the connection and try again."); }
    finally { requestLock.current = false; setBusy(null); }
  }
  const canCommit = Boolean(token) && previewVersion === filesVersion.current && !busy;
  return <section className="panel import-panel" id="purchasing"><div className="panel-title"><div><p className="eyebrow">Controlled import</p><h2>Authoritative purchase order</h2></div><FileArrowUp size={28} weight="duotone" /></div><div className="form-grid"><label>Authoritative PI (.xlsx)<input type="file" accept=".xlsx" disabled={busy === "commit"} onChange={(e) => { invalidatePreview(); setPi(e.target.files?.[0] ?? null); }} /></label><label>Packing supplement (.json)<input type="file" accept=".json" disabled={busy === "commit"} onChange={(e) => { invalidatePreview(); setSupplemental(e.target.files?.[0] ?? null); }} /></label></div><div className="import-actions"><button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => void send("preview")}>Preview &amp; validate</button><button className="button button-primary" type="button" disabled={!canCommit} onClick={() => void send("commit")}><SealCheck size={18} />Commit approved preview</button><p role="status">{message}</p></div>{preview && <><div className="import-summary"><div><span>Lines</span><strong>{preview.summary.lineCount}</strong></div><div><span>Units on order</span><strong>{preview.summary.quantity}</strong></div><div><span>Cash PO cost</span><strong>RMB {(preview.summary.finalTotalMinor / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })}</strong></div><div><span>Risk split</span><strong>{preview.summary.riskCounts.high} H / {preview.summary.riskCounts.medium} M / {preview.summary.riskCounts.low} L</strong></div><div><span>Packing matched</span><strong>{preview.summary.supplementedLines} / {preview.summary.lineCount}</strong></div><div><span>Source hash</span><code>{preview.sourceSha256.slice(0, 16)}...</code></div></div><PurchasePreviewTable rows={preview.lines} /></>}</section>;
}
