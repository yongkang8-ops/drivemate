import type { AdminState } from "./repository";

export type AdminExportType =
  | "catalogue"
  | "reorder_alerts"
  | "orders"
  | "stock_movements"
  | "account_documents"
  | "lookup_requests"
  | "account_applications"
  | "trade_accounts"
  | "purchase_batches";

export const adminExportTypes: AdminExportType[] = [
  "catalogue",
  "reorder_alerts",
  "orders",
  "stock_movements",
  "account_documents",
  "lookup_requests",
  "account_applications",
  "trade_accounts",
  "purchase_batches",
];

type CsvValue = string | number | undefined | null;

function csvCell(value: CsvValue): string {
  const text = value === undefined || value === null ? "" : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function csv(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function isAdminExportType(value: string | null): value is AdminExportType {
  return adminExportTypes.includes(value as AdminExportType);
}

export function buildAdminCsvExport(state: AdminState, type: AdminExportType) {
  if (type === "catalogue") {
    return {
      fileName: "drivemate-catalogue-export.csv",
      csv: csv(
        [
          "sku",
          "barcode",
          "oem_part_number",
          "brand",
          "part_name",
          "category",
          "status",
          "trade_price_ex_gst_cents",
          "on_hand",
          "reserved",
          "quarantine",
          "available",
          "reorder_point",
          "reorder_quantity",
        ],
        state.catalogue.map((row) => [
          row.sku,
          row.barcode,
          row.oemPartNumber,
          row.brand,
          row.name,
          row.category,
          row.status,
          row.tradePriceExGstCents,
          row.onHand,
          row.reserved,
          row.quarantine,
          row.available,
          row.reorderPoint,
          row.reorderQuantity,
        ]),
      ),
    };
  }

  if (type === "reorder_alerts") {
    return {
      fileName: "drivemate-reorder-alerts-export.csv",
      csv: csv(
        ["sku", "brand", "part_name", "available", "reorder_point", "suggested_order_qty", "status"],
        state.reorderAlerts.map((row) => [
          row.sku,
          row.brand,
          row.name,
          row.available,
          row.reorderPoint,
          row.suggestedOrderQty,
          row.status,
        ]),
      ),
    };
  }

  if (type === "orders") {
    return {
      fileName: "drivemate-orders-export.csv",
      csv: csv(
        [
          "order_id",
          "trade_account_id",
          "status",
          "po_number",
          "vehicle_rego",
          "vehicle_vin",
          "line_count",
          "line_summary",
          "subtotal_ex_gst_cents",
          "gst_cents",
          "total_inc_gst_cents",
          "created_by",
          "created_at",
        ],
        state.orders.map((order) => [
          order.id,
          order.tradeAccountId,
          order.status,
          order.poNumber,
          order.vehicleRego,
          order.vehicleVin,
          order.lines.length,
          order.lines.map((line) => `${line.sku} x ${line.quantity}`).join("; "),
          order.subtotalExGstCents,
          order.gstCents,
          order.totalIncGstCents,
          order.createdBy,
          order.createdAt,
        ]),
      ),
    };
  }

  if (type === "stock_movements") {
    return {
      fileName: "drivemate-stock-movements-export.csv",
      csv: csv(
        ["movement_id", "sku", "movement", "quantity", "location", "reference", "created_by", "created_at"],
        state.stockMovements.map((movement) => [
          movement.id,
          movement.sku,
          movement.movement,
          movement.quantity,
          movement.location,
          movement.reference,
          movement.createdBy,
          movement.createdAt,
        ]),
      ),
    };
  }

  if (type === "account_documents") {
    return {
      fileName: "drivemate-account-documents-export.csv",
      csv: csv(
        ["document_id", "trade_account_id", "type", "reference", "storage_path", "created_at"],
        state.accountDocuments.map((document) => [
          document.id,
          document.tradeAccountId,
          document.type,
          document.reference,
          document.storagePath,
          document.createdAt,
        ]),
      ),
    };
  }

  if (type === "lookup_requests") {
    return {
      fileName: "drivemate-lookup-requests-export.csv",
      csv: csv(
        ["lookup_id", "trade_account_id", "rego", "vin", "query", "vehicle", "match_count", "confidence", "created_by", "created_at"],
        state.lookupRequests.map((request) => [
          request.id,
          request.tradeAccountId,
          request.rego,
          request.vin,
          request.query,
          request.vehicle,
          request.matchCount,
          request.confidence,
          request.createdBy,
          request.createdAt,
        ]),
      ),
    };
  }

  if (type === "purchase_batches") {
    return {
      fileName: "drivemate-purchase-batches-export.csv",
      csv: csv(
        ["batch_no", "sku", "received_quantity", "supplier", "purchase_ref", "received_date"],
        state.purchaseBatches.map((batch) => [
          batch.batchNo,
          batch.sku,
          batch.receivedQuantity,
          batch.supplierName,
          batch.purchaseRef,
          batch.receivedDate,
        ]),
      ),
    };
  }

  if (type === "account_applications") {
    return {
      fileName: "drivemate-account-applications-export.csv",
      csv: csv(
        ["application_id", "business", "abn", "contact", "email", "phone", "postcode", "status"],
        state.accountApplications.map((application) => [
          application.id,
          application.accountName,
          application.abn,
          application.contactName,
          application.contactEmail,
          application.contactPhone,
          application.postcode,
          application.status,
        ]),
      ),
    };
  }

  return {
    fileName: "drivemate-trade-accounts-export.csv",
    csv: csv(
      ["trade_account_id", "business", "abn", "contact", "email", "phone", "postcode", "status"],
      state.tradeAccounts.map((account) => [
        account.id,
        account.accountName,
        account.abn,
        account.contactName,
        account.contactEmail,
        account.contactPhone,
        account.postcode,
        account.status,
      ]),
    ),
  };
}
