import { createAccountDocumentText } from "./accountDocumentContent";
import type {
  CreateFitmentRuleInput,
  CreateProductMasterInput,
  FitmentRule,
  UpdateProductMasterInput,
} from "./catalogue";
import {
  demoUserRoles,
  pilotPricingRules,
  pilotRfqReviews,
} from "./adminMasterData";
import {
  matchCatalogueForVehicleProfile,
  type VehicleLookupInput,
  type VehicleProfile,
} from "./fitment";
import { availableStock, type InventoryRow } from "./inventory";
import {
  calculateOrderPricing,
  defaultPriceResolver,
  formatAudCents,
} from "./pricing";
import {
  validateDispatchScans,
  type CancelOrderInput,
  type CreateOrderInput,
  type DispatchOrderInput,
  type DispatchScanInput,
  type SalesOrder,
} from "./orders";
import {
  formatWarehouseLocation,
  parseWarehouseLocation,
  type WarehouseLocationParts,
} from "./warehouseLocation";
import { filterWarehouseExpectedReceipt, type WarehouseInboundSelection, type WarehouseLabelTemplateId } from "./warehouseLabels";
import type {
  PreparedReceiptLine,
  ReceiptDiscrepancy,
  WarehouseReceiptScope,
} from "./warehouseReceiving";
import {
  receiptFromPackingListRevision,
  validatePackingListRevision,
  type ValidatedPackingListRevision,
} from "./prearrivalShipment";
import type {
  ApproveTradeAccountApplicationResult,
  ProvisionTradeAccountLoginResult,
  TradeAccountApplicationInput,
  TradeAccountApplicationResult,
  TradeAccountStatus,
  UpdateTradeAccountStatusResult,
} from "./tradeAccounts";
import type {
  AdminState,
  AccountDocument,
  AccountDocumentAccessResult,
  CancelOrderResult,
  DispatchOrderResult,
  DrivemateRepository,
  InventoryMovementInput,
  InventoryMovementResult,
  RepositoryWriteContext,
  StockMovement,
  SubmitOrderResult,
  TradeAccountState,
  UpdateProductMasterResult,
  CreateProductMasterResult,
  CreateFitmentRuleResult,
  CreateWarehouseLabelPrintJobInput,
  CreateWarehouseLabelReprintInput,
  WarehouseLabelPrintAuditResult,
  WarehouseLabelPrintItem,
  WarehouseLabelPrintItemsResult,
  WarehouseLabelPrintJob,
  WarehouseLabelPrintJobResult,
  WarehouseLabelPrintJobStatus,
  WarehouseExpectedReceiptResult,
  WarehouseReceiptPrintGateResult,
  WarehouseReceiptSession,
  WarehouseReceiptSessionResult,
  CreateWarehouseReceiptSessionInput,
  PackingListRevision,
  PackingListRevisionResult,
  PrearrivalShipmentListResult,
  PrearrivalShipmentResult,
} from "./repository";
import { createServiceSupabaseClient } from "./supabaseClient";

type ProductRecord = {
  id: string;
  sku: string;
  brand: string;
  part_name: string;
  category: string;
  barcode?: string | null;
  oem_part_number?: string | null;
  reorder_point?: number | null;
  reorder_quantity?: number | null;
  status: "active" | "draft" | "paused";
};

type BalanceRecord = {
  id: string;
  product_id: string;
  location_id?: string;
  batch_id?: string;
  on_hand: number;
  reserved: number;
  quarantine: number;
};

type LocationRecord = {
  id?: string;
  warehouse: string;
  zone: string;
  bin_code: string;
};

type FitmentRuleRecord = {
  make: string;
  model: string;
  year_from?: number | null;
  year_to?: number | null;
  engine?: string | null;
  confidence: string;
  products?: { sku?: string } | { sku?: string }[];
};

type InventoryBatchRecord = {
  batch_no: string;
  supplier_name?: string | null;
  purchase_ref?: string | null;
  received_date?: string | null;
  products?: { sku?: string } | { sku?: string }[];
};

type InboundBatchMovementRecord = {
  quantity: number;
  products?: { sku?: string } | { sku?: string }[];
  inventory_batches?: { batch_no?: string } | { batch_no?: string }[] | null;
};

type MovementRecord = {
  id: string;
  movement_type: string;
  quantity: number;
  reference_type?: string | null;
  reference_id: string;
  created_at: string;
  created_by?: string | null;
  products?: { sku?: string } | { sku?: string }[];
  from_location?: LocationRecord | LocationRecord[] | null;
  to_location?: LocationRecord | LocationRecord[] | null;
};

type SalesOrderRecord = {
  id: string;
  trade_account_id: string;
  po_number?: string | null;
  vehicle_vin?: string | null;
  vehicle_rego?: string | null;
  status:
    "draft" | "submitted" | "confirmed" | "picked" | "dispatched" | "cancelled";
  subtotal_ex_gst_cents?: number | null;
  gst_cents?: number | null;
  total_inc_gst_cents?: number | null;
  delivery_charge_ex_gst_cents?: number | null;
  carrier?: string | null;
  tracking_number?: string | null;
  dispatched_at?: string | null;
  payment_due_at?: string | null;
  invoice_status?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  sales_order_lines?: Array<{
    product_id?: string;
    products?: { sku?: string } | { sku?: string }[];
    quantity: number;
    unit_price_ex_gst_cents?: number | null;
    line_total_ex_gst_cents?: number | null;
    gst_cents?: number | null;
    line_total_inc_gst_cents?: number | null;
  }>;
};

type AccountDocumentRecord = {
  id: string;
  trade_account_id: string;
  document_type:
    | "order_confirmation"
    | "invoice"
    | "credit_note"
    | "statement"
    | "delivery_record";
  document_ref: string;
  storage_path: string;
  created_at: string;
};

type TradeAccountRecord = {
  id: string;
  account_name: string;
  abn?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  postcode?: string | null;
  notes?: string | null;
  status: "pending" | "approved" | "paused" | "closed";
  created_at: string;
};

type PricingRuleRecord = {
  id: string;
  sku: string;
  channel: string;
  price_mode: string;
  unit_price_ex_gst_cents?: number | null;
  status: string;
};

type RfqReviewRecord = {
  id: string;
  brand: string;
  vehicle: string;
  requested_part: string;
  priority: string;
  status: string;
};

type LookupRequestRecord = {
  id: string;
  trade_account_id?: string | null;
  rego?: string | null;
  vin?: string | null;
  query?: string | null;
  vehicle: string;
  match_count: number;
  confidence: "exact" | "manual_review";
  created_by?: string | null;
  created_at: string;
};

type UserProfileRecord = {
  id: string;
  role: string;
  display_name?: string | null;
  trade_account_id?: string | null;
};

type WarehouseLabelPrintJobRecord = {
  id: string;
  template_id: WarehouseLabelTemplateId;
  payload_snapshot: Record<string, unknown>;
  requested_quantity: number;
  status: WarehouseLabelPrintJobStatus;
  created_by?: string | null;
  created_at: string;
  printed_at?: string | null;
  cancelled_at?: string | null;
  reprint_of_job_id?: string | null;
  reprint_reason?: string | null;
};

type WarehouseLabelPrintItemRecord = {
  id: string;
  job_id: string;
  sequence: number;
  payload_snapshot: Record<string, unknown>;
  created_at: string;
};

type PackingListRevisionRecord = {
  id: string;
  shipment_id: string;
  version: number;
  status: PackingListRevision["status"];
  payload_snapshot: ValidatedPackingListRevision;
  created_by?: string | null;
  created_at: string;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
};

type WarehouseReceiptSessionRecord = {
  id: string;
  shipment_id: string;
  scope_snapshot: WarehouseReceiptScope;
  mode: WarehouseReceiptSession["mode"];
  status: WarehouseReceiptSession["status"];
  idempotency_key: string;
  created_by?: string | null;
  created_at: string;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  staging_location?: string | null;
};

type WarehouseReceiptSessionLineRecord = {
  id: string;
  receipt_session_id: string;
  sku: string;
  product_barcode: string;
  expected_quantity: number;
  actual_quantity: number;
  warehouse_receipt_discrepancies?: Array<{
    discrepancy_type: ReceiptDiscrepancy["type"];
    reason: string;
  }> | null;
};

function toWarehouseLabelPrintJob(record: WarehouseLabelPrintJobRecord): WarehouseLabelPrintJob {
  return {
    id: record.id,
    templateId: record.template_id,
    payloadSnapshot: structuredClone(record.payload_snapshot),
    requestedQuantity: record.requested_quantity,
    status: record.status,
    createdBy: record.created_by ?? undefined,
    createdAt: record.created_at,
    printedAt: record.printed_at ?? undefined,
    cancelledAt: record.cancelled_at ?? undefined,
    reprintOfJobId: record.reprint_of_job_id ?? undefined,
    reprintReason: record.reprint_reason ?? undefined,
  };
}

function toWarehouseLabelPrintItem(record: WarehouseLabelPrintItemRecord): WarehouseLabelPrintItem {
  return {
    id: record.id,
    jobId: record.job_id,
    sequence: record.sequence,
    payloadSnapshot: structuredClone(record.payload_snapshot),
    createdAt: record.created_at,
  };
}

function toPackingListRevision(record: PackingListRevisionRecord): PackingListRevision {
  const validation = validatePackingListRevision(record.payload_snapshot);
  if (!validation.ok) {
    throw new Error(`Packing-list revision ${record.id} contains an invalid payload snapshot.`);
  }
  return {
    id: record.id,
    shipmentId: record.shipment_id,
    version: record.version,
    status: record.status,
    payloadSnapshot: validation.revision,
    totalExpectedQuantity: validation.totalExpectedQuantity,
    createdBy: record.created_by ?? undefined,
    createdAt: record.created_at,
    confirmedBy: record.confirmed_by ?? undefined,
    confirmedAt: record.confirmed_at ?? undefined,
  };
}

function toWarehouseReceiptSession(
  session: WarehouseReceiptSessionRecord,
  lines: WarehouseReceiptSessionLineRecord[],
): WarehouseReceiptSession {
  return {
    id: session.id,
    shipmentId: session.shipment_id,
    scopeSnapshot: structuredClone(session.scope_snapshot),
    mode: session.mode,
    status: session.status,
    idempotencyKey: session.idempotency_key,
    createdBy: session.created_by ?? undefined,
    createdAt: session.created_at,
    confirmedBy: session.confirmed_by ?? undefined,
    confirmedAt: session.confirmed_at ?? undefined,
    stagingLocation: session.staging_location ?? undefined,
    lines: lines.map((line) => {
      const discrepancy = line.warehouse_receipt_discrepancies?.[0];
      return {
        sku: line.sku,
        productBarcode: line.product_barcode,
        expectedQuantity: line.expected_quantity,
        actualQuantity: line.actual_quantity,
        ...(discrepancy ? { discrepancy: { type: discrepancy.discrepancy_type, reason: discrepancy.reason } } : {}),
      };
    }),
  };
}

function validRequestedLabelQuantity(value: number) {
  return Number.isInteger(value) && value > 0;
}

function productSku(
  record: MovementRecord | { products?: { sku?: string } | { sku?: string }[] },
) {
  return Array.isArray(record.products)
    ? record.products[0]?.sku
    : record.products?.sku;
}

function batchNo(record?: {
  inventory_batches?: { batch_no?: string } | { batch_no?: string }[] | null;
}) {
  const batch = record?.inventory_batches;
  if (!batch) return undefined;
  return Array.isArray(batch) ? batch[0]?.batch_no : batch.batch_no;
}

function locationRecord(
  record?: LocationRecord | LocationRecord[] | null,
): LocationRecord | undefined {
  if (!record) return undefined;
  return Array.isArray(record) ? record[0] : record;
}

function locationLabel(
  record?: LocationRecord | LocationRecord[] | null,
): string | undefined {
  const location = locationRecord(record);
  return location
    ? formatWarehouseLocation({
        warehouse: location.warehouse,
        zone: location.zone,
        binCode: location.bin_code,
      })
    : undefined;
}

function toInventoryRows(
  products: ProductRecord[],
  balances: BalanceRecord[],
): InventoryRow[] {
  return products.map((product) => {
    const productBalances = balances.filter(
      (balance) => balance.product_id === product.id,
    );
    return {
      sku: product.sku,
      onHand: productBalances.reduce(
        (sum, balance) => sum + balance.on_hand,
        0,
      ),
      reserved: productBalances.reduce(
        (sum, balance) => sum + balance.reserved,
        0,
      ),
      quarantine: productBalances.reduce(
        (sum, balance) => sum + balance.quarantine,
        0,
      ),
    };
  });
}

function toCatalogueRows(
  products: ProductRecord[],
  balances: BalanceRecord[],
): AdminState["catalogue"] {
  return products.map((product) => {
    const productBalances = balances.filter(
      (balance) => balance.product_id === product.id,
    );
    const row = {
      sku: product.sku,
      onHand: productBalances.reduce(
        (sum, balance) => sum + balance.on_hand,
        0,
      ),
      reserved: productBalances.reduce(
        (sum, balance) => sum + balance.reserved,
        0,
      ),
      quarantine: productBalances.reduce(
        (sum, balance) => sum + balance.quarantine,
        0,
      ),
    };

    return {
      barcode: product.barcode ?? undefined,
      oemPartNumber: product.oem_part_number ?? undefined,
      brand: product.brand,
      name: product.part_name,
      category: product.category,
      reorderPoint: product.reorder_point ?? 0,
      reorderQuantity: product.reorder_quantity ?? 0,
      status: product.status,
      ...row,
      available: availableStock(row),
    };
  });
}

function toStockMovement(record: MovementRecord): StockMovement {
  const movementLabels = {
    inbound: "Inbound",
    putaway: "Putaway",
    dispatch: "Dispatch",
    return: "Return",
    quarantine: "Quarantine",
    adjustment: "Adjustment",
  } as const;
  const locations = {
    inbound: "BNE receiving",
    putaway: "BNE putaway",
    dispatch: "BNE dispatch",
    return: "BNE returns",
    quarantine: "BNE quarantine",
    adjustment: "BNE adjustment",
  } as const;
  const movementType = record.movement_type as keyof typeof movementLabels;

  const actualLocation =
    movementType === "inbound" ||
    movementType === "return" ||
    movementType === "putaway" ||
    (movementType === "adjustment" && !!record.to_location)
      ? locationLabel(record.to_location)
      : locationLabel(record.from_location);

  const movement =
    movementType === "adjustment" &&
    record.reference_type === "quarantine_release"
      ? "Quarantine Release"
      : movementType === "adjustment" &&
          record.reference_type === "quarantine_writeoff"
        ? "Quarantine Write-off"
        : (movementLabels[movementType] ?? "Dispatch");

  return {
    id: record.id,
    sku: productSku(record) ?? "UNKNOWN",
    movement,
    quantity: record.quantity,
    location: actualLocation ?? locations[movementType] ?? "BNE dispatch",
    reference: record.reference_id,
    createdAt: record.created_at,
    createdBy: record.created_by ?? undefined,
  };
}

function toLookupRequest(record: LookupRequestRecord) {
  return {
    id: record.id,
    tradeAccountId: record.trade_account_id ?? undefined,
    rego: record.rego ?? undefined,
    vin: record.vin ?? undefined,
    query: record.query ?? undefined,
    vehicle: record.vehicle,
    matchCount: record.match_count,
    confidence: record.confidence,
    createdBy: record.created_by ?? undefined,
    createdAt: record.created_at,
  };
}

function toSalesOrder(record: SalesOrderRecord): SalesOrder {
  return {
    id: record.id,
    tradeAccountId: record.trade_account_id,
    poNumber: record.po_number ?? undefined,
    vehicleVin: record.vehicle_vin ?? undefined,
    vehicleRego: record.vehicle_rego ?? undefined,
    status: record.status,
    subtotalExGstCents: record.subtotal_ex_gst_cents ?? undefined,
    gstCents: record.gst_cents ?? undefined,
    totalIncGstCents: record.total_inc_gst_cents ?? undefined,
    deliveryChargeExGstCents: record.delivery_charge_ex_gst_cents ?? undefined,
    carrier: record.carrier ?? undefined,
    trackingNumber: record.tracking_number ?? undefined,
    dispatchedAt: record.dispatched_at ?? undefined,
    paymentDueAt: record.payment_due_at ?? undefined,
    invoiceStatus: record.invoice_status ?? undefined,
    createdBy: record.created_by ?? undefined,
    createdAt: record.created_at ?? undefined,
    lines:
      record.sales_order_lines?.map((line) => ({
        sku: productSku(line) ?? "UNKNOWN",
        quantity: line.quantity,
        unitPriceExGstCents: line.unit_price_ex_gst_cents ?? 0,
        lineTotalExGstCents: line.line_total_ex_gst_cents ?? 0,
        gstCents: line.gst_cents ?? 0,
        lineTotalIncGstCents: line.line_total_inc_gst_cents ?? 0,
      })) ?? [],
  };
}

function toAccountDocument(record: AccountDocumentRecord): AccountDocument {
  return {
    id: record.id,
    tradeAccountId: record.trade_account_id,
    type: record.document_type,
    reference: record.document_ref,
    storagePath: record.storage_path,
    createdAt: record.created_at,
  };
}

function toTradeAccountApplication(record: TradeAccountRecord) {
  return {
    id: record.id,
    accountName: record.account_name,
    abn: record.abn ?? undefined,
    contactName: record.contact_name ?? "",
    contactEmail: record.contact_email ?? "",
    contactPhone: record.contact_phone ?? "",
    postcode: record.postcode ?? undefined,
    notes: record.notes ?? undefined,
    status: record.status,
    createdAt: record.created_at,
  };
}

function toFitmentRule(record: FitmentRuleRecord): FitmentRule | null {
  const sku = productSku(record);
  if (!sku || !record.year_from) return null;

  return {
    sku,
    make: record.make,
    model: record.model,
    yearFrom: record.year_from,
    yearTo: record.year_to ?? undefined,
    engine: record.engine ?? undefined,
    confidence: record.confidence as FitmentRule["confidence"],
  };
}

function statementMonth(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

function statementReference(tradeAccountId: string, date = new Date()): string {
  return `STMT-${statementMonth(date)}-${tradeAccountId}`;
}

function statementStoragePath(
  tradeAccountId: string,
  date = new Date(),
): string {
  return `generated/statements/${statementMonth(date)}/${tradeAccountId}.txt`;
}

function invoiceStoragePath(orderId: string): string {
  return `generated/invoices/${orderId}.txt`;
}

function deliveryRecordStoragePath(orderId: string): string {
  return `generated/delivery-records/${orderId}.txt`;
}

export class SupabaseRepository implements DrivemateRepository {
  mode = "supabase" as const;

  private client() {
    return createServiceSupabaseClient();
  }

  private async loadWarehouseReceiptSession(
    sessionId: string,
  ): Promise<WarehouseReceiptSessionResult> {
    const supabase = this.client();
    const { data: session, error: sessionError } = await supabase
      .from("warehouse_receipt_sessions")
      .select("id, shipment_id, scope_snapshot, mode, status, idempotency_key, created_by, created_at, confirmed_by, confirmed_at, staging_location")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) return { ok: false, message: "Warehouse receipt session was not found." };

    const { data: lines, error: linesError } = await supabase
      .from("warehouse_receipt_session_lines")
      .select("id, receipt_session_id, sku, product_barcode, expected_quantity, actual_quantity, warehouse_receipt_discrepancies(discrepancy_type, reason)")
      .eq("receipt_session_id", sessionId)
      .order("created_at");
    if (linesError) throw linesError;

    return {
      ok: true,
      session: toWarehouseReceiptSession(
        session as WarehouseReceiptSessionRecord,
        (lines ?? []) as WarehouseReceiptSessionLineRecord[],
      ),
    };
  }

  private accountDocumentsBucket() {
    return process.env.SUPABASE_ACCOUNT_DOCUMENTS_BUCKET ?? "account-documents";
  }

  private async submitOrderTransactional(
    input: CreateOrderInput,
    context: RepositoryWriteContext,
  ): Promise<SubmitOrderResult> {
    if (!input.idempotencyKey)
      return { ok: false, message: "Idempotency key is required." };
    const supabase = this.client();
    const { data: orderId, error } = await supabase.rpc(
      "dm_reserve_sales_order",
      {
        p_trade_account_id: input.tradeAccountId,
        p_lines: input.lines,
        p_idempotency_key: input.idempotencyKey,
        p_po_number: input.poNumber ?? null,
        p_vehicle_vin: input.vehicleVin ?? null,
        p_vehicle_rego: input.vehicleRego ?? null,
        p_created_by: context.actorId ?? null,
      },
    );
    if (error) return { ok: false, message: error.message };

    const confirmationReference = `OC-${orderId}`;
    const confirmationPath = `generated/order-confirmations/${orderId}.txt`;
    const state = await this.getAdminState();
    const order = state.orders.find((candidate) => candidate.id === orderId);
    if (!order)
      return {
        ok: false,
        message: "Order was reserved but could not be reloaded.",
      };
    await this.uploadGeneratedAccountDocument({
      storagePath: confirmationPath,
      type: "order_confirmation",
      reference: confirmationReference,
      tradeAccountId: order.tradeAccountId,
      contentLines: [
        `Order: ${order.id}`,
        `PO number: ${order.poNumber ?? "Not supplied"}`,
        `Vehicle VIN: ${order.vehicleVin ?? "Not supplied"}`,
        `Vehicle rego: ${order.vehicleRego ?? "Not supplied"}`,
        ...order.lines.map(
          (line) =>
            `- ${line.sku} x ${line.quantity} @ ${formatAudCents(line.unitPriceExGstCents)} ex GST = ${formatAudCents(line.lineTotalIncGstCents)} inc GST`,
        ),
        `Subtotal ex GST: ${formatAudCents(order.subtotalExGstCents ?? 0)}`,
        `GST: ${formatAudCents(order.gstCents ?? 0)}`,
        `Total inc GST: ${formatAudCents(order.totalIncGstCents ?? 0)}`,
      ],
    });
    await supabase.from("account_documents").upsert(
      {
        trade_account_id: order.tradeAccountId,
        document_type: "order_confirmation",
        document_ref: confirmationReference,
        storage_path: confirmationPath,
      },
      { onConflict: "trade_account_id,document_type,document_ref" },
    );

    return {
      ok: true,
      order,
      inventory: state.catalogue.map((row) => ({
        sku: row.sku,
        onHand: row.onHand,
        reserved: row.reserved,
        quarantine: row.quarantine,
      })),
    };
  }

  private async dispatchOrderTransactional(
    orderId: string,
    input: DispatchOrderInput,
    context: RepositoryWriteContext,
  ): Promise<DispatchOrderResult> {
    if (
      !input.idempotencyKey ||
      input.deliveryChargeExGstCents === undefined ||
      !input.carrier ||
      !input.trackingNumber
    ) {
      return {
        ok: false,
        message:
          "Idempotency key, delivery charge, carrier and tracking number are required.",
      };
    }
    const before = await this.getAdminState();
    const order = before.orders.find((candidate) => candidate.id === orderId);
    if (!order) return { ok: false, message: "Order was not found." };
    const scanValidation = validateDispatchScans(order.lines, input.scans);
    if (!scanValidation.ok) return scanValidation;

    const supabase = this.client();
    const { error } = await supabase.rpc("dm_dispatch_sales_order", {
      p_order_id: orderId,
      p_delivery_charge_ex_gst_cents: input.deliveryChargeExGstCents,
      p_carrier: input.carrier,
      p_tracking_number: input.trackingNumber,
      p_idempotency_key: input.idempotencyKey,
      p_actor_id: context.actorId ?? null,
    });
    if (error) return { ok: false, message: error.message };
    const state = await this.getAdminState();
    const dispatched = state.orders.find(
      (candidate) => candidate.id === orderId,
    );
    if (!dispatched)
      return { ok: false, message: "Dispatched order could not be reloaded." };

    const invoiceReference = `INV-${orderId}`;
    const invoicePath = invoiceStoragePath(orderId);
    const deliveryReference = `DEL-${orderId}`;
    const deliveryPath = deliveryRecordStoragePath(orderId);
    await this.uploadGeneratedAccountDocument({
      storagePath: invoicePath,
      type: "invoice",
      reference: invoiceReference,
      tradeAccountId: dispatched.tradeAccountId,
      contentLines: [
        `Order: ${orderId}`,
        `PO / job: ${dispatched.poNumber ?? "Not supplied"}`,
        `Vehicle VIN: ${dispatched.vehicleVin ?? "Not supplied"}`,
        `Vehicle rego: ${dispatched.vehicleRego ?? "Not supplied"}`,
        `Carrier: ${input.carrier}`,
        `Tracking: ${input.trackingNumber}`,
        `Payment due: ${dispatched.paymentDueAt ?? "See approved account terms"}`,
        "Parts:",
        ...dispatched.lines.map(
          (line) =>
            `- ${line.sku} x ${line.quantity} @ ${formatAudCents(line.unitPriceExGstCents)} ex GST = ${formatAudCents(line.lineTotalIncGstCents)} inc GST`,
        ),
        `Delivery ex GST: ${formatAudCents(input.deliveryChargeExGstCents)}`,
        `Delivery GST: ${formatAudCents(Math.round(input.deliveryChargeExGstCents * 0.1))}`,
        `Subtotal ex GST: ${formatAudCents(dispatched.subtotalExGstCents ?? 0)}`,
        `GST: ${formatAudCents(dispatched.gstCents ?? 0)}`,
        `Total inc GST: ${formatAudCents(dispatched.totalIncGstCents ?? 0)}`,
      ],
    });
    await this.uploadGeneratedAccountDocument({
      storagePath: deliveryPath,
      type: "delivery_record",
      reference: deliveryReference,
      tradeAccountId: dispatched.tradeAccountId,
      contentLines: [
        `Order: ${orderId}`,
        `Vehicle VIN: ${dispatched.vehicleVin ?? "Not supplied"}`,
        `Vehicle rego: ${dispatched.vehicleRego ?? "Not supplied"}`,
        `Carrier: ${input.carrier}`,
        `Tracking: ${input.trackingNumber}`,
        ...dispatched.lines.map((line) => `- ${line.sku} x ${line.quantity}`),
      ],
    });
    const { error: documentError } = await supabase
      .from("account_documents")
      .upsert(
        [
          {
            trade_account_id: dispatched.tradeAccountId,
            document_type: "invoice",
            document_ref: invoiceReference,
            storage_path: invoicePath,
          },
          {
            trade_account_id: dispatched.tradeAccountId,
            document_type: "delivery_record",
            document_ref: deliveryReference,
            storage_path: deliveryPath,
          },
        ],
        { onConflict: "trade_account_id,document_type,document_ref" },
      );
    if (documentError) return { ok: false, message: documentError.message };

    return {
      ok: true,
      order: dispatched,
      inventory: state.catalogue.map((row) => ({
        sku: row.sku,
        onHand: row.onHand,
        reserved: row.reserved,
        quarantine: row.quarantine,
      })),
      movements: state.stockMovements.filter(
        (movement) => movement.reference === orderId,
      ),
    };
  }

  private async cancelOrderTransactional(
    orderId: string,
    input: CancelOrderInput,
    context: RepositoryWriteContext,
  ): Promise<CancelOrderResult> {
    if (!input.idempotencyKey)
      return { ok: false, message: "Idempotency key is required." };
    const supabase = this.client();
    if (input.tradeAccountId) {
      const { data: owned } = await supabase
        .from("sales_orders")
        .select("id")
        .eq("id", orderId)
        .eq("trade_account_id", input.tradeAccountId)
        .maybeSingle();
      if (!owned) return { ok: false, message: "Order was not found." };
    }
    const { error } = await supabase.rpc("dm_cancel_sales_order", {
      p_order_id: orderId,
      p_idempotency_key: input.idempotencyKey,
      p_actor_id: context.actorId ?? null,
    });
    if (error) return { ok: false, message: error.message };
    const state = await this.getAdminState();
    const order = state.orders.find((candidate) => candidate.id === orderId);
    return order
      ? {
          ok: true,
          order,
          inventory: state.catalogue.map((row) => ({
            sku: row.sku,
            onHand: row.onHand,
            reserved: row.reserved,
            quarantine: row.quarantine,
          })),
        }
      : { ok: false, message: "Cancelled order could not be reloaded." };
  }

  private async uploadGeneratedAccountDocument(input: {
    storagePath: string;
    type: AccountDocument["type"];
    reference: string;
    tradeAccountId: string;
    contentLines?: string[];
  }) {
    const supabase = this.client();
    const { data: account, error: accountError } = await supabase
      .from("trade_accounts")
      .select("account_name, abn, contact_email")
      .eq("id", input.tradeAccountId)
      .single();
    if (accountError || !account) {
      throw (
        accountError ??
        new Error(
          "Trade account identity was not found for the account document.",
        )
      );
    }
    const content = createAccountDocumentText({
      type: input.type,
      reference: input.reference,
      tradeAccountId: input.tradeAccountId,
      customerName: account.account_name,
      customerAbn: account.abn ?? undefined,
      customerEmail: account.contact_email ?? undefined,
      contentLines: input.contentLines,
    });

    const { error } = await supabase.storage
      .from(this.accountDocumentsBucket())
      .upload(input.storagePath, content, {
        contentType: "text/plain;charset=UTF-8",
        upsert: true,
      });

    if (error) throw error;
  }

  private async findProductByIdentifier(identifier: string) {
    const supabase = this.client();
    const raw = identifier.trim();
    const candidates = Array.from(new Set([raw, raw.toUpperCase()])).filter(
      Boolean,
    );

    for (const value of candidates) {
      const { data: skuMatch, error: skuError } = await supabase
        .from("products")
        .select("id, sku")
        .eq("sku", value)
        .maybeSingle();
      if (skuError) throw skuError;
      if (skuMatch) return skuMatch as { id: string; sku: string };

      const { data: barcodeMatch, error: barcodeError } = await supabase
        .from("products")
        .select("id, sku")
        .eq("barcode", value)
        .maybeSingle();
      if (barcodeError) throw barcodeError;
      if (barcodeMatch) return barcodeMatch as { id: string; sku: string };

      const { data: oemMatch, error: oemError } = await supabase
        .from("products")
        .select("id, sku")
        .eq("oem_part_number", value)
        .maybeSingle();
      if (oemError) throw oemError;
      if (oemMatch) return oemMatch as { id: string; sku: string };
    }

    return null;
  }

  private async findAuthUserByEmail(email: string) {
    const target = email.trim().toLowerCase();
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await this.client().auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) throw error;

      const user = data.users.find(
        (candidate) => candidate.email?.toLowerCase() === target,
      );
      if (user) return user;
      if (data.users.length < 1000) break;
    }

    return null;
  }

  private async ensureInventoryLocation(
    locationInput?: string,
  ): Promise<LocationRecord & { id: string; parsed: WarehouseLocationParts }> {
    const supabase = this.client();
    const location = parseWarehouseLocation(locationInput);
    const { data: existing, error: existingError } = await supabase
      .from("inventory_locations")
      .select("id, warehouse, zone, bin_code")
      .eq("warehouse", location.warehouse)
      .eq("zone", location.zone)
      .eq("bin_code", location.binCode)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing)
      return {
        ...(existing as LocationRecord & { id: string }),
        parsed: location,
      };

    const { data, error } = await supabase
      .from("inventory_locations")
      .insert({
        warehouse: location.warehouse,
        zone: location.zone,
        bin_code: location.binCode,
      })
      .select("id, warehouse, zone, bin_code")
      .single();

    if (error || !data)
      throw error ?? new Error("Inventory location insert failed.");
    return { ...(data as LocationRecord & { id: string }), parsed: location };
  }

  private async ensureInventoryBatch(
    productId: string,
    batchNo: string,
    type: InventoryMovementInput["type"],
  ) {
    const supabase = this.client();
    const normalizedBatchNo = batchNo.trim() || "UNBATCHED";
    const { data: existing, error: existingError } = await supabase
      .from("inventory_batches")
      .select("id, batch_no")
      .eq("product_id", productId)
      .eq("batch_no", normalizedBatchNo)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return existing as { id: string; batch_no: string };

    const { data, error } = await supabase
      .from("inventory_batches")
      .insert({
        product_id: productId,
        batch_no: normalizedBatchNo,
        supplier_name:
          type === "return"
            ? "Return intake"
            : type === "adjustment"
              ? "Stock adjustment"
              : "Inbound receiving",
        purchase_ref: normalizedBatchNo,
        received_date: new Date().toISOString().slice(0, 10),
      })
      .select("id, batch_no")
      .single();

    if (error || !data)
      throw error ?? new Error("Inventory batch insert failed.");
    return data as { id: string; batch_no: string };
  }

  private async getOrCreateBalance(
    productId: string,
    locationId: string,
    batchId: string,
  ) {
    const supabase = this.client();
    const { data: existing, error: existingError } = await supabase
      .from("inventory_balances")
      .select(
        "id, product_id, location_id, batch_id, on_hand, reserved, quarantine",
      )
      .eq("product_id", productId)
      .eq("location_id", locationId)
      .eq("batch_id", batchId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return existing as BalanceRecord;

    const { data, error } = await supabase
      .from("inventory_balances")
      .insert({
        product_id: productId,
        location_id: locationId,
        batch_id: batchId,
        on_hand: 0,
        reserved: 0,
        quarantine: 0,
      })
      .select(
        "id, product_id, location_id, batch_id, on_hand, reserved, quarantine",
      )
      .single();

    if (error || !data)
      throw error ?? new Error("Inventory balance insert failed.");
    return data as BalanceRecord;
  }

  private async selectBalanceForDecrease(productId: string, quantity: number) {
    const supabase = this.client();
    const { data, error } = await supabase
      .from("inventory_balances")
      .select(
        "id, product_id, location_id, batch_id, on_hand, reserved, quarantine",
      )
      .eq("product_id", productId)
      .order("on_hand", { ascending: false });

    if (error) throw error;
    const balances = (data ?? []) as BalanceRecord[];
    return (
      balances.find(
        (balance) =>
          availableStock({
            sku: productId,
            onHand: balance.on_hand,
            reserved: balance.reserved,
            quarantine: balance.quarantine,
          }) >= quantity,
      ) ?? balances[0]
    );
  }

  private async selectBalanceForLocationDecrease(
    productId: string,
    locationId: string,
    quantity: number,
  ) {
    const supabase = this.client();
    const { data, error } = await supabase
      .from("inventory_balances")
      .select(
        "id, product_id, location_id, batch_id, on_hand, reserved, quarantine",
      )
      .eq("product_id", productId)
      .eq("location_id", locationId)
      .order("on_hand", { ascending: false });

    if (error) throw error;
    const balances = (data ?? []) as BalanceRecord[];
    return balances.find(
      (balance) =>
        availableStock({
          sku: productId,
          onHand: balance.on_hand,
          reserved: balance.reserved,
          quarantine: balance.quarantine,
        }) >= quantity,
    );
  }

  private async selectBalanceForLocationQuarantine(
    productId: string,
    locationId: string,
    quantity: number,
  ) {
    const supabase = this.client();
    const { data, error } = await supabase
      .from("inventory_balances")
      .select(
        "id, product_id, location_id, batch_id, on_hand, reserved, quarantine",
      )
      .eq("product_id", productId)
      .eq("location_id", locationId)
      .order("quarantine", { ascending: false });

    if (error) throw error;
    const balances = (data ?? []) as BalanceRecord[];
    return balances.find((balance) => balance.quarantine >= quantity);
  }

  private async selectBalanceForQuarantine(
    productId: string,
    quantity: number,
  ) {
    const supabase = this.client();
    const { data, error } = await supabase
      .from("inventory_balances")
      .select(
        "id, product_id, location_id, batch_id, on_hand, reserved, quarantine",
      )
      .eq("product_id", productId)
      .order("quarantine", { ascending: false });

    if (error) throw error;
    const balances = (data ?? []) as BalanceRecord[];
    return balances.find((balance) => balance.quarantine >= quantity);
  }

  private async ensureMonthlyStatementDocument(tradeAccountId: string) {
    const supabase = this.client();
    const reference = statementReference(tradeAccountId);
    const storagePath = statementStoragePath(tradeAccountId);

    const { data: existing, error: existingError } = await supabase
      .from("account_documents")
      .select("id, storage_path")
      .eq("trade_account_id", tradeAccountId)
      .eq("document_type", "statement")
      .eq("document_ref", reference)
      .maybeSingle();

    if (existingError) throw existingError;
    await this.uploadGeneratedAccountDocument({
      storagePath: existing?.storage_path ?? storagePath,
      type: "statement",
      reference,
      tradeAccountId,
      contentLines: [
        `Statement month: ${statementMonth()}`,
        "Document status: Generated for account portal access.",
      ],
    });
    if (existing) return;

    const { error } = await supabase.from("account_documents").insert({
      trade_account_id: tradeAccountId,
      document_type: "statement",
      document_ref: reference,
      storage_path: storagePath,
    });

    if (error) throw error;
  }

  async getAdminState(): Promise<AdminState> {
    const supabase = this.client();
    const [
      { data: products, error: productsError },
      { data: balances, error: balancesError },
    ] = await Promise.all([
      supabase
        .from("products")
        .select(
          "id, sku, brand, part_name, category, barcode, oem_part_number, reorder_point, reorder_quantity, status",
        ),
      supabase
        .from("inventory_balances")
        .select("id, product_id, on_hand, reserved, quarantine"),
    ]);

    if (productsError) throw productsError;
    if (balancesError) throw balancesError;

    const productRecords = (products ?? []) as ProductRecord[];
    const balanceRecords = (balances ?? []) as BalanceRecord[];
    const inventory = toInventoryRows(productRecords, balanceRecords);
    const catalogue = toCatalogueRows(productRecords, balanceRecords);
    const activeCatalogue = catalogue.filter((row) => row.status === "active");
    const reorderAlerts = catalogue
      .filter(
        (row) =>
          row.status === "active" &&
          row.reorderPoint > 0 &&
          row.available <= row.reorderPoint,
      )
      .map((row) => ({
        sku: row.sku,
        brand: row.brand,
        name: row.name,
        available: row.available,
        reorderPoint: row.reorderPoint,
        suggestedOrderQty: Math.max(
          row.reorderQuantity,
          row.reorderPoint - row.available,
        ),
        status: row.status,
      }))
      .sort((a, b) => a.available - b.available || a.sku.localeCompare(b.sku));

    const [
      { data: movementRecords },
      { data: orderRecords },
      { data: accountDocumentRecords },
      { data: fitmentRecords },
      { data: batchRecords },
      { data: inboundBatchMovementRecords },
      { data: pricingRecords, error: pricingError },
      { data: rfqRecords, error: rfqError },
      { data: lookupRequestRecords },
      { data: userRecords },
    ] = await Promise.all([
      supabase
        .from("stock_movements")
        .select(
          "id, movement_type, quantity, reference_type, reference_id, created_at, created_by, products(sku), from_location:inventory_locations!stock_movements_from_location_id_fkey(warehouse, zone, bin_code), to_location:inventory_locations!stock_movements_to_location_id_fkey(warehouse, zone, bin_code)",
        )
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("sales_orders")
        .select(
          "id, trade_account_id, po_number, vehicle_vin, vehicle_rego, status, subtotal_ex_gst_cents, gst_cents, total_inc_gst_cents, delivery_charge_ex_gst_cents, carrier, tracking_number, dispatched_at, payment_due_at, invoice_status, created_by, created_at, sales_order_lines(quantity, unit_price_ex_gst_cents, line_total_ex_gst_cents, gst_cents, line_total_inc_gst_cents, products(sku))",
        )
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("account_documents")
        .select(
          "id, trade_account_id, document_type, document_ref, storage_path, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("fitment_rules")
        .select(
          "make, model, year_from, year_to, engine, confidence, products(sku)",
        )
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("inventory_batches")
        .select(
          "batch_no, supplier_name, purchase_ref, received_date, products(sku)",
        )
        .order("received_date", { ascending: false })
        .limit(30),
      supabase
        .from("stock_movements")
        .select("quantity, products(sku), inventory_batches(batch_no)")
        .eq("movement_type", "inbound")
        .limit(500),
      supabase
        .from("pricing_rules")
        .select("id, sku, channel, price_mode, unit_price_ex_gst_cents, status")
        .order("sku", { ascending: true })
        .limit(30),
      supabase
        .from("rfq_reviews")
        .select("id, brand, vehicle, requested_part, priority, status")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("vehicle_lookup_requests")
        .select(
          "id, trade_account_id, rego, vin, query, vehicle, match_count, confidence, created_by, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("user_profiles")
        .select("id, role, display_name, trade_account_id")
        .order("role", { ascending: true })
        .limit(30),
    ]);
    const { data: applicationRecords, error: applicationsError } =
      await supabase
        .from("trade_accounts")
        .select(
          "id, account_name, abn, contact_name, contact_email, contact_phone, postcode, notes, status, created_at",
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);

    if (applicationsError) throw applicationsError;

    const { data: tradeAccountRecords, error: tradeAccountsError } =
      await supabase
        .from("trade_accounts")
        .select(
          "id, account_name, abn, contact_name, contact_email, contact_phone, postcode, notes, status, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50);

    if (tradeAccountsError) throw tradeAccountsError;

    const stockMovements = ((movementRecords ?? []) as MovementRecord[]).map(
      toStockMovement,
    );
    const orders = ((orderRecords ?? []) as SalesOrderRecord[]).map(
      toSalesOrder,
    );
    const accountDocuments = (
      (accountDocumentRecords ?? []) as AccountDocumentRecord[]
    ).map(toAccountDocument);
    const accountApplications = (
      (applicationRecords ?? []) as TradeAccountRecord[]
    ).map(toTradeAccountApplication);
    const tradeAccounts = (
      (tradeAccountRecords ?? []) as TradeAccountRecord[]
    ).map(toTradeAccountApplication);
    const fitmentRules = ((fitmentRecords ?? []) as FitmentRuleRecord[]).map(
      (rule) => ({
        sku: productSku(rule) ?? "UNKNOWN",
        vehicle:
          `${rule.make} ${rule.model} ${rule.year_from ?? ""}${rule.year_to ? `-${rule.year_to}` : "-on"}`.trim(),
        engine: rule.engine ?? undefined,
        confidence: rule.confidence,
      }),
    );
    const receivedQuantityByBatch = (
      (inboundBatchMovementRecords ?? []) as InboundBatchMovementRecord[]
    ).reduce((map, movement) => {
      const key = `${batchNo(movement) ?? ""}::${productSku(movement) ?? ""}`;
      map.set(key, (map.get(key) ?? 0) + movement.quantity);
      return map;
    }, new Map<string, number>());
    const purchaseBatches = (
      (batchRecords ?? []) as InventoryBatchRecord[]
    ).map((batch) => ({
      batchNo: batch.batch_no,
      sku: productSku(batch) ?? "UNKNOWN",
      receivedQuantity:
        receivedQuantityByBatch.get(
          `${batch.batch_no}::${productSku(batch) ?? "UNKNOWN"}`,
        ) ?? undefined,
      supplierName: batch.supplier_name ?? undefined,
      purchaseRef: batch.purchase_ref ?? undefined,
      receivedDate: batch.received_date ?? undefined,
    }));
    const pricingRules = pricingError
      ? pilotPricingRules
      : ((pricingRecords ?? []) as PricingRuleRecord[]).map((rule) => ({
          id: rule.id,
          sku: rule.sku,
          channel: rule.channel,
          priceMode: rule.price_mode,
          unitPriceExGstCents: rule.unit_price_ex_gst_cents ?? undefined,
          status: rule.status,
        }));
    const tradePriceBySku = new Map(
      pricingRules
        .filter((rule) => rule.status === "active")
        .map((rule) => [
          rule.sku,
          rule.unitPriceExGstCents ?? defaultPriceResolver(rule.sku),
        ]),
    );
    const pricedCatalogue = catalogue.map((row) => ({
      ...row,
      tradePriceExGstCents:
        tradePriceBySku.get(row.sku) ?? defaultPriceResolver(row.sku),
    }));
    const rfqReviews = rfqError
      ? pilotRfqReviews
      : ((rfqRecords ?? []) as RfqReviewRecord[]).map((review) => ({
          id: review.id,
          brand: review.brand,
          vehicle: review.vehicle,
          requestedPart: review.requested_part,
          priority: review.priority,
          status: review.status,
        }));
    const lookupRequests = (
      (lookupRequestRecords ?? []) as LookupRequestRecord[]
    ).map(toLookupRequest);
    const userRoles =
      ((userRecords ?? []) as UserProfileRecord[]).map((user) => ({
        userId: user.id,
        role: user.role,
        displayName: user.display_name ?? undefined,
        tradeAccountId: user.trade_account_id ?? undefined,
      })) ?? demoUserRoles;

    return {
      metrics: {
        activeSkus: activeCatalogue.length,
        onHandUnits: activeCatalogue.reduce(
          (sum, item) => sum + item.onHand,
          0,
        ),
        availableUnits: activeCatalogue.reduce(
          (sum, item) => sum + item.available,
          0,
        ),
        reorderAlerts: reorderAlerts.length,
        openTasks:
          4 +
          orders.length +
          stockMovements.length +
          accountApplications.length +
          reorderAlerts.length,
      },
      catalogue: pricedCatalogue,
      reorderAlerts,
      stockMovements,
      orders,
      accountDocuments,
      accountApplications,
      tradeAccounts,
      fitmentRules,
      purchaseBatches,
      pricingRules,
      rfqReviews,
      lookupRequests,
      userRoles: userRoles.length ? userRoles : demoUserRoles,
    };
  }

  async lookupVehicle(
    input: VehicleLookupInput,
    context: RepositoryWriteContext = {},
  ) {
    const supabase = this.client();
    const state = await this.getAdminState();
    const vin = input.vin?.trim().toUpperCase();
    let vehicle: VehicleProfile = {
      make: "Unknown",
      model: "Manual review",
      market: "AU-spec",
      confidence: "manual_review",
    };

    if (vin && /^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      const { data: vehicleRecord, error: vehicleError } = await supabase
        .from("vehicles")
        .select(
          "vin, vehicle_configurations!inner(make, model, year, engine, market, status)",
        )
        .eq("vin", vin)
        .maybeSingle();
      if (vehicleError) throw vehicleError;
      const configuration = Array.isArray(vehicleRecord?.vehicle_configurations)
        ? vehicleRecord.vehicle_configurations[0]
        : vehicleRecord?.vehicle_configurations;
      if (configuration?.status === "approved") {
        vehicle = {
          make: configuration.make,
          model: configuration.model,
          year: configuration.year,
          engine: configuration.engine ?? undefined,
          market: "AU-spec",
          confidence: "exact",
        };
      }
    }
    const { data, error } = await supabase
      .from("fitment_rules")
      .select(
        "make, model, year_from, year_to, engine, confidence, products(sku)",
      )
      .limit(500);

    if (error) throw error;
    const rules = ((data ?? []) as FitmentRuleRecord[])
      .map(toFitmentRule)
      .filter((rule) => rule !== null);
    const result =
      vehicle.confidence === "exact"
        ? matchCatalogueForVehicleProfile(
            vehicle,
            state.catalogue.filter((product) => product.status === "active"),
            rules,
          )
        : { vehicle, matches: [] };
    const { error: lookupError } = await supabase
      .from("vehicle_lookup_requests")
      .insert({
        trade_account_id: context.tradeAccountId,
        rego: input.rego,
        vin: input.vin,
        query: input.query,
        vehicle: [
          result.vehicle.make,
          result.vehicle.model,
          result.vehicle.year,
        ]
          .filter(Boolean)
          .join(" "),
        match_count: result.matches.length,
        confidence: result.vehicle.confidence,
        created_by: context.actorId,
      });

    if (lookupError) throw lookupError;
    return result;
  }

  async getTradeAccountState(
    tradeAccountId: string,
  ): Promise<TradeAccountState> {
    const supabase = this.client();
    const [
      { data: orderRecords, error: orderError },
      { data: documentRecords, error: documentError },
    ] = await Promise.all([
      supabase
        .from("sales_orders")
        .select(
          "id, trade_account_id, po_number, vehicle_vin, vehicle_rego, status, subtotal_ex_gst_cents, gst_cents, total_inc_gst_cents, delivery_charge_ex_gst_cents, carrier, tracking_number, dispatched_at, payment_due_at, invoice_status, created_by, created_at, sales_order_lines(quantity, unit_price_ex_gst_cents, line_total_ex_gst_cents, gst_cents, line_total_inc_gst_cents, products(sku))",
        )
        .eq("trade_account_id", tradeAccountId)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("account_documents")
        .select(
          "id, trade_account_id, document_type, document_ref, storage_path, created_at",
        )
        .eq("trade_account_id", tradeAccountId)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    if (orderError) throw orderError;
    if (documentError) throw documentError;

    return {
      tradeAccountId,
      orders: ((orderRecords ?? []) as SalesOrderRecord[]).map(toSalesOrder),
      accountDocuments: (
        (documentRecords ?? []) as AccountDocumentRecord[]
      ).map(toAccountDocument),
    };
  }

  async getAccountDocumentAccess(
    documentId: string,
    tradeAccountId?: string,
  ): Promise<AccountDocumentAccessResult> {
    const supabase = this.client();
    let query = supabase
      .from("account_documents")
      .select(
        "id, trade_account_id, document_type, document_ref, storage_path, created_at",
      )
      .eq("id", documentId);

    if (tradeAccountId) query = query.eq("trade_account_id", tradeAccountId);

    const { data, error } = await query.single();
    if (error || !data)
      return { ok: false, message: "Account document was not found." };

    const document = toAccountDocument(data as AccountDocumentRecord);
    const { data: signedUrl, error: signedUrlError } = await supabase.storage
      .from(this.accountDocumentsBucket())
      .createSignedUrl(document.storagePath ?? "", 300);

    if (signedUrlError || !signedUrl?.signedUrl) {
      return { ok: false, message: "Account document file is not available." };
    }

    return { ok: true, document, downloadUrl: signedUrl.signedUrl };
  }

  async applyInventoryMovement(
    input: InventoryMovementInput,
    context: RepositoryWriteContext = {},
  ): Promise<InventoryMovementResult> {
    const supabase = this.client();
    const product = await this.findProductByIdentifier(input.sku);
    if (!product) return { ok: false, message: "SKU or barcode not found." };

    if (input.quantity <= 0 || !Number.isInteger(input.quantity)) {
      return { ok: false, message: "Quantity must be positive." };
    }

    if (!input.idempotencyKey)
      return { ok: false, message: "Idempotency key is required." };
    if (["inbound", "dispatch", "return"].includes(input.type)) {
      return {
        ok: false,
        message: "Use the dedicated receipt, order dispatch, or RMA workflow.",
      };
    }

    const sourceInput =
      input.type === "putaway"
        ? (input.fromLocation ?? input.location ?? "BNE receiving")
        : input.type === "adjustment" &&
            !input.quarantineAction &&
            input.adjustmentDirection === "increase"
          ? undefined
          : input.location;
    const targetInput =
      input.type === "putaway"
        ? (input.toLocation ?? "BNE-A01-03")
        : input.type === "adjustment" &&
            !input.quarantineAction &&
            input.adjustmentDirection !== "decrease"
          ? (input.location ?? "BNE-A01-03")
          : undefined;
    const source = sourceInput
      ? parseWarehouseLocation(sourceInput)
      : undefined;
    const target = targetInput
      ? parseWarehouseLocation(targetInput)
      : undefined;

    const { data: movementId, error: movementError } = await supabase.rpc(
      "dm_apply_inventory_movement",
      {
        p_product_id: product.id,
        p_movement_type: input.type,
        p_quantity: input.quantity,
        p_reference: input.reference,
        p_source_warehouse: source?.warehouse ?? null,
        p_source_zone: source?.zone ?? null,
        p_source_bin: source?.binCode ?? null,
        p_target_warehouse: target?.warehouse ?? null,
        p_target_zone: target?.zone ?? null,
        p_target_bin: target?.binCode ?? null,
        p_adjustment_direction: input.adjustmentDirection ?? null,
        p_quarantine_action: input.quarantineAction ?? null,
        p_idempotency_key: input.idempotencyKey,
        p_actor_id: context.actorId ?? null,
      },
    );
    if (movementError || !movementId) {
      return {
        ok: false,
        message:
          movementError?.message ??
          "Inventory movement could not be completed.",
      };
    }

    const { data: movement, error: reloadError } = await supabase
      .from("stock_movements")
      .select(
        "id, movement_type, quantity, reference_type, reference_id, created_at, created_by, products(sku), from_location:inventory_locations!stock_movements_from_location_id_fkey(warehouse, zone, bin_code), to_location:inventory_locations!stock_movements_to_location_id_fkey(warehouse, zone, bin_code)",
      )
      .eq("id", movementId as string)
      .single();
    if (reloadError || !movement)
      throw (
        reloadError ?? new Error("Inventory movement audit row was not found.")
      );

    const state = await this.getAdminState();
    return {
      ok: true,
      inventory: state.catalogue.map((row) => ({
        sku: row.sku,
        onHand: row.onHand,
        reserved: row.reserved,
        quarantine: row.quarantine,
      })),
      movement: toStockMovement(movement as MovementRecord),
    };

    /* Legacy multi-request inventory flow retained temporarily for migration comparison.

    if (input.type === "putaway") {
      const sourceLocation = await this.ensureInventoryLocation(input.fromLocation ?? input.location ?? "BNE receiving");
      const targetLocation = await this.ensureInventoryLocation(input.toLocation ?? "BNE-A01-03");
      const sourceBalance = await this.selectBalanceForLocationDecrease(product.id, sourceLocation.id, input.quantity);

      if (!sourceBalance) return { ok: false, message: "Not enough available stock in source location." };
      if (!sourceBalance.batch_id) return { ok: false, message: "Inventory batch was not found." };

      const targetBalance = await this.getOrCreateBalance(product.id, targetLocation.id, sourceBalance.batch_id);
      const { error: sourceUpdateError } = await supabase
        .from("inventory_balances")
        .update({ on_hand: sourceBalance.on_hand - input.quantity })
        .eq("id", sourceBalance.id);

      if (sourceUpdateError) throw sourceUpdateError;

      const { error: targetUpdateError } = await supabase
        .from("inventory_balances")
        .update({ on_hand: targetBalance.on_hand + input.quantity })
        .eq("id", targetBalance.id);

      if (targetUpdateError) throw targetUpdateError;

      const { data: movement, error: movementError } = await supabase
        .from("stock_movements")
        .insert({
          product_id: product.id,
          batch_id: sourceBalance.batch_id,
          movement_type: input.type,
          quantity: input.quantity,
          from_location_id: sourceLocation.id,
          to_location_id: targetLocation.id,
          reference_type: input.type,
          reference_id: input.reference,
          created_by: context.actorId ?? null,
        })
        .select(
          "id, movement_type, quantity, reference_type, reference_id, created_at, created_by, products(sku), from_location:inventory_locations!stock_movements_from_location_id_fkey(warehouse, zone, bin_code), to_location:inventory_locations!stock_movements_to_location_id_fkey(warehouse, zone, bin_code)",
        )
        .single();

      if (movementError) throw movementError;

      const state = await this.getAdminState();
      return {
        ok: true,
        inventory: state.catalogue.map((row) => ({
          sku: row.sku,
          onHand: row.onHand,
          reserved: row.reserved,
          quarantine: row.quarantine,
        })),
        movement: toStockMovement(movement as MovementRecord),
      };
    }

    if (input.type === "adjustment") {
      const location = await this.ensureInventoryLocation(input.location ?? (input.quarantineAction ? "BNE quarantine" : "BNE-A01-03"));
      if (input.quarantineAction) {
        const balance =
          (await this.selectBalanceForLocationQuarantine(product.id, location.id, input.quantity)) ??
          (await this.selectBalanceForQuarantine(product.id, input.quantity));
        if (!balance) return { ok: false, message: "Not enough quarantined stock." };

        const nextOnHand =
          input.quarantineAction === "writeoff" ? balance.on_hand - input.quantity : balance.on_hand;
        if (nextOnHand < 0) return { ok: false, message: "Not enough on-hand stock to write off." };

        const { error: updateError } = await supabase
          .from("inventory_balances")
          .update({ on_hand: nextOnHand, quarantine: balance.quarantine - input.quantity })
          .eq("id", balance.id);

        if (updateError) throw updateError;

        const { data: movement, error: movementError } = await supabase
          .from("stock_movements")
          .insert({
            product_id: product.id,
            batch_id: balance.batch_id ?? null,
            movement_type: input.type,
            quantity: input.quantity,
            from_location_id: balance.location_id ?? location.id,
            to_location_id: input.quarantineAction === "release" ? (balance.location_id ?? location.id) : null,
            reference_type:
              input.quarantineAction === "release" ? "quarantine_release" : "quarantine_writeoff",
            reference_id: input.reference,
            created_by: context.actorId ?? null,
          })
          .select(
            "id, movement_type, quantity, reference_type, reference_id, created_at, created_by, products(sku), from_location:inventory_locations!stock_movements_from_location_id_fkey(warehouse, zone, bin_code), to_location:inventory_locations!stock_movements_to_location_id_fkey(warehouse, zone, bin_code)",
          )
          .single();

        if (movementError) throw movementError;

        const state = await this.getAdminState();
        return {
          ok: true,
          inventory: state.catalogue.map((row) => ({
            sku: row.sku,
            onHand: row.onHand,
            reserved: row.reserved,
            quarantine: row.quarantine,
          })),
          movement: toStockMovement(movement as MovementRecord),
        };
      }

      const isDecrease = input.adjustmentDirection === "decrease";
      const balance = isDecrease
        ? await this.selectBalanceForLocationDecrease(product.id, location.id, input.quantity)
        : await this.getOrCreateBalance(
            product.id,
            location.id,
            (await this.ensureInventoryBatch(product.id, input.reference, input.type)).id,
          );

      if (!balance) return { ok: false, message: "Not enough available stock in adjustment location." };

      if (isDecrease) {
        const current: InventoryRow = {
          sku: product.sku,
          onHand: balance.on_hand,
          reserved: balance.reserved,
          quarantine: balance.quarantine,
        };
        if (availableStock(current) < input.quantity) {
          return { ok: false, message: "Not enough available stock." };
        }
      }

      const nextOnHand = isDecrease ? balance.on_hand - input.quantity : balance.on_hand + input.quantity;
      const { error: updateError } = await supabase
        .from("inventory_balances")
        .update({ on_hand: nextOnHand })
        .eq("id", balance.id);

      if (updateError) throw updateError;

      const { data: movement, error: movementError } = await supabase
        .from("stock_movements")
        .insert({
          product_id: product.id,
          batch_id: balance.batch_id ?? null,
          movement_type: input.type,
          quantity: input.quantity,
          from_location_id: isDecrease ? (balance.location_id ?? location.id) : null,
          to_location_id: isDecrease ? null : (balance.location_id ?? location.id),
          reference_type: isDecrease ? "adjustment_decrease" : "adjustment_increase",
          reference_id: input.reference,
          created_by: context.actorId ?? null,
        })
        .select(
          "id, movement_type, quantity, reference_type, reference_id, created_at, created_by, products(sku), from_location:inventory_locations!stock_movements_from_location_id_fkey(warehouse, zone, bin_code), to_location:inventory_locations!stock_movements_to_location_id_fkey(warehouse, zone, bin_code)",
        )
        .single();

      if (movementError) throw movementError;

      const state = await this.getAdminState();
      return {
        ok: true,
        inventory: state.catalogue.map((row) => ({
          sku: row.sku,
          onHand: row.onHand,
          reserved: row.reserved,
          quarantine: row.quarantine,
        })),
        movement: toStockMovement(movement as MovementRecord),
      };
    }

    const increaseStock = input.type === "inbound" || input.type === "return";
    const targetLocation = increaseStock ? await this.ensureInventoryLocation(input.location) : null;
    const targetBatch = increaseStock
      ? await this.ensureInventoryBatch(product.id, input.reference, input.type)
      : null;
    const balance = increaseStock
      ? await this.getOrCreateBalance(product.id, targetLocation?.id ?? "", targetBatch?.id ?? "")
      : await this.selectBalanceForDecrease(product.id, input.quantity);

    if (!balance) return { ok: false, message: "Inventory balance was not found." };

    const current: InventoryRow = {
      sku: product.sku,
      onHand: balance.on_hand,
      reserved: balance.reserved,
      quarantine: balance.quarantine,
    };

    if ((input.type === "dispatch" || input.type === "quarantine") && availableStock(current) < input.quantity) {
      return { ok: false, message: "Not enough available stock." };
    }

    const nextOnHand =
      increaseStock
        ? balance.on_hand + input.quantity
        : input.type === "dispatch"
          ? balance.on_hand - input.quantity
          : balance.on_hand;
    const nextQuarantine = input.type === "quarantine" ? balance.quarantine + input.quantity : balance.quarantine;
    const { error: updateError } = await supabase
      .from("inventory_balances")
      .update({ on_hand: nextOnHand, quarantine: nextQuarantine })
      .eq("id", balance.id);

    if (updateError) throw updateError;

    const { data: movement, error: movementError } = await supabase
      .from("stock_movements")
      .insert({
        product_id: product.id,
        batch_id: balance.batch_id ?? null,
        movement_type: input.type,
        quantity: input.quantity,
        from_location_id: increaseStock ? null : (balance.location_id ?? null),
        to_location_id: increaseStock ? (balance.location_id ?? null) : null,
        reference_type: input.type,
        reference_id: input.reference,
        created_by: context.actorId ?? null,
      })
      .select(
        "id, movement_type, quantity, reference_type, reference_id, created_at, created_by, products(sku), from_location:inventory_locations!stock_movements_from_location_id_fkey(warehouse, zone, bin_code), to_location:inventory_locations!stock_movements_to_location_id_fkey(warehouse, zone, bin_code)",
      )
      .single();

    if (movementError) throw movementError;

    const state = await this.getAdminState();
    return {
      ok: true,
      inventory: state.catalogue.map((row) => ({ sku: row.sku, onHand: row.onHand, reserved: row.reserved, quarantine: row.quarantine })),
      movement: toStockMovement(movement as MovementRecord),
    };
    */
  }

  async submitOrder(
    input: CreateOrderInput,
    context: RepositoryWriteContext = {},
  ): Promise<SubmitOrderResult> {
    return this.submitOrderTransactional(input, context);
    /* Legacy prototype flow retained below for migration reference.
    const supabase = this.client();
    const state = await this.getAdminState();
    const { data: tradeAccount, error: tradeAccountError } = await supabase
      .from("trade_accounts")
      .select("id, status")
      .eq("id", input.tradeAccountId)
      .maybeSingle();

    if (tradeAccountError) throw tradeAccountError;
    if (!tradeAccount || tradeAccount.status !== "approved") {
      return { ok: false, message: "Trade account must be approved before orders can be submitted." };
    }

    for (const line of input.lines) {
      const row = state.catalogue.find((item) => item.sku === line.sku);
      if (!row) return { ok: false, message: `SKU ${line.sku} was not found.` };
      if (row.status !== "active") {
        return { ok: false, message: `SKU ${line.sku} is not active for trade ordering.` };
      }
      if (row.available < line.quantity) {
        return { ok: false, message: `SKU ${line.sku} does not have enough available stock.` };
      }
    }

    const pricing = calculateOrderPricing(input.lines, (sku) => {
      const row = state.catalogue.find((item) => item.sku === sku);
      return row?.tradePriceExGstCents ?? defaultPriceResolver(sku);
    });
    if (!pricing.ok) return pricing;

    const { data: order, error: orderError } = await supabase
      .from("sales_orders")
      .insert({
        trade_account_id: input.tradeAccountId,
        po_number: input.poNumber,
        vehicle_vin: input.vehicleVin,
        vehicle_rego: input.vehicleRego,
        status: "submitted",
        subtotal_ex_gst_cents: pricing.totals.subtotalExGstCents,
        gst_cents: pricing.totals.gstCents,
        total_inc_gst_cents: pricing.totals.totalIncGstCents,
        created_by: context.actorId ?? null,
      })
      .select("id, trade_account_id, po_number, vehicle_vin, vehicle_rego, status, subtotal_ex_gst_cents, gst_cents, total_inc_gst_cents, created_by")
      .single();

    if (orderError || !order) throw orderError ?? new Error("Order insert failed.");

    for (const line of pricing.lines) {
      const { data: product } = await supabase.from("products").select("id").eq("sku", line.sku).single();
      if (!product) return { ok: false, message: `SKU ${line.sku} was not found.` };

      await supabase.from("sales_order_lines").insert({
        sales_order_id: order.id,
        product_id: product.id,
        quantity: line.quantity,
        unit_price_ex_gst_cents: line.unitPriceExGstCents,
        line_total_ex_gst_cents: line.lineTotalExGstCents,
        gst_cents: line.gstCents,
        line_total_inc_gst_cents: line.lineTotalIncGstCents,
        status: "reserved",
      });

      const balance = await this.selectBalanceForDecrease(product.id, line.quantity);
      if (!balance) return { ok: false, message: `Inventory balance for ${line.sku} was not found.` };

      const { error: reserveError } = await supabase
        .from("inventory_balances")
        .update({ reserved: balance.reserved + line.quantity })
        .eq("id", balance.id);

      if (reserveError) throw reserveError;
    }

    const invoiceReference = `INV-${order.id}`;
    const invoicePath = invoiceStoragePath(order.id);
    await this.uploadGeneratedAccountDocument({
      storagePath: invoicePath,
      type: "invoice",
      reference: invoiceReference,
      tradeAccountId: order.trade_account_id,
      contentLines: [
        `PO number: ${order.po_number ?? "Not supplied"}`,
        `Vehicle VIN: ${order.vehicle_vin ?? "Not supplied"}`,
        `Vehicle rego: ${order.vehicle_rego ?? "Not supplied"}`,
        "Lines:",
        ...pricing.lines.map(
          (line) =>
            `- ${line.sku} x ${line.quantity} @ ${line.unitPriceExGstCents / 100} ex GST = ${line.lineTotalIncGstCents / 100} inc GST`,
        ),
        `Subtotal ex GST: ${pricing.totals.subtotalExGstCents / 100}`,
        `GST: ${pricing.totals.gstCents / 100}`,
        `Total inc GST: ${pricing.totals.totalIncGstCents / 100}`,
      ],
    });

    const { error: documentError } = await supabase.from("account_documents").insert({
      trade_account_id: order.trade_account_id,
      document_type: "invoice",
      document_ref: invoiceReference,
      storage_path: invoicePath,
    });

    if (documentError) throw documentError;
    await this.ensureMonthlyStatementDocument(order.trade_account_id);

    const adminState = await this.getAdminState();
    const storedOrder = adminState.orders.find((candidate) => candidate.id === order.id) ?? {
      id: order.id,
      tradeAccountId: order.trade_account_id,
      poNumber: order.po_number ?? undefined,
      vehicleVin: order.vehicle_vin ?? undefined,
      vehicleRego: order.vehicle_rego ?? undefined,
      status: order.status,
      subtotalExGstCents: order.subtotal_ex_gst_cents ?? undefined,
      gstCents: order.gst_cents ?? undefined,
      totalIncGstCents: order.total_inc_gst_cents ?? undefined,
      createdBy: order.created_by ?? undefined,
      lines: pricing.lines,
    };

    return {
      ok: true,
      order: storedOrder,
      inventory: adminState.catalogue.map((row) => ({ sku: row.sku, onHand: row.onHand, reserved: row.reserved, quarantine: row.quarantine })),
    };
  */
  }

  async dispatchOrder(
    orderId: string,
    input: DispatchOrderInput,
    context: RepositoryWriteContext = {},
  ): Promise<DispatchOrderResult> {
    return this.dispatchOrderTransactional(orderId, input, context);
    /* Legacy prototype flow retained below for migration reference.
    const supabase = this.client();
    const { data: order, error: orderError } = await supabase
      .from("sales_orders")
      .select(
        "id, trade_account_id, po_number, vehicle_vin, vehicle_rego, status, subtotal_ex_gst_cents, gst_cents, total_inc_gst_cents, created_by, sales_order_lines(product_id, quantity, unit_price_ex_gst_cents, line_total_ex_gst_cents, gst_cents, line_total_inc_gst_cents, products(sku))",
      )
      .eq("id", orderId)
      .single();

    if (orderError || !order) return { ok: false, message: "Order was not found." };
    const orderRecord = order as SalesOrderRecord;

    if (orderRecord.status === "dispatched") return { ok: false, message: "Order has already been dispatched." };
    if (orderRecord.status === "cancelled") return { ok: false, message: "Cancelled orders cannot be dispatched." };

    const resolvedScans: DispatchScanInput[] = [];
    for (const scan of input.scans ?? []) {
      const product = await this.findProductByIdentifier(scan.sku);
      if (!product) return { ok: false, message: `Scanned SKU ${scan.sku} was not found.` };
      resolvedScans.push({ sku: product.sku, quantity: scan.quantity });
    }

    const validation = validateDispatchScans(
      (orderRecord.sales_order_lines ?? []).map((line) => ({
        sku: productSku(line) ?? "UNKNOWN",
        quantity: line.quantity,
      })),
      resolvedScans,
    );
    if (!validation.ok) return validation;

    const movements: StockMovement[] = [];
    for (const line of orderRecord.sales_order_lines ?? []) {
      const sku = productSku(line);
      if (!sku || !line.product_id) return { ok: false, message: "Order line product data was incomplete." };

      const { data: balance, error: balanceError } = await supabase
        .from("inventory_balances")
        .select("id, product_id, location_id, batch_id, on_hand, reserved, quarantine")
        .eq("product_id", line.product_id)
        .limit(1)
        .single();

      if (balanceError || !balance) return { ok: false, message: `Inventory balance for ${sku} was not found.` };
      if (balance.on_hand < line.quantity || balance.reserved < line.quantity) {
        return { ok: false, message: `SKU ${sku} does not have enough reserved stock.` };
      }

      const { error: updateError } = await supabase
        .from("inventory_balances")
        .update({ on_hand: balance.on_hand - line.quantity, reserved: balance.reserved - line.quantity })
        .eq("id", balance.id);

      if (updateError) throw updateError;

      const { data: movement, error: movementError } = await supabase
        .from("stock_movements")
        .insert({
          product_id: line.product_id,
          batch_id: balance.batch_id ?? null,
          movement_type: "dispatch",
          quantity: line.quantity,
          from_location_id: balance.location_id ?? null,
          reference_type: "dispatch",
          reference_id: orderRecord.id,
          created_by: context.actorId ?? null,
        })
        .select(
          "id, movement_type, quantity, reference_type, reference_id, created_at, created_by, products(sku), from_location:inventory_locations!stock_movements_from_location_id_fkey(warehouse, zone, bin_code), to_location:inventory_locations!stock_movements_to_location_id_fkey(warehouse, zone, bin_code)",
        )
        .single();

      if (movementError) throw movementError;
      movements.push(toStockMovement(movement as MovementRecord));
    }

    const deliveryReference = `DEL-${orderRecord.id}`;
    const deliveryPath = deliveryRecordStoragePath(orderRecord.id);
    await this.uploadGeneratedAccountDocument({
      storagePath: deliveryPath,
      type: "delivery_record",
      reference: deliveryReference,
      tradeAccountId: orderRecord.trade_account_id,
      contentLines: [
        `Order: ${orderRecord.id}`,
        `Vehicle VIN: ${orderRecord.vehicle_vin ?? "Not supplied"}`,
        `Vehicle rego: ${orderRecord.vehicle_rego ?? "Not supplied"}`,
        "Dispatched lines:",
        ...(orderRecord.sales_order_lines?.map((line) => `- ${productSku(line) ?? "UNKNOWN"} x ${line.quantity}`) ?? []),
      ],
    });

    const [{ error: orderUpdateError }, { error: linesUpdateError }, { error: documentError }] = await Promise.all([
      supabase.from("sales_orders").update({ status: "dispatched" }).eq("id", orderRecord.id),
      supabase.from("sales_order_lines").update({ status: "picked" }).eq("sales_order_id", orderRecord.id),
      supabase.from("account_documents").insert({
        trade_account_id: orderRecord.trade_account_id,
        document_type: "delivery_record",
        document_ref: deliveryReference,
        storage_path: deliveryPath,
      }),
    ]);

    if (orderUpdateError) throw orderUpdateError;
    if (linesUpdateError) throw linesUpdateError;
    if (documentError) throw documentError;

    const adminState = await this.getAdminState();
    const storedOrder = adminState.orders.find((candidate) => candidate.id === orderRecord.id) ?? {
      id: orderRecord.id,
      tradeAccountId: orderRecord.trade_account_id,
      poNumber: orderRecord.po_number ?? undefined,
      vehicleVin: orderRecord.vehicle_vin ?? undefined,
      vehicleRego: orderRecord.vehicle_rego ?? undefined,
      status: "dispatched",
      subtotalExGstCents: orderRecord.subtotal_ex_gst_cents ?? undefined,
      gstCents: orderRecord.gst_cents ?? undefined,
      totalIncGstCents: orderRecord.total_inc_gst_cents ?? undefined,
      createdBy: orderRecord.created_by ?? undefined,
      lines:
        orderRecord.sales_order_lines?.map((line) => ({
          sku: productSku(line) ?? "UNKNOWN",
          quantity: line.quantity,
          unitPriceExGstCents: line.unit_price_ex_gst_cents ?? 0,
          lineTotalExGstCents: line.line_total_ex_gst_cents ?? 0,
          gstCents: line.gst_cents ?? 0,
          lineTotalIncGstCents: line.line_total_inc_gst_cents ?? 0,
        })) ?? [],
    };

    return {
      ok: true,
      order: storedOrder,
      inventory: adminState.catalogue.map((row) => ({ sku: row.sku, onHand: row.onHand, reserved: row.reserved, quarantine: row.quarantine })),
      movements,
    };
  */
  }

  async cancelOrder(
    orderId: string,
    input: CancelOrderInput = {},
    context: RepositoryWriteContext = {},
  ): Promise<CancelOrderResult> {
    return this.cancelOrderTransactional(orderId, input, context);
    /* Legacy prototype flow retained below for migration reference.
    const supabase = this.client();
    let query = supabase
      .from("sales_orders")
      .select(
        "id, trade_account_id, po_number, vehicle_vin, vehicle_rego, status, subtotal_ex_gst_cents, gst_cents, total_inc_gst_cents, created_by, created_at, sales_order_lines(product_id, quantity, unit_price_ex_gst_cents, line_total_ex_gst_cents, gst_cents, line_total_inc_gst_cents, products(sku))",
      )
      .eq("id", orderId);

    if ("tradeAccountId" in input && input.tradeAccountId) {
      query = query.eq("trade_account_id", input.tradeAccountId);
    }

    const { data: order, error: orderError } = await query.single();
    if (orderError || !order) return { ok: false, message: "Order was not found." };
    const orderRecord = order as SalesOrderRecord;

    if (orderRecord.status === "dispatched") return { ok: false, message: "Dispatched orders cannot be cancelled." };
    if (orderRecord.status === "cancelled") return { ok: false, message: "Order has already been cancelled." };

    for (const line of orderRecord.sales_order_lines ?? []) {
      if (!line.product_id) return { ok: false, message: "Order line product data was incomplete." };
      let remaining = line.quantity;
      const { data: balances, error: balanceError } = await supabase
        .from("inventory_balances")
        .select("id, reserved")
        .eq("product_id", line.product_id)
        .gt("reserved", 0)
        .order("reserved", { ascending: false });

      if (balanceError) throw balanceError;

      for (const balance of balances ?? []) {
        if (remaining <= 0) break;
        const releaseQty = Math.min(balance.reserved, remaining);
        const { error: updateError } = await supabase
          .from("inventory_balances")
          .update({ reserved: balance.reserved - releaseQty })
          .eq("id", balance.id);
        if (updateError) throw updateError;
        remaining -= releaseQty;
      }

      if (remaining > 0) {
        return { ok: false, message: `Reserved stock for ${productSku(line) ?? "UNKNOWN"} could not be fully released.` };
      }
    }

    const [{ error: orderUpdateError }, { error: lineUpdateError }] = await Promise.all([
      supabase.from("sales_orders").update({ status: "cancelled" }).eq("id", orderRecord.id),
      supabase.from("sales_order_lines").update({ status: "cancelled" }).eq("sales_order_id", orderRecord.id),
    ]);

    if (orderUpdateError) throw orderUpdateError;
    if (lineUpdateError) throw lineUpdateError;

    const adminState = await this.getAdminState();
    const cancelledOrder = {
      ...toSalesOrder(orderRecord),
      status: "cancelled" as const,
    };

    return {
      ok: true,
      order: adminState.orders.find((candidate) => candidate.id === orderRecord.id) ?? cancelledOrder,
      inventory: adminState.catalogue.map((row) => ({ sku: row.sku, onHand: row.onHand, reserved: row.reserved, quarantine: row.quarantine })),
    };
  */
  }

  async submitTradeAccountApplication(
    input: TradeAccountApplicationInput,
  ): Promise<TradeAccountApplicationResult> {
    const supabase = this.client();
    const { data: existingEmail, error: existingEmailError } = await supabase
      .from("trade_accounts")
      .select("id")
      .ilike("contact_email", input.contactEmail.trim())
      .neq("status", "closed")
      .maybeSingle();
    if (existingEmailError) throw existingEmailError;
    if (existingEmail) {
      return {
        ok: false,
        message: "An active application already exists for this email.",
      };
    }

    const { data, error } = await supabase
      .from("trade_accounts")
      .insert({
        account_name: input.accountName,
        abn: input.abn,
        contact_name: input.contactName,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        postcode: input.postcode,
        notes: input.notes,
        status: "pending",
        privacy_consent_at: input.privacyConsent
          ? new Date().toISOString()
          : null,
        trade_terms_consent_at: input.tradeTermsConsent
          ? new Date().toISOString()
          : null,
        consent_version: input.consentVersion,
      })
      .select(
        "id, account_name, abn, contact_name, contact_email, contact_phone, postcode, notes, status, created_at",
      )
      .single();

    if (error?.code === "23505") {
      return {
        ok: false,
        message: "An active application already exists for this email or ABN.",
      };
    }
    if (error || !data)
      throw error ?? new Error("Trade account application insert failed.");
    return {
      ok: true,
      application: toTradeAccountApplication(data as TradeAccountRecord),
    };
  }

  async approveTradeAccountApplication(
    applicationId: string,
  ): Promise<ApproveTradeAccountApplicationResult> {
    const supabase = this.client();
    const { data: existing, error: existingError } = await supabase
      .from("trade_accounts")
      .select("id, status")
      .eq("id", applicationId)
      .single();

    if (existingError || !existing)
      return { ok: false, message: "Trade account application was not found." };
    if (existing.status !== "pending")
      return {
        ok: false,
        message: "Trade account application is not pending.",
      };

    const { data, error } = await supabase
      .from("trade_accounts")
      .update({ status: "approved" })
      .eq("id", applicationId)
      .select(
        "id, account_name, abn, contact_name, contact_email, contact_phone, postcode, notes, status, created_at",
      )
      .single();

    if (error || !data)
      throw error ?? new Error("Trade account application approval failed.");
    return {
      ok: true,
      application: toTradeAccountApplication(data as TradeAccountRecord),
    };
  }

  async provisionTradeAccountLogin(
    applicationId: string,
  ): Promise<ProvisionTradeAccountLoginResult> {
    const supabase = this.client();
    const { data: existing, error: existingError } = await supabase
      .from("trade_accounts")
      .select(
        "id, account_name, abn, contact_name, contact_email, contact_phone, postcode, notes, status, created_at",
      )
      .eq("id", applicationId)
      .single();

    if (existingError || !existing)
      return { ok: false, message: "Trade account application was not found." };
    const account = existing as TradeAccountRecord;
    if (account.status === "paused" || account.status === "closed") {
      return {
        ok: false,
        message: "Paused or closed trade accounts cannot be provisioned.",
      };
    }
    if (!account.contact_email) {
      return {
        ok: false,
        message:
          "Trade account contact email is required before login can be provisioned.",
      };
    }

    const existingUser = await this.findAuthUserByEmail(account.contact_email);
    let user = existingUser;
    if (!user) {
      const { data: invitedUser, error: createError } =
        await supabase.auth.admin.inviteUserByEmail(account.contact_email, {
          redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm?next=/password-setup`,
          data: {
            display_name: account.contact_name ?? account.account_name,
            drivemate_role: "trade",
            trade_account_id: account.id,
          },
        });

      if (createError) throw createError;
      user = invitedUser.user;
    } else {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        account.contact_email,
        {
          redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm?next=/password-setup`,
        },
      );
      if (resetError) throw resetError;
    }

    if (!user)
      return { ok: false, message: "Trade account user could not be created." };

    const { data: updatedAccount, error: updateError } = await supabase
      .from("trade_accounts")
      .update({ status: "approved" })
      .eq("id", account.id)
      .select(
        "id, account_name, abn, contact_name, contact_email, contact_phone, postcode, notes, status, created_at",
      )
      .single();

    if (updateError || !updatedAccount)
      throw updateError ?? new Error("Trade account approval failed.");

    const { error: profileError } = await supabase.from("user_profiles").upsert(
      {
        id: user.id,
        role: "trade",
        display_name: account.contact_name ?? account.account_name,
        trade_account_id: account.id,
      },
      { onConflict: "id" },
    );

    if (profileError) throw profileError;

    return {
      ok: true,
      application: toTradeAccountApplication(
        updatedAccount as TradeAccountRecord,
      ),
      login: {
        email: account.contact_email,
        userId: user.id,
        created: !existingUser,
        setupEmailSent: true,
      },
    };
  }

  async updateTradeAccountStatus(
    applicationId: string,
    status: TradeAccountStatus,
  ): Promise<UpdateTradeAccountStatusResult> {
    const supabase = this.client();
    const { data, error } = await supabase
      .from("trade_accounts")
      .update({ status })
      .eq("id", applicationId)
      .select(
        "id, account_name, abn, contact_name, contact_email, contact_phone, postcode, notes, status, created_at",
      )
      .maybeSingle();

    if (error) throw error;
    if (!data) return { ok: false, message: "Trade account was not found." };

    return {
      ok: true,
      application: toTradeAccountApplication(data as TradeAccountRecord),
    };
  }

  async createProductMaster(
    input: CreateProductMasterInput,
  ): Promise<CreateProductMasterResult> {
    const supabase = this.client();
    const sku = input.sku.trim().toUpperCase();

    const { data, error } = await supabase
      .from("products")
      .insert({
        sku,
        barcode: input.barcode.trim(),
        oem_part_number: input.oemPartNumber?.trim() || null,
        brand: input.brand,
        part_name: input.name.trim(),
        category: input.category.trim(),
        reorder_point: input.reorderPoint ?? 0,
        reorder_quantity: input.reorderQuantity ?? 0,
        status: input.status ?? "draft",
      })
      .select("sku")
      .single();

    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          message: "SKU, barcode, or OEM part number is already mapped.",
        };
      }
      throw error;
    }
    if (!data)
      return { ok: false, message: "Product master could not be created." };

    const state = await this.getAdminState();
    const product = state.catalogue.find((row) => row.sku === sku);
    return product
      ? { ok: true, product }
      : { ok: false, message: "SKU was not found." };
  }

  async updateProductMaster(
    input: UpdateProductMasterInput,
  ): Promise<UpdateProductMasterResult> {
    const supabase = this.client();
    const update: Record<string, string | number | null> = {};

    if (input.barcode !== undefined)
      update.barcode = input.barcode.trim() || null;
    if (input.oemPartNumber !== undefined)
      update.oem_part_number = input.oemPartNumber.trim() || null;
    if (input.brand !== undefined) update.brand = input.brand;
    if (input.name !== undefined) update.part_name = input.name.trim();
    if (input.category !== undefined) update.category = input.category.trim();
    if (input.reorderPoint !== undefined)
      update.reorder_point = input.reorderPoint;
    if (input.reorderQuantity !== undefined)
      update.reorder_quantity = input.reorderQuantity;
    if (input.status !== undefined) update.status = input.status;

    if (!Object.keys(update).length) {
      return { ok: false, message: "No product master fields were supplied." };
    }

    const { data, error } = await supabase
      .from("products")
      .update(update)
      .eq("sku", input.sku)
      .select("sku")
      .maybeSingle();

    if (error) throw error;
    if (!data) return { ok: false, message: "SKU was not found." };

    const state = await this.getAdminState();
    const product = state.catalogue.find((row) => row.sku === input.sku);
    return product
      ? { ok: true, product }
      : { ok: false, message: "SKU was not found." };
  }

  async createFitmentRule(
    input: CreateFitmentRuleInput,
  ): Promise<CreateFitmentRuleResult> {
    const supabase = this.client();
    const sku = input.sku.trim().toUpperCase();
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, sku")
      .eq("sku", sku)
      .maybeSingle();

    if (productError) throw productError;
    if (!product) return { ok: false, message: "SKU was not found." };
    if (input.yearTo !== undefined && input.yearTo < input.yearFrom) {
      return { ok: false, message: "Year to must be after year from." };
    }

    const { data: duplicate, error: duplicateError } = await supabase
      .from("fitment_rules")
      .select("id")
      .eq("product_id", product.id)
      .eq("make", input.make.trim())
      .eq("model", input.model.trim())
      .eq("year_from", input.yearFrom)
      .maybeSingle();

    if (duplicateError) throw duplicateError;
    if (duplicate)
      return {
        ok: false,
        message: "Fitment rule already exists for this SKU and vehicle.",
      };

    const { error } = await supabase.from("fitment_rules").insert({
      product_id: product.id,
      make: input.make.trim(),
      model: input.model.trim(),
      year_from: input.yearFrom,
      year_to: input.yearTo ?? null,
      engine: input.engine?.trim() || null,
      confidence: input.confidence,
    });

    if (error) throw error;

    return {
      ok: true,
      rule: {
        sku,
        vehicle: `${input.make.trim()} ${input.model.trim()} ${input.yearFrom}${input.yearTo ? `-${input.yearTo}` : "-on"}`,
        engine: input.engine?.trim() || undefined,
        confidence: input.confidence,
      },
    };
  }

  async createWarehouseLabelPrintJob(
    input: CreateWarehouseLabelPrintJobInput,
    context: RepositoryWriteContext = {},
  ): Promise<WarehouseLabelPrintJobResult> {
    if (!validRequestedLabelQuantity(input.requestedQuantity)) {
      return { ok: false, message: "Requested label quantity must be a positive integer." };
    }

    const { data, error } = await this.client()
      .from("warehouse_label_print_jobs")
      .insert({
        template_id: input.templateId,
        payload_snapshot: input.payloadSnapshot,
        requested_quantity: input.requestedQuantity,
        created_by: context.actorId ?? null,
      })
      .select("id, template_id, payload_snapshot, requested_quantity, status, created_by, created_at, printed_at, cancelled_at, reprint_of_job_id, reprint_reason")
      .single();
    if (error || !data) throw error ?? new Error("Warehouse label print job insert failed.");
    return { ok: true, job: toWarehouseLabelPrintJob(data as WarehouseLabelPrintJobRecord) };
  }

  async listPrearrivalShipments(): Promise<PrearrivalShipmentListResult> {
    const { data, error } = await this.client()
      .from("shipments")
      .select("id, shipment_reference, status")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return {
      ok: true,
      shipments: (data ?? []).map((shipment) => {
        const record = shipment as {
          id: string;
          shipment_reference?: string | null;
          status?: string | null;
        };
        return {
          shipmentId: record.id,
          shipmentReference: record.shipment_reference ?? undefined,
          status: record.status ?? undefined,
        };
      }),
    };
  }

  async getPrearrivalShipment(shipmentId: string): Promise<PrearrivalShipmentResult> {
    const expected = await this.getWarehouseExpectedReceipt({ shipmentId });
    if (!expected.ok) return { ok: false, message: "Pre-arrival shipment was not found." };

    const skus = [...new Set(expected.receipt.lines.map((line) => line.sku))];
    const [{ data, error }, { data: products, error: productsError }] = await Promise.all([
      this.client()
        .from("shipment_packing_list_versions")
        .select("id, shipment_id, version, status, payload_snapshot, created_by, created_at, confirmed_by, confirmed_at")
        .eq("shipment_id", shipmentId)
        .order("version", { ascending: true }),
      this.client().from("products").select("sku, barcode").in("sku", skus),
    ]);
    if (error) throw error;
    if (productsError) throw productsError;

    return {
      ok: true,
      shipment: {
        ...expected.receipt,
        revisions: ((data ?? []) as PackingListRevisionRecord[]).map(toPackingListRevision),
        productBarcodes: Object.fromEntries(
          (products ?? []).flatMap((product) => {
            const record = product as Pick<ProductRecord, "sku" | "barcode">;
            return record.barcode ? [[record.sku, record.barcode]] : [];
          }),
        ),
      },
    };
  }

  async createPackingListRevision(
    input: ValidatedPackingListRevision,
    context: RepositoryWriteContext = {},
  ): Promise<PackingListRevisionResult> {
    const structuralValidation = validatePackingListRevision(input);
    if (!structuralValidation.ok) return structuralValidation;

    const supabase = this.client();
    const requestedSkus = [
      ...new Set(
        input.pallets
          .flatMap((pallet) => pallet.cartons)
          .flatMap((carton) => carton.lines)
          .map((line) => line.sku.trim().toUpperCase()),
      ),
    ];
    const [{ data: shipment, error: shipmentError }, { data: products, error: productsError }] = await Promise.all([
      supabase.from("shipments").select("id").eq("id", input.shipmentId).maybeSingle(),
      supabase.from("products").select("sku").in("sku", requestedSkus),
    ]);
    if (shipmentError) throw shipmentError;
    if (!shipment) return { ok: false, message: "Pre-arrival shipment was not found." };
    if (productsError) throw productsError;

    const validation = validatePackingListRevision(structuralValidation.revision, {
      knownSkus: (products ?? []).map((product) => (product as { sku: string }).sku),
    });
    if (!validation.ok) return validation;

    const { data: previous, error: previousError } = await supabase
      .from("shipment_packing_list_versions")
      .select("version")
      .eq("shipment_id", validation.revision.shipmentId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousError) throw previousError;

    const { data, error } = await supabase
      .from("shipment_packing_list_versions")
      .insert({
        shipment_id: validation.revision.shipmentId,
        version: ((previous as { version?: number } | null)?.version ?? 0) + 1,
        status: "draft",
        payload_snapshot: validation.revision,
        created_by: context.actorId ?? null,
      })
      .select("id, shipment_id, version, status, payload_snapshot, created_by, created_at, confirmed_by, confirmed_at")
      .single();
    if (error || !data) throw error ?? new Error("Packing-list revision insert failed.");
    return { ok: true, revision: toPackingListRevision(data as PackingListRevisionRecord) };
  }

  async confirmPackingListRevision(
    revisionId: string,
    context: RepositoryWriteContext = {},
  ): Promise<PackingListRevisionResult> {
    const { data, error } = await this.client().rpc("dm_confirm_packing_list_revision", {
      p_revision_id: revisionId,
      p_actor_id: context.actorId ?? null,
    });
    if (error) throw error;
    if (!data) return { ok: false, message: "Packing-list revision was not found." };
    return { ok: true, revision: toPackingListRevision(data as PackingListRevisionRecord) };
  }

  async getWarehouseExpectedReceipt(
    selection: WarehouseInboundSelection,
  ): Promise<WarehouseExpectedReceiptResult> {
    const { data: confirmedRevision, error: confirmedRevisionError } = await this.client()
      .from("shipment_packing_list_versions")
      .select("id, shipment_id, version, status, payload_snapshot, created_by, created_at, confirmed_by, confirmed_at")
      .eq("shipment_id", selection.shipmentId)
      .eq("status", "confirmed")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (confirmedRevisionError) throw confirmedRevisionError;
    if (!confirmedRevision) {
      return { ok: false, message: "Confirmed packing list was not found for this shipment." };
    }

    const revision = toPackingListRevision(confirmedRevision as PackingListRevisionRecord);
    return {
      ok: true,
      receipt: filterWarehouseExpectedReceipt(
        receiptFromPackingListRevision(revision.payloadSnapshot),
        selection,
      ),
    };

  }

  async checkWarehouseReceiptPrintGate(
    scope: WarehouseReceiptScope,
  ): Promise<WarehouseReceiptPrintGateResult> {
    const requiredQuantity = scope.lines.reduce(
      (total, line) => total + line.expectedQuantity,
      0,
    );
    const { data, error } = await this.client()
      .from("warehouse_label_print_jobs")
      .select("id")
      .eq("template_id", "unit_product")
      .eq("status", "printed")
      .gte("requested_quantity", requiredQuantity)
      .contains("payload_snapshot", scope)
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    return data
      ? { ok: true }
      : {
          ok: false,
          message: "Confirmed Unit Product labels are required for the complete selected receipt scope before stock can be received.",
        };
  }

  async createWarehouseReceiptSession(
    input: CreateWarehouseReceiptSessionInput,
    context: RepositoryWriteContext = {},
  ): Promise<WarehouseReceiptSessionResult> {
    const { data, error } = await this.client().rpc("dm_create_warehouse_receipt_session", {
      p_shipment_id: input.scope.shipmentId,
      p_scope_snapshot: input.scope,
      p_mode: input.mode,
      p_lines: input.lines,
      p_idempotency_key: input.idempotencyKey,
      p_actor_id: context.actorId ?? null,
    });
    if (error) return { ok: false, message: error.message };
    if (!data) return { ok: false, message: "Warehouse receipt session could not be created." };
    return this.loadWarehouseReceiptSession(data as string);
  }

  async confirmWarehouseReceipt(
    sessionId: string,
    context: RepositoryWriteContext = {},
  ): Promise<WarehouseReceiptSessionResult> {
    const { data, error } = await this.client().rpc("dm_confirm_warehouse_receipt_session", {
      p_session_id: sessionId,
      p_actor_id: context.actorId ?? null,
    });
    if (error) return { ok: false, message: error.message };
    if (!data) return { ok: false, message: "Warehouse receipt session was not found." };
    return this.loadWarehouseReceiptSession(data as string);
  }

  async appendWarehouseLabelPrintItems(
    jobId: string,
    payloadSnapshots: Record<string, unknown>[],
  ): Promise<WarehouseLabelPrintItemsResult> {
    if (!payloadSnapshots.length) return { ok: false, message: "At least one label item is required." };
    const supabase = this.client();
    const { data: job, error: jobError } = await supabase
      .from("warehouse_label_print_jobs")
      .select("id, requested_quantity")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) return { ok: false, message: "Warehouse label print job was not found." };
    const { data: existing, error: existingError } = await supabase
      .from("warehouse_label_print_items")
      .select("id")
      .eq("job_id", jobId);
    if (existingError) throw existingError;
    if ((existing?.length ?? 0) + payloadSnapshots.length > job.requested_quantity) {
      return { ok: false, message: "Label item count exceeds the requested quantity." };
    }

    const { data, error } = await supabase
      .from("warehouse_label_print_items")
      .insert(payloadSnapshots.map((payloadSnapshot, index) => ({
        job_id: jobId,
        sequence: (existing?.length ?? 0) + index + 1,
        payload_snapshot: payloadSnapshot,
      })))
      .select("id, job_id, sequence, payload_snapshot, created_at");
    if (error || !data) throw error ?? new Error("Warehouse label print item insert failed.");
    return { ok: true, items: (data as WarehouseLabelPrintItemRecord[]).map(toWarehouseLabelPrintItem) };
  }

  async getWarehouseLabelPrintJob(jobId: string): Promise<WarehouseLabelPrintAuditResult> {
    const supabase = this.client();
    const { data: job, error: jobError } = await supabase
      .from("warehouse_label_print_jobs")
      .select("id, template_id, payload_snapshot, requested_quantity, status, created_by, created_at, printed_at, cancelled_at, reprint_of_job_id, reprint_reason")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) return { ok: false, message: "Warehouse label print job was not found." };
    const { data: items, error: itemsError } = await supabase
      .from("warehouse_label_print_items")
      .select("id, job_id, sequence, payload_snapshot, created_at")
      .eq("job_id", jobId)
      .order("sequence");
    if (itemsError) throw itemsError;
    return {
      ok: true,
      job: toWarehouseLabelPrintJob(job as WarehouseLabelPrintJobRecord),
      items: ((items ?? []) as WarehouseLabelPrintItemRecord[]).map(toWarehouseLabelPrintItem),
    };
  }

  async recordWarehouseLabelPrintOutcome(
    jobId: string,
    outcome: Exclude<WarehouseLabelPrintJobStatus, "pending">,
  ): Promise<WarehouseLabelPrintJobResult> {
    const timestampColumn = outcome === "printed" ? "printed_at" : "cancelled_at";
    const { data, error } = await this.client()
      .from("warehouse_label_print_jobs")
      .update({ status: outcome, [timestampColumn]: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "pending")
      .select("id, template_id, payload_snapshot, requested_quantity, status, created_by, created_at, printed_at, cancelled_at, reprint_of_job_id, reprint_reason")
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, message: "Warehouse label print job was not found or its outcome was already recorded." };
    return { ok: true, job: toWarehouseLabelPrintJob(data as WarehouseLabelPrintJobRecord) };
  }

  async createWarehouseLabelReprint(
    input: CreateWarehouseLabelReprintInput,
    context: RepositoryWriteContext = {},
  ): Promise<WarehouseLabelPrintJobResult> {
    const reason = input.reason?.trim();
    if (!reason) return { ok: false, message: "A reprint reason is required." };
    if (!validRequestedLabelQuantity(input.requestedQuantity)) {
      return { ok: false, message: "Requested label quantity must be a positive integer." };
    }
    const supabase = this.client();
    const { data: original, error: originalError } = await supabase
      .from("warehouse_label_print_jobs")
      .select("id, template_id, payload_snapshot")
      .eq("id", input.reprintOfJobId)
      .maybeSingle();
    if (originalError) throw originalError;
    if (!original) return { ok: false, message: "Original warehouse label print job was not found." };

    const { data, error } = await supabase
      .from("warehouse_label_print_jobs")
      .insert({
        template_id: original.template_id,
        payload_snapshot: original.payload_snapshot,
        requested_quantity: input.requestedQuantity,
        created_by: context.actorId ?? null,
        reprint_of_job_id: input.reprintOfJobId,
        reprint_reason: reason,
      })
      .select("id, template_id, payload_snapshot, requested_quantity, status, created_by, created_at, printed_at, cancelled_at, reprint_of_job_id, reprint_reason")
      .single();
    if (error || !data) throw error ?? new Error("Warehouse label reprint job insert failed.");
    return { ok: true, job: toWarehouseLabelPrintJob(data as WarehouseLabelPrintJobRecord) };
  }

  async resetForTests(): Promise<void> {
    throw new Error(
      "Supabase repository reset is not available from the application runtime.",
    );
  }
}
