"use client";

import { useEffect, useRef, useState } from "react";
import { buildApiHeaders } from "../lib/clientAuth";
import { useSensitiveFetch } from "./MfaStepUpProvider";
import type { ProductLabelProfile } from "../lib/productLabelProfile";
import { ProductLabelProfileFields } from "./ProductLabelProfileFields";

type AdminState = {
  metrics: {
    activeSkus: number;
    onHandUnits: number;
    availableUnits: number;
    reorderAlerts: number;
    openTasks: number;
  };
  catalogue: Array<{
    labelProfile?: ProductLabelProfile | null;
    sku: string;
    barcode?: string;
    oemPartNumber?: string;
    brand: string;
    name: string;
    category: string;
    status: "active" | "draft" | "paused";
    reorderPoint: number;
    reorderQuantity: number;
    tradePriceExGstCents?: number;
    onHand: number;
    reserved: number;
    quarantine: number;
    available: number;
  }>;
  reorderAlerts: Array<{
    sku: string;
    brand: string;
    name: string;
    available: number;
    reorderPoint: number;
    suggestedOrderQty: number;
    status: "active" | "draft" | "paused";
  }>;
  stockMovements: Array<{
    id: string;
    sku: string;
    movement: string;
    quantity: number;
    location: string;
    reference: string;
    createdBy?: string;
  }>;
  orders: Array<{
    id: string;
    tradeAccountId?: string;
    status: string;
    poNumber?: string;
    createdBy?: string;
    subtotalExGstCents?: number;
    gstCents?: number;
    totalIncGstCents?: number;
    lines: Array<{ sku: string; quantity: number; lineTotalIncGstCents?: number }>;
  }>;
  accountDocuments: Array<{
    id: string;
    tradeAccountId: string;
    type: "invoice" | "statement" | "delivery_record";
    reference: string;
    storagePath?: string;
    createdAt: string;
  }>;
  accountApplications: Array<{
    id: string;
    accountName: string;
    abn?: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    postcode?: string;
    status: string;
  }>;
  tradeAccounts: Array<{
    id: string;
    accountName: string;
    abn?: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    postcode?: string;
    status: "pending" | "approved" | "paused" | "closed";
  }>;
  fitmentRules: Array<{
    sku: string;
    vehicle: string;
    engine?: string;
    confidence: string;
  }>;
  purchaseBatches: Array<{
    batchNo: string;
    sku: string;
    receivedQuantity?: number;
    supplierName?: string;
    purchaseRef?: string;
    receivedDate?: string;
  }>;
  pricingRules: Array<{
    id: string;
    sku: string;
    channel: string;
    priceMode: string;
    unitPriceExGstCents?: number;
    status: string;
  }>;
  rfqReviews: Array<{
    id: string;
    brand: string;
    vehicle: string;
    requestedPart: string;
    priority: string;
    status: string;
  }>;
  lookupRequests: Array<{
    id: string;
    tradeAccountId?: string;
    rego?: string;
    vin?: string;
    query?: string;
    vehicle: string;
    matchCount: number;
    confidence: "exact" | "manual_review";
    createdBy?: string;
    createdAt: string;
  }>;
  userRoles: Array<{
    userId: string;
    role: string;
    displayName?: string;
    tradeAccountId?: string;
  }>;
};

type BulkImportRow = {
  sku: string;
  brand: "GWM" | "BYD" | "MG";
  name: string;
  category: string;
  barcode: string;
  oemPartNumber?: string;
  reorderPoint?: number;
  reorderQuantity?: number;
  status: "active" | "draft" | "paused";
};

type BulkFitmentRow = {
  sku: string;
  make: string;
  model: string;
  yearFrom: number;
  yearTo?: number;
  engine?: string;
  confidence: "exact" | "likely" | "confirm_vin";
};

const emptyState: AdminState = {
  metrics: { activeSkus: 0, onHandUnits: 0, availableUnits: 0, reorderAlerts: 0, openTasks: 0 },
  catalogue: [],
  reorderAlerts: [],
  stockMovements: [],
  orders: [],
  accountDocuments: [],
  accountApplications: [],
  tradeAccounts: [],
  fitmentRules: [],
  purchaseBatches: [],
  pricingRules: [],
  rfqReviews: [],
  lookupRequests: [],
  userRoles: [],
};

function formatMoney(value: number | undefined) {
  if (value === undefined) return "Not priced";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value / 100);
}

export function AdminDashboard() {
  const sensitiveFetch = useSensitiveFetch();
  const [state, setState] = useState<AdminState>(emptyState);
  const [message, setMessage] = useState("Loading operating state.");
  const [masterSku, setMasterSku] = useState("");
  const [masterBarcode, setMasterBarcode] = useState("");
  const [masterOemPartNumber, setMasterOemPartNumber] = useState("");
  const [masterReorderPoint, setMasterReorderPoint] = useState("0");
  const [masterReorderQuantity, setMasterReorderQuantity] = useState("0");
  const [masterStatus, setMasterStatus] = useState<"active" | "draft" | "paused">("draft");
  const [newSku, setNewSku] = useState("");
  const [newBrand, setNewBrand] = useState<"GWM" | "BYD" | "MG">("GWM");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Service Filter");
  const [newBarcode, setNewBarcode] = useState("");
  const [newOemPartNumber, setNewOemPartNumber] = useState("");
  const [newReorderPoint, setNewReorderPoint] = useState("0");
  const [newReorderQuantity, setNewReorderQuantity] = useState("0");
  const [newStatus, setNewStatus] = useState<"active" | "draft" | "paused">("draft");
  const [fitmentSku, setFitmentSku] = useState("");
  const [fitmentMake, setFitmentMake] = useState("GWM");
  const [fitmentModel, setFitmentModel] = useState("Cannon Alpha");
  const [fitmentYearFrom, setFitmentYearFrom] = useState("2024");
  const [fitmentYearTo, setFitmentYearTo] = useState("");
  const [fitmentEngine, setFitmentEngine] = useState("GW4D24");
  const [fitmentConfidence, setFitmentConfidence] = useState<"exact" | "likely" | "confirm_vin">("confirm_vin");
  const [bulkSkuCsv, setBulkSkuCsv] = useState(
    "sku,brand,name,category,barcode,oemPartNumber,reorderPoint,reorderQuantity,status\nDM-GWM-NEW-099,GWM,Genuine Service Part,Service Filter,DMPGWMNEW099,GWM-OEM-NEW-099,8,24,draft",
  );
  const [bulkFitmentCsv, setBulkFitmentCsv] = useState(
    "sku,make,model,yearFrom,yearTo,engine,confidence\nDM-GWM-NEW-099,GWM,Cannon Alpha,2024,,GW4D24,confirm_vin",
  );
  const masterInitialized = useRef(false);
  const [masterLabelProfile, setMasterLabelProfile] = useState<ProductLabelProfile | null>(null);
  const masterEditorRef = useRef<HTMLDivElement>(null);
  const masterBarcodeRef = useRef<HTMLInputElement>(null);
  const [masterEditRequest, setMasterEditRequest] = useState(0);

  useEffect(() => {
    if (!masterEditRequest) return;
    masterBarcodeRef.current?.focus({ preventScroll: true });
    masterEditorRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [masterEditRequest]);

  function loadProductMaster(row: AdminState["catalogue"][number]) {
    setMasterLabelProfile(row.labelProfile ?? null);
    setMasterSku(row.sku);
    setMasterBarcode(row.barcode ?? "");
    setMasterOemPartNumber(row.oemPartNumber ?? "");
    setMasterReorderPoint(String(row.reorderPoint));
    setMasterReorderQuantity(String(row.reorderQuantity));
    setMasterStatus(row.status);
  }

  async function refresh() {
    const response = await fetch("/api/admin-state", { headers: await buildApiHeaders("admin") });
    if (!response.ok) {
      setMessage("Admin state could not be loaded.");
      return;
    }

    const nextState = (await response.json()) as AdminState;
    setState(nextState);
    if (!masterInitialized.current && nextState.catalogue[0]) {
      loadProductMaster(nextState.catalogue[0]);
      setFitmentSku(nextState.catalogue[0].sku);
      masterInitialized.current = true;
    }
    setMessage("Operating state refreshed.");
  }

  async function approveApplication(applicationId: string) {
    const response = await sensitiveFetch(`/api/trade-account-applications/${applicationId}/approve`, {
      method: "POST",
      headers: await buildApiHeaders("admin", { "Idempotency-Key": crypto.randomUUID() }),
    });

    const body = (await response.json()) as
      | { ok: true; application: { id: string; accountName: string; status: string } }
      | { ok: false; message: string };

    if (!response.ok || !body.ok) {
      setMessage("message" in body ? body.message : "Trade account application could not be approved.");
      return;
    }

    await refresh();
    setMessage(`Trade account ${body.application.accountName} approved.`);
  }

  async function provisionLogin(applicationId: string) {
    const response = await sensitiveFetch(`/api/trade-account-applications/${applicationId}/provision-login`, {
      method: "POST",
      headers: await buildApiHeaders("admin"),
    });

    const body = (await response.json()) as
      | {
          ok: true;
          application: { id: string; accountName: string; status: string };
          login: { email: string; created: boolean; setupEmailSent: boolean };
        }
      | { ok: false; message: string };

    if (!response.ok || !body.ok) {
      setMessage("message" in body ? body.message : "Trade account login could not be provisioned.");
      return;
    }

    await refresh();
    setMessage(`Login provisioned for ${body.login.email}. Password setup email sent.`);
  }

  async function updateTradeAccountStatus(
    applicationId: string,
    status: "pending" | "approved" | "paused" | "closed",
  ) {
    const response = await sensitiveFetch(`/api/trade-account-applications/${applicationId}/status`, {
      method: "PATCH",
      headers: await buildApiHeaders("admin", { "Content-Type": "application/json" }),
      body: JSON.stringify({ status }),
    });

    const body = (await response.json()) as
      | { ok: true; application: { id: string; accountName: string; status: string } }
      | { ok: false; message: string };

    if (!response.ok || !body.ok) {
      setMessage("message" in body ? body.message : "Trade account status could not be updated.");
      return;
    }

    await refresh();
    setMessage(`Trade account ${body.application.accountName} set to ${body.application.status}.`);
  }

  async function cancelOrder(orderId: string) {
    const response = await sensitiveFetch(`/api/orders/${orderId}/cancel`, {
      method: "POST",
      headers: await buildApiHeaders("admin", { "Idempotency-Key": crypto.randomUUID() }),
    });

    const body = (await response.json()) as
      | { ok: true; order: { id: string; status: string } }
      | { ok: false; message: string };

    if (!response.ok || !body.ok) {
      setMessage("message" in body ? body.message : "Order could not be cancelled.");
      return;
    }

    await refresh();
    setMessage(`Order ${body.order.id} cancelled and reserved stock released.`);
  }

  async function saveProductMaster() {
    const response = await sensitiveFetch(`/api/products/${encodeURIComponent(masterSku)}`, {
      method: "PATCH",
      headers: await buildApiHeaders("admin", { "Content-Type": "application/json" }),
      body: JSON.stringify({
        barcode: masterBarcode,
        labelProfile: masterLabelProfile,
        oemPartNumber: masterOemPartNumber,
        reorderPoint: Number.parseInt(masterReorderPoint, 10),
        reorderQuantity: Number.parseInt(masterReorderQuantity, 10),
        status: masterStatus,
      }),
    });

    const body = (await response.json()) as
      | { ok: true; product: AdminState["catalogue"][number] }
      | { ok: false; message: string }
      | { error: unknown };

    if (!response.ok || !("ok" in body) || !body.ok) {
      setMessage("message" in body ? body.message : "Product master update could not be saved.");
      return;
    }

    setState((current) => ({
      ...current,
      catalogue: current.catalogue.map((row) => (row.sku === body.product.sku ? body.product : row)),
    }));
    await refresh();
    setMessage(`${body.product.sku} master data saved.`);
  }

  async function createProductMaster() {
    const response = await sensitiveFetch("/api/products", {
      method: "POST",
      headers: await buildApiHeaders("admin", { "Content-Type": "application/json" }),
      body: JSON.stringify({
        sku: newSku,
        brand: newBrand,
        name: newName,
        category: newCategory,
        barcode: newBarcode,
        oemPartNumber: newOemPartNumber,
        reorderPoint: Number.parseInt(newReorderPoint, 10),
        reorderQuantity: Number.parseInt(newReorderQuantity, 10),
        status: newStatus,
      }),
    });

    const body = (await response.json()) as
      | { ok: true; product: AdminState["catalogue"][number] }
      | { ok: false; message: string }
      | { error: unknown };

    if (!response.ok || !("ok" in body) || !body.ok) {
      setMessage("message" in body ? body.message : "Product master could not be created.");
      return;
    }

    setState((current) => {
      const withoutExisting = current.catalogue.filter((row) => row.sku !== body.product.sku);
      return {
        ...current,
        catalogue: [...withoutExisting, body.product].sort((a, b) => a.sku.localeCompare(b.sku)),
        metrics: {
          ...current.metrics,
          activeSkus: body.product.status === "active" ? current.metrics.activeSkus + 1 : current.metrics.activeSkus,
        },
      };
    });
    loadProductMaster(body.product);
    await refresh();
    setFitmentSku(body.product.sku);
    setNewSku("");
    setNewBarcode("");
    setNewOemPartNumber("");
    setNewReorderPoint("0");
    setNewReorderQuantity("0");
    setNewName("");
    setNewStatus("draft");
    setMessage(`${body.product.sku} master data created.`);
  }

  async function createFitmentRule() {
    const response = await sensitiveFetch("/api/fitment-rules", {
      method: "POST",
      headers: await buildApiHeaders("admin", { "Content-Type": "application/json" }),
      body: JSON.stringify({
        sku: fitmentSku,
        make: fitmentMake,
        model: fitmentModel,
        yearFrom: Number.parseInt(fitmentYearFrom, 10),
        yearTo: fitmentYearTo ? Number.parseInt(fitmentYearTo, 10) : undefined,
        engine: fitmentEngine,
        confidence: fitmentConfidence,
      }),
    });

    const body = (await response.json()) as
      | { ok: true; rule: AdminState["fitmentRules"][number] }
      | { ok: false; message: string }
      | { error: unknown };

    if (!response.ok || !("ok" in body) || !body.ok) {
      setMessage("message" in body ? body.message : "Fitment rule could not be created.");
      return;
    }

    setState((current) => ({
      ...current,
      fitmentRules: [body.rule, ...current.fitmentRules],
    }));
    setMessage(`${body.rule.sku} fitment rule created.`);
  }

  function parseBulkSkuRows(input: string): BulkImportRow[] {
    const lines = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return [];

    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const firstCells = lines[0].split(delimiter).map((cell) => cell.trim().toLowerCase().replace(/[\s_-]/g, ""));
    const hasHeader = firstCells.includes("sku");
    const columns = hasHeader
      ? firstCells
      : ["sku", "brand", "name", "category", "barcode", "oempartnumber", "status"];
    const dataLines = hasHeader ? lines.slice(1) : lines;

    return dataLines.map((line, index) => {
      const cells = line.split(delimiter).map((cell) => cell.trim());
      const get = (...keys: string[]) => {
        const normalizedKeys = keys.map((key) => key.replace(/[\s_-]/g, "").toLowerCase());
        const columnIndex = columns.findIndex((column) => normalizedKeys.includes(column));
        return columnIndex >= 0 ? cells[columnIndex] ?? "" : "";
      };
      const rowNumber = hasHeader ? index + 2 : index + 1;
      const sku = get("sku").toUpperCase();
      const brand = get("brand").toUpperCase();
      const name = get("name", "part", "partName");
      const category = get("category");
      const barcode = get("barcode");
      const reorderPointRaw = get("reorderPoint", "reorder_point", "minStock", "minimumStock");
      const reorderQuantityRaw = get("reorderQuantity", "reorder_quantity", "orderQty", "suggestedOrderQty");
      const reorderPoint = reorderPointRaw ? Number.parseInt(reorderPointRaw, 10) : undefined;
      const reorderQuantity = reorderQuantityRaw ? Number.parseInt(reorderQuantityRaw, 10) : undefined;
      const status = (get("status") || "draft").toLowerCase();

      if (!sku || !name || !category || !barcode) {
        throw new Error(`Row ${rowNumber} must include sku, name, category and barcode.`);
      }
      if (!["GWM", "BYD", "MG"].includes(brand)) {
        throw new Error(`Row ${rowNumber} brand must be GWM, BYD or MG.`);
      }
      if (!["active", "draft", "paused"].includes(status)) {
        throw new Error(`Row ${rowNumber} status must be active, draft or paused.`);
      }
      if (reorderPointRaw && (!Number.isInteger(reorderPoint) || (reorderPoint ?? 0) < 0)) {
        throw new Error(`Row ${rowNumber} reorderPoint must be zero or a positive integer.`);
      }
      if (reorderQuantityRaw && (!Number.isInteger(reorderQuantity) || (reorderQuantity ?? 0) < 0)) {
        throw new Error(`Row ${rowNumber} reorderQuantity must be zero or a positive integer.`);
      }

      return {
        sku,
        brand: brand as BulkImportRow["brand"],
        name,
        category,
        barcode,
        oemPartNumber: get("oemPartNumber", "oem_part_number", "oem") || undefined,
        reorderPoint,
        reorderQuantity,
        status: status as BulkImportRow["status"],
      };
    });
  }

  async function importProductMasters() {
    let rows: BulkImportRow[];
    try {
      rows = parseBulkSkuRows(bulkSkuCsv);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "SKU import content could not be parsed.");
      return;
    }

    if (!rows.length) {
      setMessage("Paste at least one SKU row before importing.");
      return;
    }

    const response = await sensitiveFetch("/api/products/import", {
      method: "POST",
      headers: await buildApiHeaders("admin", { "Content-Type": "application/json" }),
      body: JSON.stringify({ rows }),
    });

    const body = (await response.json()) as
      | {
          ok: boolean;
          summary: { created: number; updated: number; failed: number };
          failures: Array<{ row: number; sku: string; message: string }>;
        }
      | { ok: false; message: string }
      | { error: unknown };

    if (!response.ok || !("summary" in body)) {
      setMessage("message" in body ? body.message : "SKU import could not be completed.");
      return;
    }

    await refresh();
    const failureNote = body.failures.length
      ? ` ${body.failures.length} failed; first issue: ${body.failures[0].sku} ${body.failures[0].message}.`
      : "";
    setMessage(`SKU import complete: ${body.summary.created} created, ${body.summary.updated} updated.${failureNote}`);
  }

  function parseBulkFitmentRows(input: string): BulkFitmentRow[] {
    const lines = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return [];

    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const firstCells = lines[0].split(delimiter).map((cell) => cell.trim().toLowerCase().replace(/[\s_-]/g, ""));
    const hasHeader = firstCells.includes("sku");
    const columns = hasHeader ? firstCells : ["sku", "make", "model", "yearfrom", "yearto", "engine", "confidence"];
    const dataLines = hasHeader ? lines.slice(1) : lines;

    return dataLines.map((line, index) => {
      const cells = line.split(delimiter).map((cell) => cell.trim());
      const get = (...keys: string[]) => {
        const normalizedKeys = keys.map((key) => key.replace(/[\s_-]/g, "").toLowerCase());
        const columnIndex = columns.findIndex((column) => normalizedKeys.includes(column));
        return columnIndex >= 0 ? cells[columnIndex] ?? "" : "";
      };
      const rowNumber = hasHeader ? index + 2 : index + 1;
      const yearFrom = Number.parseInt(get("yearFrom"), 10);
      const yearToRaw = get("yearTo");
      const yearTo = yearToRaw ? Number.parseInt(yearToRaw, 10) : undefined;
      const confidence = get("confidence") || "confirm_vin";

      if (!get("sku") || !get("make") || !get("model") || !Number.isInteger(yearFrom)) {
        throw new Error(`Row ${rowNumber} must include sku, make, model and yearFrom.`);
      }
      if (yearToRaw && !Number.isInteger(yearTo)) {
        throw new Error(`Row ${rowNumber} yearTo must be a valid year or blank.`);
      }
      if (!["exact", "likely", "confirm_vin"].includes(confidence)) {
        throw new Error(`Row ${rowNumber} confidence must be exact, likely or confirm_vin.`);
      }

      return {
        sku: get("sku").toUpperCase(),
        make: get("make"),
        model: get("model"),
        yearFrom,
        yearTo,
        engine: get("engine") || undefined,
        confidence: confidence as BulkFitmentRow["confidence"],
      };
    });
  }

  async function importFitmentRules() {
    let rows: BulkFitmentRow[];
    try {
      rows = parseBulkFitmentRows(bulkFitmentCsv);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fitment import content could not be parsed.");
      return;
    }

    if (!rows.length) {
      setMessage("Paste at least one fitment row before importing.");
      return;
    }

    const response = await sensitiveFetch("/api/fitment-rules/import", {
      method: "POST",
      headers: await buildApiHeaders("admin", { "Content-Type": "application/json" }),
      body: JSON.stringify({ rows }),
    });

    const body = (await response.json()) as
      | {
          ok: boolean;
          summary: { created: number; failed: number };
          failures: Array<{ row: number; sku: string; message: string }>;
        }
      | { ok: false; message: string }
      | { error: unknown };

    if (!response.ok || !("summary" in body)) {
      setMessage("message" in body ? body.message : "Fitment import could not be completed.");
      return;
    }

    await refresh();
    const failureNote = body.failures.length
      ? ` ${body.failures.length} failed; first issue: ${body.failures[0].sku} ${body.failures[0].message}.`
      : "";
    setMessage(`Fitment import complete: ${body.summary.created} created.${failureNote}`);
  }

  async function downloadExport(
    type:
      | "catalogue"
      | "reorder_alerts"
      | "orders"
      | "stock_movements"
      | "account_documents"
      | "lookup_requests"
      | "account_applications"
      | "trade_accounts"
      | "purchase_batches",
  ) {
    const response = await fetch(`/api/admin-export?type=${type}`, {
      headers: await buildApiHeaders("admin"),
    });

    if (!response.ok) {
      setMessage("Admin export could not be downloaded.");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `drivemate-${type.replace(/_/g, "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMessage(`${type.replace(/_/g, " ")} export downloaded.`);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const managedTradeAccounts = state.tradeAccounts.filter((account) => account.status !== "pending");

  return (
    <>
      <section className="metric-grid" id="overview" style={{ marginTop: 18 }}>
        <article className="metric">
          <span>Active SKUs</span>
          <strong>{state.metrics.activeSkus}</strong>
        </article>
        <article className="metric">
          <span>On-hand units</span>
          <strong>{state.metrics.onHandUnits}</strong>
        </article>
        <article className="metric">
          <span>Available units</span>
          <strong>{state.metrics.availableUnits}</strong>
        </article>
        <article className="metric">
          <span>Reorder alerts</span>
          <strong>{state.metrics.reorderAlerts}</strong>
        </article>
        <article className="metric">
          <span>Open tasks</span>
          <strong>{state.metrics.openTasks}</strong>
        </article>
      </section>

      <p>
        <button className="primary-button" onClick={refresh} type="button">
          Refresh admin state
        </button>{" "}
        <span className="badge" role="status">
          {message}
        </span>
      </p>

      <section className="table-shell" style={{ marginTop: 18 }}>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Brand</th>
              <th>Part</th>
              <th>Available</th>
              <th>Reorder point</th>
              <th>Suggested order</th>
            </tr>
          </thead>
          <tbody>
            {state.reorderAlerts.length ? (
              state.reorderAlerts.map((alert) => (
                <tr key={alert.sku}>
                  <td>{alert.sku}</td>
                  <td>{alert.brand}</td>
                  <td>{alert.name}</td>
                  <td>{alert.available}</td>
                  <td>{alert.reorderPoint}</td>
                  <td>{alert.suggestedOrderQty}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>No active SKUs are below reorder point.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel" id="reports" style={{ marginTop: 18 }}>
        <h2>Operating exports</h2>
        <p>Download CSV snapshots for stock review, order follow-up, warehouse audit and account onboarding.</p>
        <p>
          <button className="secondary-button" onClick={() => void downloadExport("catalogue")} type="button">
            Export inventory
          </button>{" "}
          <button className="secondary-button" onClick={() => void downloadExport("reorder_alerts")} type="button">
            Export reorder alerts
          </button>{" "}
          <button className="secondary-button" onClick={() => void downloadExport("orders")} type="button">
            Export orders
          </button>{" "}
          <button className="secondary-button" onClick={() => void downloadExport("stock_movements")} type="button">
            Export movements
          </button>{" "}
          <button className="secondary-button" onClick={() => void downloadExport("account_documents")} type="button">
            Export documents
          </button>{" "}
          <button className="secondary-button" onClick={() => void downloadExport("lookup_requests")} type="button">
            Export lookups
          </button>{" "}
          <button className="secondary-button" onClick={() => void downloadExport("purchase_batches")} type="button">
            Export batches
          </button>{" "}
          <button className="secondary-button" onClick={() => void downloadExport("account_applications")} type="button">
            Export applications
          </button>{" "}
          <button className="secondary-button" onClick={() => void downloadExport("trade_accounts")} type="button">
            Export trade accounts
          </button>
        </p>
      </section>

      <section className="two-column" id="products" style={{ marginTop: 18 }}>
        <div className="table-shell" style={{ gridColumn: "1 / -1" }}>
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Barcode</th>
                <th>OEM</th>
                <th>Brand</th>
                <th>Part</th>
                <th>Status</th>
                <th>Trade price</th>
                <th>On hand</th>
                <th>Reserved</th>
                <th>Quarantine</th>
                <th>Available</th>
                <th>Reorder point</th>
                <th>Reorder qty</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {state.catalogue.map((row) => (
                <tr key={row.sku}>
                  <td>{row.sku}</td>
                  <td>{row.barcode ?? "Not mapped"}</td>
                  <td>{row.oemPartNumber ?? "Not mapped"}</td>
                  <td>{row.brand}</td>
                  <td>{row.name}</td>
                  <td>{row.status}</td>
                  <td>{formatMoney(row.tradePriceExGstCents)} ex GST</td>
                  <td>{row.onHand}</td>
                  <td>{row.reserved}</td>
                  <td>{row.quarantine}</td>
                  <td>{row.available}</td>
                  <td>{row.reorderPoint}</td>
                  <td>{row.reorderQuantity}</td>
                  <td>
                    <button className="secondary-button" onClick={() => { loadProductMaster(row); setMasterEditRequest((current) => current + 1); }} type="button">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel" id="sku-master-editor" ref={masterEditorRef} style={{ gridColumn: "1 / -1" }}>
          <h2>SKU master data</h2>
          <p>Maintain scanner fields used by receiving, putaway, dispatch and adjustment workflows.</p>
          <div className="form-grid">
            <label>
              SKU
              <select
                value={masterSku}
                onChange={(event) => {
                  const row = state.catalogue.find((item) => item.sku === event.target.value);
                  if (row) loadProductMaster(row);
                }}
              >
                {state.catalogue.map((row) => (
                  <option key={row.sku} value={row.sku}>
                    {row.sku}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Barcode
              <input ref={masterBarcodeRef} value={masterBarcode} onChange={(event) => setMasterBarcode(event.target.value)} />
            </label>
            <label>
              OEM part number
              <input value={masterOemPartNumber} onChange={(event) => setMasterOemPartNumber(event.target.value)} />
            </label>
            <label>
              Reorder point
              <input
                value={masterReorderPoint}
                type="number"
                min="0"
                onChange={(event) => setMasterReorderPoint(event.target.value)}
              />
            </label>
            <label>
              Reorder quantity
              <input
                value={masterReorderQuantity}
                type="number"
                min="0"
                onChange={(event) => setMasterReorderQuantity(event.target.value)}
              />
            </label>
            <label>
              Status
              <select
                value={masterStatus}
                onChange={(event) => setMasterStatus(event.target.value as "active" | "draft" | "paused")}
              >
                <option value="active">active</option>
                <option value="draft">draft</option>
                <option value="paused">paused</option>
              </select>
            </label>
          </div>
          <ProductLabelProfileFields value={masterLabelProfile} onChange={setMasterLabelProfile} sku={masterSku} barcode={masterBarcode} />
          <p>
            <button className="primary-button" onClick={() => void saveProductMaster()} type="button">
              Save SKU master
            </button>
          </p>
        </div>

        <div className="panel" style={{ gridColumn: "1 / -1" }}>
          <h2>Bulk SKU import</h2>
          <p>Paste CSV or tab-separated rows to create new SKU masters or update existing scanner fields.</p>
          <label>
            Import rows
            <textarea
              aria-label="Bulk SKU import rows"
              rows={6}
              value={bulkSkuCsv}
              onChange={(event) => setBulkSkuCsv(event.target.value)}
            />
          </label>
          <p>
            <button className="primary-button" onClick={() => void importProductMasters()} type="button">
              Import SKU masters
            </button>
          </p>
        </div>

        <div className="panel" style={{ gridColumn: "1 / -1" }}>
          <h2>Create SKU master</h2>
          <p>Add approved parts before the first receiving scan so warehouse movements resolve to a controlled SKU.</p>
          <div className="form-grid">
            <label>
              New SKU
              <input value={newSku} onChange={(event) => setNewSku(event.target.value)} placeholder="DM-GWM-NEW-099" />
            </label>
            <label>
              New brand
              <select value={newBrand} onChange={(event) => setNewBrand(event.target.value as "GWM" | "BYD" | "MG")}>
                <option value="GWM">GWM</option>
                <option value="BYD">BYD</option>
                <option value="MG">MG</option>
              </select>
            </label>
            <label>
              New part name
              <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Genuine Service Part" />
            </label>
            <label>
              New category
              <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} />
            </label>
            <label>
              New barcode
              <input value={newBarcode} onChange={(event) => setNewBarcode(event.target.value)} placeholder="DMPGWMNEW099" />
            </label>
            <label>
              New OEM part number
              <input value={newOemPartNumber} onChange={(event) => setNewOemPartNumber(event.target.value)} />
            </label>
            <label>
              New reorder point
              <input value={newReorderPoint} type="number" min="0" onChange={(event) => setNewReorderPoint(event.target.value)} />
            </label>
            <label>
              New reorder quantity
              <input value={newReorderQuantity} type="number" min="0" onChange={(event) => setNewReorderQuantity(event.target.value)} />
            </label>
            <label>
              New SKU status
              <select value={newStatus} onChange={(event) => setNewStatus(event.target.value as "active" | "draft" | "paused")}>
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="paused">paused</option>
              </select>
            </label>
          </div>
          <p>
            <button className="primary-button" onClick={() => void createProductMaster()} type="button">
              Create SKU master
            </button>
          </p>
        </div>
      </section>

      <section className="two-column" style={{ marginTop: 18 }}>
        <div className="panel" style={{ gridColumn: "1 / -1" }}>
          <h2>Create fitment rule</h2>
          <p>Map stocked SKUs to AU vehicle profiles so trade portal lookup can return the part.</p>
          <div className="form-grid">
            <label>
              Fitment SKU
              <select value={fitmentSku} onChange={(event) => setFitmentSku(event.target.value)}>
                {state.catalogue.map((row) => (
                  <option key={row.sku} value={row.sku}>
                    {row.sku}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Make
              <input value={fitmentMake} onChange={(event) => setFitmentMake(event.target.value)} />
            </label>
            <label>
              Model
              <input value={fitmentModel} onChange={(event) => setFitmentModel(event.target.value)} />
            </label>
            <label>
              Year from
              <input
                value={fitmentYearFrom}
                type="number"
                min="1900"
                max="2100"
                onChange={(event) => setFitmentYearFrom(event.target.value)}
              />
            </label>
            <label>
              Year to
              <input
                value={fitmentYearTo}
                type="number"
                min="1900"
                max="2100"
                onChange={(event) => setFitmentYearTo(event.target.value)}
              />
            </label>
            <label>
              Engine
              <input value={fitmentEngine} onChange={(event) => setFitmentEngine(event.target.value)} />
            </label>
            <label>
              Fitment confidence
              <select
                value={fitmentConfidence}
                onChange={(event) => setFitmentConfidence(event.target.value as "exact" | "likely" | "confirm_vin")}
              >
                <option value="confirm_vin">confirm_vin</option>
                <option value="likely">likely</option>
                <option value="exact">exact</option>
              </select>
            </label>
          </div>
          <p>
            <button className="primary-button" onClick={() => void createFitmentRule()} type="button">
              Create fitment rule
            </button>
          </p>
        </div>

        <div className="panel" style={{ gridColumn: "1 / -1" }}>
          <h2>Bulk fitment import</h2>
          <p>Paste CSV or tab-separated fitment rows after SKU masters have been created.</p>
          <label>
            Import rows
            <textarea
              aria-label="Bulk fitment import rows"
              rows={6}
              value={bulkFitmentCsv}
              onChange={(event) => setBulkFitmentCsv(event.target.value)}
            />
          </label>
          <p>
            <button className="primary-button" onClick={() => void importFitmentRules()} type="button">
              Import fitment rules
            </button>
          </p>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Vehicle</th>
                <th>Engine</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {state.fitmentRules.length ? (
                state.fitmentRules.map((rule) => (
                  <tr key={`${rule.sku}-${rule.vehicle}-${rule.engine ?? "none"}`}>
                    <td>{rule.sku}</td>
                    <td>{rule.vehicle}</td>
                    <td>{rule.engine ?? "Any"}</td>
                    <td>{rule.confidence}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>No fitment rules loaded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Batch</th>
                <th>SKU</th>
                <th>Received qty</th>
                <th>Supplier</th>
                <th>Purchase ref</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {state.purchaseBatches.length ? (
                state.purchaseBatches.map((batch) => (
                  <tr key={`${batch.batchNo}-${batch.sku}`}>
                    <td>{batch.batchNo}</td>
                    <td>{batch.sku}</td>
                    <td>{batch.receivedQuantity ?? "Not tracked"}</td>
                    <td>{batch.supplierName ?? "Not supplied"}</td>
                    <td>{batch.purchaseRef ?? "Not supplied"}</td>
                    <td>{batch.receivedDate ?? "Pending"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No purchase batches loaded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="two-column" id="pricing" style={{ marginTop: 18 }}>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Rule</th>
                <th>SKU</th>
                <th>Channel</th>
                <th>Mode</th>
                <th>Unit price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.pricingRules.length ? (
                state.pricingRules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.id}</td>
                    <td>{rule.sku}</td>
                    <td>{rule.channel}</td>
                    <td>{rule.priceMode}</td>
                    <td>{formatMoney(rule.unitPriceExGstCents)} ex GST</td>
                    <td>{rule.status}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No pricing rules loaded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>RFQ</th>
                <th>Brand</th>
                <th>Vehicle</th>
                <th>Part</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.rfqReviews.length ? (
                state.rfqReviews.map((review) => (
                  <tr key={review.id}>
                    <td>{review.id}</td>
                    <td>{review.brand}</td>
                    <td>{review.vehicle}</td>
                    <td>{review.requestedPart}</td>
                    <td>{review.priority}</td>
                    <td>{review.status}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No RFQ reviews loaded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-shell" style={{ marginTop: 18 }}>
        <table>
          <thead>
            <tr>
              <th>Lookup</th>
              <th>Trade account</th>
              <th>Rego</th>
              <th>VIN</th>
              <th>Query</th>
              <th>Vehicle</th>
              <th>Matches</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {state.lookupRequests.length ? (
              state.lookupRequests.map((request) => (
                <tr key={request.id}>
                  <td>{request.id}</td>
                  <td>{request.tradeAccountId ?? "Not linked"}</td>
                  <td>{request.rego ?? "Not supplied"}</td>
                  <td>{request.vin ?? "Not supplied"}</td>
                  <td>{request.query ?? "Not supplied"}</td>
                  <td>{request.vehicle}</td>
                  <td>{request.matchCount}</td>
                  <td>{new Date(request.createdAt).toLocaleString("en-AU")}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>Workshop lookup demand will appear here after trade users search vehicles or parts.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="table-shell" id="accounts" style={{ marginTop: 18 }}>
        <table>
          <thead>
            <tr>
              <th>Trade account</th>
              <th>Business</th>
              <th>ABN</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {managedTradeAccounts.length ? (
              managedTradeAccounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.id}</td>
                  <td>{account.accountName}</td>
                  <td>{account.abn ?? "Not supplied"}</td>
                  <td>{account.contactName}</td>
                  <td>{account.contactEmail}</td>
                  <td>{account.contactPhone}</td>
                  <td>{account.status}</td>
                  <td>
                    {account.status === "approved" ? (
                      <button
                        className="secondary-button"
                        onClick={() => void updateTradeAccountStatus(account.id, "paused")}
                        type="button"
                      >
                        Pause
                      </button>
                    ) : account.status === "paused" ? (
                      <button
                        className="primary-button"
                        onClick={() => void updateTradeAccountStatus(account.id, "approved")}
                        type="button"
                      >
                        Reactivate
                      </button>
                    ) : (
                      <span>No action</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>No trade accounts loaded.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="table-shell" style={{ marginTop: 18 }}>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Name</th>
              <th>Trade account</th>
            </tr>
          </thead>
          <tbody>
            {state.userRoles.length ? (
              state.userRoles.map((user) => (
                <tr key={user.userId}>
                  <td>{user.userId}</td>
                  <td>{user.role}</td>
                  <td>{user.displayName ?? "Not supplied"}</td>
                  <td>{user.tradeAccountId ?? "None"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>No user roles loaded.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="table-shell" style={{ marginTop: 18 }}>
        <table>
          <thead>
            <tr>
              <th>Application</th>
              <th>Business</th>
              <th>ABN</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {state.accountApplications.length ? (
              state.accountApplications.map((application) => (
                <tr key={application.id}>
                  <td>{application.id}</td>
                  <td>{application.accountName}</td>
                  <td>{application.abn ?? "Not supplied"}</td>
                  <td>{application.contactName}</td>
                  <td>{application.contactEmail}</td>
                  <td>{application.contactPhone}</td>
                  <td>{application.status}</td>
                  <td>
                    <button
                      className="primary-button"
                      onClick={() => void approveApplication(application.id)}
                      type="button"
                    >
                      Approve
                    </button>{" "}
                    <button
                      className="secondary-button"
                      onClick={() => void provisionLogin(application.id)}
                      type="button"
                    >
                      Provision login
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>No pending account applications.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="two-column" id="orders" style={{ marginTop: 18 }}>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>PO</th>
                <th>Lines</th>
                <th>Total</th>
                <th>Created by</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {state.orders.length ? (
                state.orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td>{order.status}</td>
                    <td>{order.poNumber ?? "No PO"}</td>
                    <td>{order.lines.length}</td>
                    <td>{formatMoney(order.totalIncGstCents)} inc GST</td>
                    <td>{order.createdBy ?? "System"}</td>
                    <td>
                      <button
                        className="secondary-button"
                        disabled={["dispatched", "cancelled"].includes(order.status)}
                        onClick={() => void cancelOrder(order.id)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>No submitted orders in this session.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Movement</th>
                <th>Qty</th>
                <th>Location</th>
                <th>Reference</th>
                <th>Created by</th>
              </tr>
            </thead>
            <tbody>
              {state.stockMovements.length ? (
                state.stockMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{movement.sku}</td>
                    <td>{movement.movement}</td>
                    <td>{movement.quantity}</td>
                    <td>{movement.location}</td>
                    <td>{movement.reference}</td>
                    <td>{movement.createdBy ?? "System"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No stock movements in this session.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-shell" style={{ gridColumn: "1 / -1" }}>
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>Reference</th>
                <th>Trade account</th>
                <th>Storage path</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {state.accountDocuments.length ? (
                state.accountDocuments.map((document) => (
                  <tr key={document.id}>
                    <td>{document.id}</td>
                    <td>{document.type}</td>
                    <td>{document.reference}</td>
                    <td>{document.tradeAccountId}</td>
                    <td>{document.storagePath ?? "Generated"}</td>
                    <td>{document.createdAt}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No account documents generated yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
