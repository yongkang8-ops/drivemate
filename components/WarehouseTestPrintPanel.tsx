"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal, flushSync } from "react-dom";
import { buildApiHeaders } from "../lib/clientAuth";
import { type ProductLabelReadiness } from "../lib/warehouseLabelContent";
import {
  prepareTestPrintBatch,
  validateTestPrintSelection,
  type TestPrintJob,
  type TestPrintOutcome,
} from "../lib/warehouseTestPrint";
import type { ProductLabelPage } from "../lib/productLabelBatch";
import { WarehouseProductLabel } from "./WarehouseProductLabel";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";

type Selection = {
  shipmentId: string;
  palletNumbers?: string[];
  cartonNumbers?: string[];
};
type CreateBody = {
  requestId: string;
  selection: Selection;
  items: { sku: string; copies: number }[];
};
export function WarehouseTestPrintPanel({
  selection,
  products,
  onClose,
  returnFocusRef,
}: {
  selection: Selection;
  products: ProductLabelReadiness[];
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(false);
  const pending = useRef(false);
  const activeRead = useRef(0);
  const bodyRef = useRef<CreateBody | null>(null);
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [job, setJob] = useState<TestPrintJob | null>(null);
  const [requestId, setRequestId] = useState("");
  const [recoveryJobId, setRecoveryJobId] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canRebuildRequest, setCanRebuildRequest] = useState(false);
  const [message, setMessage] = useState(
    "Choose up to 10 SKUs. Default 2 copies each; maximum 20 labels.",
  );
  const [reason, setReason] = useState("");
  const [opened, setOpened] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [batch, setBatch] = useState<ProductLabelPage[] | null>(null);
  const [jobs, setJobs] = useState<TestPrintJob[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState("");
  useUnsavedChanges(busy || uncertain || job?.status === "pending");
  function remember(id: string, jobId?: string) {
    setRecoveryJobId(jobId ?? "");
    const url = new URL(window.location.href);
    url.searchParams.delete("testPrintRequest");
    url.searchParams.delete("testPrintJob");
    if (jobId) url.searchParams.set("testPrintJob", jobId);
    else if (id) url.searchParams.set("testPrintRequest", id);
    window.history.replaceState(window.history.state, "", url);
    setRequestId(id);
  }
  async function list(nextPage = page) {
    const version = ++activeRead.current;
    setListError("");
    try {
      const response = await fetch(
        `/api/warehouse/test-labels?shipmentId=${encodeURIComponent(selection.shipmentId)}&page=${nextPage}`,
        {
          headers: await buildApiHeaders("warehouse_staff"),
          cache: "no-store",
        },
      );
      const body = await response.json();
      if (!mounted.current || version !== activeRead.current) return;
      if (!response.ok || !body.ok || !Array.isArray(body.jobs)) throw Error();
      setJobs(body.jobs);
      setTotal(body.total);
      setPage(nextPage);
    } catch {
      if (mounted.current && version === activeRead.current)
        setListError(
          "Test records could not be loaded. Retry before creating a new task.",
        );
    }
  }
  function acceptJob(saved: TestPrintJob, isRecovered: boolean) {
    setRecoveryJobId(saved.id);
    remember(saved.requestId, saved.id);
    setJob(saved);
    setUncertain(false);
    setRecovered(isRecovered);
    setBatch(null);
    setOpened(false);
    setReason(saved.reason ?? "");
    setMessage(
      saved.status === "pending"
        ? "Test task saved. Check printer settings before opening the print dialog."
        : `Test result: ${saved.status}. Formal receipt status is unchanged.`,
    );
  }
  async function reconcile(id = requestId) {
    if (pending.current || !id) return;
    pending.current = true;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/warehouse/test-labels?requestId=${encodeURIComponent(id)}`,
        {
          headers: await buildApiHeaders("warehouse_staff"),
          cache: "no-store",
        },
      );
      const body = await response.json();
      if (!mounted.current) return;
      if (!response.ok || !body.ok) throw Error();
      if (body.job) {
        if (body.job.shipmentId !== selection.shipmentId) {
          setMessage(
            "This pending request belongs to another shipment. Open that shipment to review it.",
          );
          return;
        }
        acceptJob(body.job, true);
      } else {
        setCanRebuildRequest(true);
        setMessage(
          "No saved task is visible yet. Recheck, or choose the original products and retry with the same request ID.",
        );
      }
    } catch {
      if (mounted.current)
        setMessage(
          "Request status is unavailable. Recheck before printing or creating another task.",
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    void list(1);
    const savedJobId = new URLSearchParams(window.location.search).get(
      "testPrintJob",
    );
    const id = new URLSearchParams(window.location.search).get(
      "testPrintRequest",
    );
    if (savedJobId && /^[0-9a-f-]{36}$/i.test(savedJobId)) {
      setRecoveryJobId(savedJobId);
      setUncertain(true);
      void loadJob(savedJobId);
    } else if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      setRequestId(id);
      setUncertain(true);
      void reconcile(id);
    }
    return () => {
      mounted.current = false;
      activeRead.current++;
      dialog.current?.close();
      requestAnimationFrame(() => {
        if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
      });
    };
  }, []);
  async function create(retry = false) {
    if (pending.current) return;
    let body = bodyRef.current;
    if (!retry) {
      try {
        const { items } = validateTestPrintSelection(
          Object.entries(chosen).map(([sku, copies]) => ({ sku, copies })),
        );
        body = {
          requestId: uncertain && requestId ? requestId : crypto.randomUUID(),
          selection,
          items,
        };
      } catch {
        setMessage(
          "Choose 1–10 unique SKUs, 1–5 copies each, maximum 20 labels.",
        );
        return;
      }
    }
    if (!body) return;
    bodyRef.current = body;
    pending.current = true;
    setBusy(true);
    setUncertain(true);
    remember(body.requestId);
    try {
      const response = await fetch("/api/warehouse/test-labels", {
        method: "POST",
        headers: await buildApiHeaders("warehouse_staff", {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!mounted.current) return;
      if (response.ok && data.ok && data.job?.id) {
        acceptJob(data.job, false);
        void list(1);
      } else if (response.status < 500 && data.ok === false) {
        setUncertain(false);
        remember("");
        setMessage(data.message ?? "The test request was rejected.");
      } else throw Error();
    } catch {
      if (mounted.current)
        setMessage(
          "The create result is unknown. Check saved request before any retry.",
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function print() {
    if (!job || busy || opened) return;
    try {
      const labels = prepareTestPrintBatch(job);
      flushSync(() => setBatch(labels));
      const output = document.querySelector(".warehouse-test-print-batch");
      if (
        output?.getAttribute("data-job-id") !== job.id ||
        output.querySelectorAll("article svg rect").length < labels.length
      )
        throw Error();
      window.print();
      setOpened(true);
      setMessage(
        "Print dialog closed. Inspect the physical labels, then record the test result.",
      );
    } catch {
      setBatch(null);
      setOpened(false);
      setMessage(
        "Test print could not be opened. Check the device or record a failed test.",
      );
    }
  }
  async function outcome(value: TestPrintOutcome) {
    if (!job || pending.current) return;
    if (value !== "printed" && !reason.trim()) {
      setMessage("Provide a reason for a failed or cancelled test.");
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/warehouse/test-labels/${job.id}`, {
        method: "POST",
        headers: await buildApiHeaders("warehouse_staff", {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ outcome: value, reason: reason.trim() }),
      });
      const body = await response.json();
      if (!mounted.current) return;
      if (!response.ok || !body.ok || !body.job) throw Error();
      acceptJob(body.job, false);
      remember("");
      void list(1);
    } catch {
      if (mounted.current) {
        setUncertain(true);
        setMessage(
          "Result could not be confirmed. Reload the saved task before retrying.",
        );
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function loadJob(id: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/warehouse/test-labels/${id}`, {
        headers: await buildApiHeaders("warehouse_staff"),
        cache: "no-store",
      });
      const body = await response.json();
      if (!mounted.current) return;
      if (!response.ok || !body.ok || !body.job) throw Error();
      if (body.job.shipmentId !== selection.shipmentId) {
        setMessage(
          "This test task belongs to another shipment. Close this panel and open its original shipment.",
        );
        return;
      }
      acceptJob(body.job, true);
    } catch {
      if (mounted.current)
        setMessage("Test task could not be loaded. Retry the read.");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function close() {
    if (busy) return;
    if (
      (uncertain || job?.status === "pending") &&
      !window.confirm(
        "This test may still need a result. Its saved record is retained. Close the panel?",
      )
    )
      return;
    if (!uncertain || recoveryJobId) remember("");
    onClose();
  }
  return (
    <>
      <dialog
        ref={dialog}
        className="warehouse-test-dialog"
        aria-label="Test print"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <header>
          <div>
            <p>Printer commissioning</p>
            <h2>Test print</h2>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="Close test print"
          >
            Close
          </button>
        </header>
        <p>
          TEST — NOT FOR STOCK. Test records never unlock receipt or change
          inventory.
        </p>
        <p>
          70 × 50 mm · 100% scale · Copies = 1 · no headers/footers · background
          graphics on.
        </p>
        <p role="status" className="workspace-feedback">
          {message}
        </p>
        {uncertain ? (
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                job || recoveryJobId
                  ? void loadJob(job?.id ?? recoveryJobId)
                  : void reconcile()
              }
            >
              Check saved request
            </button>
            {bodyRef.current && !job ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void create(true)}
              >
                Retry same request
              </button>
            ) : null}
          </div>
        ) : null}
        {!job && (!uncertain || canRebuildRequest) ? (
          <fieldset disabled={busy || !!listError}>
            <legend>Test products</legend>
            {products.map((p) => (
              <div className="test-product-row" key={p.sku}>
                <label>
                  <input
                    type="checkbox"
                    disabled={!p.content}
                    checked={chosen[p.sku] !== undefined}
                    onChange={(e) =>
                      setChosen((current) => {
                        const next = { ...current };
                        if (e.target.checked) next[p.sku] = 2;
                        else delete next[p.sku];
                        return next;
                      })
                    }
                  />
                  <span>
                    <b>{p.sku}</b>{" "}
                    {p.content?.profile.displayName ??
                      "Label details incomplete"}
                    <small>
                      PN {p.content?.profile.partReference ?? "—"} ·{" "}
                      {p.content?.productBarcode ?? "—"}
                    </small>
                  </span>
                </label>
                {chosen[p.sku] !== undefined ? (
                  <label>
                    Copies
                    <input
                      aria-label={`Copies for ${p.sku}`}
                      type="number"
                      min={1}
                      max={5}
                      step={1}
                      value={chosen[p.sku]}
                      onChange={(e) =>
                        setChosen({
                          ...chosen,
                          [p.sku]: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ) : null}
              </div>
            ))}
            {/* A single text child stays current when Chrome Translate replaces text nodes. */}
            <p aria-live="polite">
              {`${Object.keys(chosen).length} SKUs · ${Object.values(chosen).reduce((n, q) => n + q, 0)} labels`}
            </p>
            <button type="button" onClick={() => void create()} disabled={busy}>
              {uncertain ? "Retry selected request" : "Create test task"}
            </button>
          </fieldset>
        ) : null}
        {job ? (
          <section>
            <h3>{`Test task ${job.id}`}</h3>
            <p>
              {`${job.labels.length} labels · ${job.status}`}
            </p>
            <p>
              {`Saved SKUs: ${[...new Set(job.labels.map((label) => label.sku))].join(", ")}`}
            </p>
            {job.status === "pending" ? (
              <>
                <p>
                  {recovered
                    ? "Recovered task: check whether it already printed before opening the dialog again."
                    : "No inventory or formal print confirmation will be recorded."}
                </p>
                <button
                  type="button"
                  disabled={busy || opened || uncertain}
                  onClick={print}
                >
                  Open test print dialog
                </button>
                <label>
                  Test result reason
                  <textarea
                    value={reason}
                    maxLength={500}
                    disabled={busy || uncertain}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <div className="workspace-action-group">
                  <button
                    type="button"
                    disabled={busy || uncertain || (!opened && !recovered)}
                    onClick={() => void outcome("printed")}
                  >
                    Confirm test printed
                  </button>
                  <button
                    type="button"
                    disabled={busy || uncertain}
                    onClick={() => void outcome("failed")}
                  >
                    Record test failed
                  </button>
                  <button
                    type="button"
                    disabled={busy || uncertain}
                    onClick={() => void outcome("cancelled")}
                  >
                    Cancel test
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setJob(null);
                  setBatch(null);
                  setReason("");
                  bodyRef.current = null;
                  remember("");
                }}
              >
                Start another test
              </button>
            )}
          </section>
        ) : null}
        <section>
          <h3>Test print records</h3>
          {listError ? <p role="alert">{listError}</p> : null}
          <button type="button" disabled={busy} onClick={() => void list()}>
            Refresh test records
          </button>
          <p>
            {`${total} records · Page ${page}`}
          </p>
          {jobs.map((j) => (
            <p key={j.id}>
              <button
                type="button"
                disabled={busy || uncertain || job?.status === "pending"}
                onClick={() => void loadJob(j.id)}
              >
                {`Open test ${j.id}`}
              </button>{" "}
              <span>{`${j.status} · ${j.labels.length} labels · ${new Date(j.createdAt).toLocaleString()}`}</span>
            </p>
          ))}
          <button
            type="button"
            disabled={page === 1 || busy}
            onClick={() => void list(page - 1)}
          >
            Previous tests
          </button>
          <button
            type="button"
            disabled={page * 25 >= total || busy}
            onClick={() => void list(page + 1)}
          >
            Next tests
          </button>
        </section>
      </dialog>
      {batch && job
        ? createPortal(
            <div
              className="warehouse-test-print-batch"
              data-job-id={job.id}
              aria-hidden="true"
            >
              {batch.map((label) => (
                <WarehouseProductLabel
                  key={label.itemId}
                  label={label}
                  purpose="test"
                />
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
