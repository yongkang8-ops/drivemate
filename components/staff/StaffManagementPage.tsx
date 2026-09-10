"use client";
import { WorkspaceNavigation } from "../WorkspaceNavigation";
import { WorkspaceBrand } from "../WorkspaceBrand";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildApiHeaders } from "../../lib/clientAuth";
import type { StaffAccountStatus, StaffRole } from "../../lib/repository";
import {
  filterStaffAccounts,
  staffSummary,
  type StaffCollectionAccount,
  type StaffFilters,
  type StaffViewerRole,
} from "../../lib/staffUi";
import { StaffRegister } from "./StaffRegister";
import { StaffAccountForm, type CreateStaffValues } from "./StaffAccountForm";
import { StaffAccountOverview } from "./StaffAccountOverview";
import { StaffActionForm, staffActionTitle, type StaffActionKind, type StaffActionPayload } from "./StaffActionForm";
import type { StaffAuditItem } from "./StaffAuditTimeline";
import { StaffDrawer } from "./StaffDrawer";
import { StaffPasswordHandoff } from "./StaffPasswordHandoff";
import { StaffSummaryMetrics } from "./StaffSummaryMetrics";
import { useSensitiveFetch } from "../MfaStepUpProvider";
import { useWorkspaceRole } from "../RoleGate";
import { useListFilters } from "../../hooks/useListFilters";
import { confirmDiscardChanges, useUnsavedChanges } from "../../hooks/useUnsavedChanges";

type CollectionState = "loading" | "ready" | "error";
type StaffCollectionResponse = {
  ok?: boolean;
  canManage?: boolean;
  accounts?: StaffCollectionAccount[];
};
type StaffDetailResponse = {
  ok?: boolean;
  canManage?: boolean;
  account?: StaffCollectionAccount;
  audit?: StaffAuditItem[];
};
type StaffCreateResponse = StaffDetailResponse & {
  temporaryPassword?: string;
  temporaryPasswordExpiresAt?: string;
  message?: string;
};
type DrawerMode =
  | { kind: "closed" }
  | { kind: "account"; account: StaffCollectionAccount; audit: StaffAuditItem[]; canManage: boolean; loading: boolean }
  | { kind: "create" }
  | { kind: "handoff"; account: StaffCollectionAccount; password: string; expiresAt: string }
  | { kind: "action"; account: StaffCollectionAccount; audit: StaffAuditItem[]; canManage: boolean; action: StaffActionKind };

const emptyFilters: StaffFilters = { search: "", role: "all", status: "all" };

export function StaffManagementPage() {
  const navigationRole = useWorkspaceRole();
  const sensitiveFetch = useSensitiveFetch();
  const [accounts, setAccounts] = useState<StaffCollectionAccount[]>([]);
  const [viewerRole, setViewerRole] = useState<StaffViewerRole>("partner");
  const [collectionState, setCollectionState] = useState<CollectionState>("loading");
  const [listFilters, setListFilter] = useListFilters({ staffSearch: "", staffRole: "all", staffStatus: "all" }, "staff", { staffRole: ["all", "admin", "partner", "warehouse_staff"], staffStatus: ["all", "pending_first_login", "active", "disabled"] });
  const filters: StaffFilters = { search: listFilters.staffSearch, role: listFilters.staffRole as StaffFilters["role"], status: listFilters.staffStatus as StaffFilters["status"] };
  const [drawerMode, setDrawerMode] = useState<DrawerMode>({ kind: "closed" });
  const [drawerMessage, setDrawerMessage] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  useUnsavedChanges(draftDirty || drawerMode.kind === "handoff" || createBusy || actionBusy);
  const selectedTrigger = useRef<HTMLElement | null>(null);
  const detailRequest = useRef(0);
  const mutationPending = useRef(false);

  async function loadAccounts(signal?: AbortSignal) {
    setCollectionState("loading");
    try {
      const response = await fetch("/api/admin/staff", { cache: "no-store", signal });
      const body = (await response.json()) as StaffCollectionResponse;
      if (!response.ok || !body.ok || !body.accounts) throw new Error("collection_failed");
      setAccounts(body.accounts);
      setViewerRole(body.canManage ? "admin" : "partner");
      setCollectionState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCollectionState("error");
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadAccounts(controller.signal);
    return () => { controller.abort(); detailRequest.current++; };
  }, []);

  const summary = useMemo(() => staffSummary(accounts), [accounts]);
  const filteredAccounts = useMemo(() => filterStaffAccounts(accounts, filters), [accounts, filters]);

  async function openAccount(userId: string, trigger: HTMLButtonElement) {
    const request = ++detailRequest.current;
    selectedTrigger.current = trigger;
    setDrawerMessage("");
    const collectionAccount = accounts.find((account) => account.userId === userId);
    if (!collectionAccount) return;
    setDrawerMode({
      kind: "account",
      account: collectionAccount,
      audit: [],
      canManage: viewerRole === "admin" && collectionAccount.role !== "admin",
      loading: true,
    });
    try {
    const response = await fetch(`/api/admin/staff/${encodeURIComponent(userId)}`, { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as StaffDetailResponse;
    if (request !== detailRequest.current) return;
    if (!response.ok || !body.ok || !body.account) {
      setDrawerMessage("Account details could not be loaded. No changes were made.");
      setDrawerMode((current) => current.kind === "account" ? { ...current, loading: false } : current);
      return;
    }
    setDrawerMode({
      kind: "account",
      account: body.account,
      audit: body.audit ?? [],
      canManage: Boolean(body.canManage),
      loading: false,
    });
    } catch {
      if (request !== detailRequest.current) return;
      setDrawerMessage("Account details could not be loaded. Close this panel and try again.");
      setDrawerMode(current => current.kind === "account" ? { ...current, loading: false } : current);
    }
  }

  const closeDrawer = useCallback(() => {
    if (mutationPending.current || !confirmDiscardChanges(draftDirty)) return;
    detailRequest.current++;
    setDrawerMessage("");
    setDrawerMode({ kind: "closed" });
  }, [draftDirty]);

  function openCreate(trigger: HTMLButtonElement) {
    detailRequest.current++;
    selectedTrigger.current = trigger;
    setDrawerMessage("");
    setDrawerMode({ kind: "create" });
  }

  async function createAccount(values: CreateStaffValues) {
    if (mutationPending.current) return;
    mutationPending.current = true;
    setCreateBusy(true);
    setDrawerMessage("");
    try {
    const response = await sensitiveFetch("/api/admin/staff", {
      method: "POST",
      headers: await buildApiHeaders("admin", { "Content-Type": "application/json" }),
      body: JSON.stringify(values),
    });
    const body = (await response.json().catch(() => ({}))) as StaffCreateResponse;
    if (!response.ok || !body.ok || !body.account || !body.temporaryPassword || !body.temporaryPasswordExpiresAt) {
      setDrawerMessage(!response.ok && response.status < 500 && body.ok === false ? body.message || "The request was rejected. Review the details and try again." : "The create result could not be confirmed. Check the Staff register before retrying. Your entered details are retained.");
      return;
    }
    setAccounts((current) => [body.account!, ...current.filter((account) => account.userId !== body.account!.userId)]);
    setDrawerMode({
      kind: "handoff",
      account: body.account,
      password: body.temporaryPassword,
      expiresAt: body.temporaryPasswordExpiresAt,
    });
    } catch {
      setDrawerMessage("The create result could not be confirmed. Check the Staff register before retrying. Your entered details are retained.");
    } finally {
      mutationPending.current = false;
      setCreateBusy(false);
    }
  }

  function openAction(action: StaffActionKind) {
    setDrawerMessage("");
    setDrawerMode((current) => current.kind === "account"
      ? { kind: "action", account: current.account, audit: current.audit, canManage: current.canManage, action }
      : current);
  }

  function cancelAction() {
    if (mutationPending.current || !confirmDiscardChanges(draftDirty)) return;
    setDrawerMessage("");
    setDrawerMode((current) => current.kind === "action"
      ? { kind: "account", account: current.account, audit: current.audit, canManage: current.canManage, loading: false }
      : current);
  }

  async function submitAction(payload: StaffActionPayload) {
    if (drawerMode.kind !== "action" || mutationPending.current) return;
    mutationPending.current = true;
    const current = drawerMode;
    setActionBusy(true);
    setDrawerMessage("");
    try {
    const response = await sensitiveFetch(`/api/admin/staff/${encodeURIComponent(current.account.userId)}`, {
      method: "PATCH",
      headers: await buildApiHeaders("admin", { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as StaffCreateResponse;
    if (!response.ok || !body.ok || !body.account || (payload.action === "reset_password" && (!body.temporaryPassword || !body.temporaryPasswordExpiresAt))) {
      setDrawerMessage(!response.ok && response.status < 500 && body.ok === false ? body.message || "The request was rejected. Review the details and try again." : "The change result could not be confirmed. Check the account status and audit history before retrying.");
      return;
    }
    setAccounts((accountsCurrent) => accountsCurrent.map((account) => account.userId === body.account!.userId ? body.account! : account));
    if (payload.action === "reset_password" && body.temporaryPassword && body.temporaryPasswordExpiresAt) {
      setDrawerMode({ kind: "handoff", account: body.account, password: body.temporaryPassword, expiresAt: body.temporaryPasswordExpiresAt });
      return;
    }
    setDrawerMode({ kind: "account", account: body.account, audit: body.audit ?? current.audit, canManage: current.canManage, loading: false });
    } catch {
      setDrawerMessage("The change result could not be confirmed. Check the account status and audit history before retrying.");
    } finally {
      mutationPending.current = false;
      setActionBusy(false);
    }
  }

  const drawerTitle = drawerMode.kind === "create"
    ? "Create staff account"
      : drawerMode.kind === "handoff"
      ? "Deliver one-time password"
      : drawerMode.kind === "action"
        ? staffActionTitle(drawerMode.action)
      : drawerMode.kind === "account"
        ? drawerMode.account.displayName || "Staff account"
        : "Staff account";
  const drawerSubtitle = drawerMode.kind === "account" || drawerMode.kind === "handoff" || drawerMode.kind === "action" ? drawerMode.account.email : "Administrator managed access";

  return (
    <section className="staff-operations-app">
      <aside className="staff-operations-sidebar">
        <WorkspaceBrand />
        <WorkspaceNavigation current="/admin/staff" label="Operations modules" />
        <p>Private Staff module<br />Administrator and Partner accounts only</p>
      </aside>
      <div className="staff-operations-workspace">
        <div className="staff-operations-topbar"><div><strong>Operations Desk</strong><span>Brisbane warehouse access</span></div><span>{viewerRole === "admin" ? "Administrator" : "Partner"}</span></div>
        <div className="staff-management-page">
      <header className="staff-management-header">
        <div><p className="eyebrow">Access administration</p><h1>Staff management</h1><p>Create, secure and maintain access for warehouse staff and partners.</p></div>
        {viewerRole === "admin" ? <button className="button button-primary" onClick={(event) => openCreate(event.currentTarget)} type="button">Create staff account</button> : <span className="staff-readonly-badge">Read-only partner view</span>}
      </header>

      {collectionState === "loading" ? (
        <section className="staff-collection-panel" aria-label="Loading Staff accounts"><div className="staff-loading-row" /><div className="staff-loading-row" /><div className="staff-loading-row" /></section>
      ) : collectionState === "error" ? (
        <section className="staff-collection-state" role="alert"><h2>Staff records could not be loaded</h2><p>No changes were made. Try again or provide support reference STF-LOAD-01.</p><button className="button button-secondary" onClick={() => void loadAccounts()} type="button">Try again</button></section>
      ) : (
        <>
          <StaffSummaryMetrics summary={summary} />
          <section className="staff-collection-panel">
            <div className="staff-register-heading"><div><h2>Staff register</h2><p>Open an account to review access and security details.</p></div><div className="staff-register-filters">
              <input aria-label="Search name or email" placeholder="Search name or email" value={filters.search} onChange={(event) => setListFilter("staffSearch", event.target.value)} />
              <select aria-label="Filter by role" value={filters.role} onChange={(event) => setListFilter("staffRole", event.target.value)}><option value="all">All roles</option><option value="warehouse_staff">Warehouse staff</option><option value="partner">Partner</option><option value="admin">Administrator</option></select>
              <select aria-label="Filter by status" value={filters.status} onChange={(event) => setListFilter("staffStatus", event.target.value)}><option value="all">All statuses</option><option value="pending_first_login">Pending first login</option><option value="active">Active</option><option value="disabled">Disabled</option></select>
            </div></div>
            {accounts.length === 0 ? <div className="staff-empty-state"><h3>No staff accounts yet</h3><p>{viewerRole === "admin" ? "Create the first warehouse staff or partner account." : "No Staff accounts are available to this partner view."}</p>{viewerRole === "admin" ? <button className="button button-primary" onClick={(event) => openCreate(event.currentTarget)} type="button">Create staff account</button> : null}</div> : filteredAccounts.length === 0 ? <div className="staff-empty-state"><h3>No matching staff accounts</h3><p>Change the search or filters and try again.</p></div> : <StaffRegister filterKey={JSON.stringify(filters)} accounts={filteredAccounts} viewerRole={viewerRole} onSelect={(userId, trigger) => void openAccount(userId, trigger)} />}
          </section>
        </>
      )}
      {drawerMode.kind !== "closed" ? (
        <StaffDrawer closeLocked={drawerMode.kind === "handoff" || createBusy || actionBusy} onClose={closeDrawer} returnFocusRef={selectedTrigger} subtitle={drawerSubtitle} title={drawerTitle}>
          {drawerMessage ? <p className="staff-drawer-message" role="alert">{drawerMessage}</p> : null}
          {drawerMode.kind === "account" ? drawerMode.loading ? <div className="staff-drawer-body"><p>Loading account details.</p></div> : <StaffAccountOverview account={drawerMode.account} audit={drawerMode.audit} canManage={drawerMode.canManage} onAction={openAction} viewerRole={viewerRole} /> : null}
          {drawerMode.kind === "create" ? <div className="staff-drawer-body"><StaffAccountForm busy={createBusy} onCancel={closeDrawer} onSubmit={createAccount} onDirtyChange={setDraftDirty} /></div> : null}
          {drawerMode.kind === "handoff" ? <StaffPasswordHandoff account={drawerMode.account} expiresAt={drawerMode.expiresAt} onFinish={closeDrawer} password={drawerMode.password} /> : null}
          {drawerMode.kind === "action" ? <div className="staff-drawer-body"><StaffActionForm account={drawerMode.account} action={drawerMode.action} busy={actionBusy} onCancel={cancelAction} onSubmit={submitAction} onDirtyChange={setDraftDirty} /></div> : null}
        </StaffDrawer>
      ) : null}
        </div>
      </div>
    </section>
  );
}
