"use client";

import Link from "./StableLink";
import { WorkspaceNavigation } from "./WorkspaceNavigation";
import { WorkspaceBrand } from "./WorkspaceBrand";
import { useListFilters } from "../hooks/useListFilters";
import { usePagination, PaginationControls } from "./PaginatedTable";
import {
  ArrowsClockwise,
  CaretRight,
  ClipboardText,
  Package,
  Printer,
  WarningCircle,
  Warehouse,
} from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { buildApiHeaders } from "../lib/clientAuth";
import type { PartnerDashboardAttention, PartnerDashboardShipmentSource } from "../lib/warehouseDashboard";
import type { WarehouseHistoryAction, WarehouseHistoryTimeZone } from "../lib/warehouseHistory";

type DashboardActivity = {
  id: string;
  createdAt: string;
  action: WarehouseHistoryAction;
  actionLabel: string;
  date: string;
  time: string;
  outcome: string;
  reference: string;
  shipmentId: string;
  sku?: string;
};

type PartnerDashboardData = {
  generatedAt: string;
  displayTimeZone: WarehouseHistoryTimeZone;
  pipeline: {
    activeShipments: number;
    printConfirmationRequired: number;
    stagingUnits: number;
    locatedUnits: number;
    openExceptions: number;
  };
  shipments: Array<PartnerDashboardShipmentSource & {
    stage: string;
    stageLabel: string;
    labelStatus: "printed" | "pending" | "not_ready";
    receiptStatus: "confirmed" | "waiting" | "blocked";
    putawayStatus: "complete" | "pending" | "waiting" | "blocked";
    nextAction: string;
    nextActionHref: string;
  }>;
  exceptions: PartnerDashboardAttention[];
  attention: PartnerDashboardAttention[];
  activities: DashboardActivity[];
};

function timeZoneName(timeZone: WarehouseHistoryTimeZone) {
  return timeZone === "Asia/Shanghai" ? "China Standard Time" : "Brisbane time";
}

function formatTimestamp(value: string, timeZone: WarehouseHistoryTimeZone) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(value));
}

function StatusPill({ label, status }: { label: string; status: "printed" | "confirmed" | "complete" | "pending" | "waiting" | "not_ready" | "blocked" }) {
  return <span className={`partner-status partner-status-${status}`}>{label}</span>;
}

const labelStatusLabels = {
  printed: "Labels printed",
  pending: "Labels pending",
  not_ready: "Labels blocked",
} as const;

const receiptStatusLabels = {
  confirmed: "Receipt confirmed",
  waiting: "Receipt waiting",
  blocked: "Receipt blocked",
} as const;

const putawayStatusLabels = {
  complete: "Putaway complete",
  pending: "Putaway pending",
  waiting: "Putaway waiting",
  blocked: "Putaway blocked",
} as const;

export function PartnerDashboard() {
  const [filters, updateFilter] = useListFilters({ dashboardSearch: "", dashboardZone: "au" }, ["shipments", "attention", "activity"], { dashboardZone: ["au", "cn"] });
  const displayTimeZone: WarehouseHistoryTimeZone = filters.dashboardZone === "cn" ? "Asia/Shanghai" : "Australia/Brisbane";
  const setDisplayTimeZone = (zone: WarehouseHistoryTimeZone) => updateFilter("dashboardZone", zone === "Asia/Shanghai" ? "cn" : "au");
  const [searchInput, setSearchInput] = useState("");
  const appliedSearch = filters.dashboardSearch;
  useEffect(() => setSearchInput(appliedSearch), [appliedSearch]);
  const [dashboard, setDashboard] = useState<PartnerDashboardData | null>(null);
  const [message, setMessage] = useState("Loading saved operations snapshot.");
  const [isLoading, setIsLoading] = useState(true);
  const requestVersion = useRef(0);
  const shipmentPages = usePagination("shipments", dashboard?.shipments.length ?? 0);
  const attentionPages = usePagination("attention", dashboard?.attention.length ?? 0);
  const activityPages = usePagination("activity", dashboard?.activities.length ?? 0);

  const loadDashboard = useCallback(async (nextSearch = appliedSearch) => {
    const version = ++requestVersion.current;
    setIsLoading(true);
    const params = new URLSearchParams({ timeZone: displayTimeZone });
    if (nextSearch.trim()) params.set("search", nextSearch.trim());
    try {
      const response = await fetch(`/api/partner/dashboard?${params.toString()}`, {
        headers: await buildApiHeaders("partner"),
        cache: "no-store",
      });
      const body = await response.json() as { ok?: boolean; dashboard?: PartnerDashboardData; message?: string };
      if (version !== requestVersion.current) return;
      if (!response.ok || !body.ok || !body.dashboard) {
        setDashboard(null);
        setMessage(body.message || "Saved operations data could not be loaded.");
        return;
      }
      setDashboard(body.dashboard);
      setMessage("Saved operations snapshot loaded.");
    } catch {
      if (version !== requestVersion.current) return;
      setDashboard(null);
      setMessage("Saved operations data could not be loaded.");
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }, [appliedSearch, displayTimeZone]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = searchInput.trim();
    if (nextSearch === appliedSearch) void loadDashboard(nextSearch);
    else updateFilter("dashboardSearch", nextSearch);
  }

  return (
    <section className="partner-dashboard-app" aria-label="Partner operations dashboard">
      <aside className="partner-dashboard-sidebar">
        <WorkspaceBrand />

        <WorkspaceNavigation current="/partner" className="partner-dashboard-nav" label="Partner operations navigation" />

        <div className="partner-dashboard-boundary">
          <span>Read-only overview</span>
          <p>Shows saved warehouse records only. It does not create stock, sales, GST, payments or dispatch activity.</p>
        </div>
      </aside>

      <div className="partner-dashboard-content">
        <header className="partner-dashboard-topbar">
          <div>
            <span>Shared operational view</span>
            <h1>Operations dashboard</h1>
          </div>
          <div className="partner-dashboard-controls">
            <label>
              Display timezone
              <select aria-label="Display timezone" value={displayTimeZone} onChange={(event) => setDisplayTimeZone(event.target.value as WarehouseHistoryTimeZone)}>
                <option value="Australia/Brisbane">Australia / Brisbane</option>
                <option value="Asia/Shanghai">China / Shanghai</option>
              </select>
            </label>
            <button className="partner-refresh-button" type="button" onClick={() => void loadDashboard()} disabled={isLoading}>
              <ArrowsClockwise size={16} weight="bold" />Refresh snapshot
            </button>
            <b aria-label="Partner access">P</b>
          </div>
        </header>

        <main className="partner-dashboard-main">
          <section className="partner-dashboard-intro">
            <div>
              <span>Inbound control</span>
              <h2>Inbound pipeline command board</h2>
              <p>One saved operational picture for every partner, from confirmed Packing List to label, receipt, staging and putaway.</p>
            </div>
            <p className="partner-dashboard-updated" aria-live="polite">
              {dashboard ? `Last update · ${formatTimestamp(dashboard.generatedAt, displayTimeZone)} · ${timeZoneName(displayTimeZone)}` : message}
            </p>
          </section>

          <section className="partner-metric-grid" aria-label="Inbound pipeline totals">
            <article><span>Active inbound shipments</span><strong>{dashboard?.pipeline.activeShipments ?? "–"}</strong><p>Confirmed Packing Lists in view</p></article>
            <article><span>Print confirmation required</span><strong>{dashboard?.pipeline.printConfirmationRequired ?? "–"}</strong><p>Labels not yet confirmed printed</p></article>
            <article><span>Unlocated in staging</span><strong>{dashboard?.pipeline.stagingUnits ?? "–"}</strong><p>Units in BNE-RECEIVING-STAGING</p></article>
            <article className="is-amber"><span>Open receipt exceptions</span><strong>{dashboard?.pipeline.openExceptions ?? "–"}</strong><p>Saved differences needing review</p></article>
          </section>

          <section className="partner-dashboard-toolbar">
            <form onSubmit={submitSearch}>
              <label htmlFor="dashboard-search">Find shipment, SKU or reference</label>
              <div>
                <input id="dashboard-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="e.g. BNE-TEST-001 or DM-GWM-OF-001" />
                <button type="submit">Filter</button>
              </div>
            </form>
            <span>{timeZoneName(displayTimeZone)}</span>
          </section>

          <section className="partner-dashboard-grid">
            <article className="partner-dashboard-panel partner-shipment-panel">
              <div className="partner-panel-heading">
                <div>
                  <span>Saved inbound worklist</span>
                  <h2>Inbound shipment board</h2>
                </div>
                <Link href="/prearrival" aria-label="Open all pre-arrival shipments">Open pre-arrival <CaretRight size={15} weight="bold" /></Link>
              </div>

              {isLoading ? <p className="partner-dashboard-empty">Loading saved shipment records…</p> : null}
              {!isLoading && dashboard?.shipments.length === 0 ? <p className="partner-dashboard-empty">No saved inbound shipment matches this filter.</p> : null}
              {!isLoading && dashboard ? <PaginationControls state={shipmentPages} label="Inbound shipments" /> : null}
              {!isLoading && dashboard?.shipments.slice(shipmentPages.start, shipmentPages.end).map((shipment) => (
                <div className="partner-shipment-row" key={shipment.shipmentId}>
                  <div className="partner-shipment-reference">
                    <strong>{shipment.shipmentReference}</strong>
                    <span>
                      <span>
                        {shipment.packingListConfirmed
                          ? `Packing List v${shipment.packingListVersion}`
                          : "Packing List not confirmed"}
                      </span>
                      {` · ${shipment.physicalPalletCount ?? "Unknown"} physical pallets · ${shipment.mappedPalletCount || "—"} mapped · ${shipment.sourceScopeCount} source ${shipment.sourceScopeCount === 1 ? "scope" : "scopes"} · ${shipment.physicalCartonCount} physical ${shipment.physicalCartonCount === 1 ? "carton" : "cartons"}${shipment.cartonGroupCount ? ` · ${shipment.cartonGroupCount} ${shipment.cartonGroupCount === 1 ? "group" : "groups"}` : ""} · ${shipment.palletMappingStatus.replace("_", " ")}`}
                    </span>
                  </div>
                  <div className="partner-shipment-stage">
                    <span className={`partner-stage partner-stage-${shipment.stage}`}>{shipment.stageLabel}</span>
                    <small>{shipment.expectedQuantity} expected units</small>
                  </div>
                  <div className="partner-shipment-statuses" aria-label={`Operation status for ${shipment.shipmentReference}`}>
                    <StatusPill label={labelStatusLabels[shipment.labelStatus]} status={shipment.labelStatus} />
                    <StatusPill label={receiptStatusLabels[shipment.receiptStatus]} status={shipment.receiptStatus} />
                    <StatusPill label={putawayStatusLabels[shipment.putawayStatus]} status={shipment.putawayStatus} />
                  </div>
                  <Link className="partner-open-action" href={shipment.nextActionHref}>
                    {shipment.nextAction}<CaretRight size={15} weight="bold" />
                  </Link>
                </div>
              ))}
            </article>

            <aside className="partner-dashboard-panel partner-attention-panel">
              <div className="partner-panel-heading">
                <div>
                  <span>Review before the next move</span>
                  <h2>Attention queue</h2>
                </div>
                <WarningCircle size={22} weight="duotone" />
              </div>
              {isLoading ? <p className="partner-dashboard-empty">Loading saved attention items…</p> : null}
              {!isLoading && dashboard && !dashboard.attention.length ? <p className="partner-dashboard-empty">No saved exceptions or current attention items.</p> : null}
              {!isLoading && dashboard ? <PaginationControls state={attentionPages} label="Attention queue" /> : null}
              {!isLoading && dashboard?.attention.slice(attentionPages.start, attentionPages.end).map((item) => (
                <div className={`partner-attention-item partner-attention-${item.type}`} key={item.id}>
                  <strong>{item.title}</strong>
                  <code>{item.reference}</code>
                  <p>{item.detail}</p>
                  <Link href={item.href}>Review operation <CaretRight size={14} weight="bold" /></Link>
                </div>
              ))}
            </aside>
          </section>

          <section className="partner-dashboard-lower-grid">
            <article className="partner-dashboard-panel partner-activity-panel">
              <div className="partner-panel-heading">
                <div>
                  <span>Immutable warehouse audit</span>
                  <h2>Confirmed activity</h2>
                </div>
                <Link href="/warehouse?view=receipt_history">Open receipt history <CaretRight size={15} weight="bold" /></Link>
              </div>
              {isLoading ? <p className="partner-dashboard-empty">Loading saved activity…</p> : null}
              {!isLoading && dashboard && !dashboard.activities.length ? <p className="partner-dashboard-empty">No saved activity yet.</p> : null}
              {!isLoading && dashboard ? <PaginationControls state={activityPages} label="Confirmed activity" /> : null}
              {!isLoading && dashboard?.activities.slice(activityPages.start, activityPages.end).map((activity) => (
                <div className="partner-activity-row" key={activity.id}>
                  <time dateTime={activity.createdAt}>{activity.date}<small>{activity.time}</small></time>
                  <div><strong>{activity.actionLabel}</strong><span>{activity.outcome}</span></div>
                  <code>{activity.sku ?? activity.reference}</code>
                </div>
              ))}
            </article>

            <aside className="partner-dashboard-panel partner-posture-panel">
              <span>Inventory posture</span>
              <h2>Warehouse positions</h2>
              <div><Package size={21} weight="duotone" /><strong>{dashboard?.pipeline.stagingUnits ?? "–"}</strong><p>Units awaiting a location scan</p></div>
              <div><Warehouse size={21} weight="duotone" /><strong>{dashboard?.pipeline.locatedUnits ?? "–"}</strong><p>Units recorded as put away</p></div>
              <div><ClipboardText size={21} weight="duotone" /><strong>{dashboard?.pipeline.activeShipments ?? "–"}</strong><p>Confirmed Packing Lists in view</p></div>
              <p className="partner-posture-note"><Printer size={16} weight="duotone" /> The dashboard is a read-only projection of saved operations records.</p>
            </aside>
          </section>
        </main>
      </div>
    </section>
  );
}
