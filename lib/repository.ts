import type { VehicleLookupInput } from "./fitment";
import type { InventoryRow, MovementResult } from "./inventory";
import type {
  CancelOrderInput,
  CreateOrderInput,
  DispatchOrderInput,
  SalesOrder,
} from "./orders";
import type {
  CreateFitmentRuleInput,
  CreateProductMasterInput,
  Product,
  UpdateProductMasterInput,
} from "./catalogue";
import type { WarehouseExpectedReceipt, WarehouseInboundSelection, WarehouseLabelTemplateId } from "./warehouseLabels";
import type {
  PreparedReceiptLine,
  WarehouseReceiptMode,
  WarehouseReceiptScope,
} from "./warehouseReceiving";
import type { WarehouseHistoryAction, WarehouseHistoryEvent } from "./warehouseHistory";
import type { ValidatedPackingListRevision } from "./prearrivalShipment";
import type {
  ApproveTradeAccountApplicationResult,
  ProvisionTradeAccountLoginResult,
  TradeAccountApplication,
  TradeAccountApplicationInput,
  TradeAccountApplicationResult,
  TradeAccountStatus,
  UpdateTradeAccountStatusResult,
} from "./tradeAccounts";
import { MemoryRepository } from "./memoryRepository";
import { SupabaseRepository } from "./supabaseRepository";

export type InventoryMovementInput = {
  idempotencyKey?: string;
  type:
    "inbound" | "putaway" | "dispatch" | "return" | "quarantine" | "adjustment";
  sku: string;
  quantity: number;
  reference: string;
  location?: string;
  fromLocation?: string;
  toLocation?: string;
  adjustmentDirection?: "increase" | "decrease";
  quarantineAction?: "release" | "writeoff";
};

export type RepositoryWriteContext = {
  actorId?: string;
  tradeAccountId?: string;
};

export type WarehouseLabelPrintJobStatus = "pending" | "printed" | "cancelled";

export type WarehouseLabelPrintJob = {
  id: string;
  templateId: WarehouseLabelTemplateId;
  payloadSnapshot: Record<string, unknown>;
  requestedQuantity: number;
  status: WarehouseLabelPrintJobStatus;
  createdBy?: string;
  createdAt: string;
  printedAt?: string;
  cancelledAt?: string;
  reprintOfJobId?: string;
  reprintReason?: string;
};

export type WarehouseLabelPrintItem = {
  id: string;
  jobId: string;
  sequence: number;
  payloadSnapshot: Record<string, unknown>;
  createdAt: string;
};

export type CreateWarehouseLabelPrintJobInput = {
  templateId: WarehouseLabelTemplateId;
  payloadSnapshot: Record<string, unknown>;
  requestedQuantity: number;
};

export type CreateWarehouseLabelReprintInput = {
  reprintOfJobId: string;
  requestedQuantity: number;
  reason?: string;
};

export type WarehouseLabelPrintJobResult =
  | { ok: true; job: WarehouseLabelPrintJob }
  | { ok: false; message: string };

export type WarehouseLabelPrintItemsResult =
  | { ok: true; items: WarehouseLabelPrintItem[] }
  | { ok: false; message: string };

export type WarehouseLabelPrintAuditResult =
  | { ok: true; job: WarehouseLabelPrintJob; items: WarehouseLabelPrintItem[] }
  | { ok: false; message: string };

export type WarehouseExpectedReceiptResult =
  | { ok: true; receipt: WarehouseExpectedReceipt }
  | { ok: false; message: string };

export type WarehouseReceiptSessionStatus = "in_progress" | "confirmed" | "cancelled";

export type WarehouseReceiptSession = {
  id: string;
  shipmentId: string;
  scopeSnapshot: WarehouseReceiptScope;
  mode: WarehouseReceiptMode;
  status: WarehouseReceiptSessionStatus;
  idempotencyKey: string;
  createdBy?: string;
  createdAt: string;
  confirmedBy?: string;
  confirmedAt?: string;
  stagingLocation?: string;
  lines: PreparedReceiptLine[];
};

export type CreateWarehouseReceiptSessionInput = {
  scope: WarehouseReceiptScope;
  mode: WarehouseReceiptMode;
  lines: PreparedReceiptLine[];
  idempotencyKey: string;
};

export type WarehouseReceiptSessionResult =
  | { ok: true; session: WarehouseReceiptSession }
  | { ok: false; message: string };

export type WarehouseReceiptPrintGateResult =
  | { ok: true }
  | { ok: false; message: string };

export type WarehousePutawayScopeInput = {
  shipmentId: string;
  cartonNumbers: string[];
};

export type WarehousePutawayInput = WarehousePutawayScopeInput & {
  productBarcode: string;
  destinationLocation: string;
  quantity: number;
  idempotencyKey: string;
};

export type WarehousePutawayLine = {
  receiptSessionId: string;
  sku: string;
  productBarcode: string;
  actualQuantity: number;
  remainingQuantity: number;
};

export type WarehousePutawayScopeResult =
  | { ok: true; lines: WarehousePutawayLine[] }
  | { ok: false; message: string };

export type WarehousePutawayResult =
  | {
      ok: true;
      receiptSessionId: string;
      sourceLocation: string;
      destinationLocation: string;
      remainingQuantity: number;
      movement: StockMovement;
    }
  | { ok: false; message: string };

export type InventoryLocationStatus = "active" | "disabled" | "archived";

export type InventoryLocation = {
  id: string;
  locationCode: string;
  barcode: string;
  status: InventoryLocationStatus;
  isPutawayDestination: boolean;
  physicalDescription?: string | null;
  notes?: string | null;
  currentBalance: number;
  createdAt: string;
  createdBy?: string;
  updatedAt: string;
  updatedBy?: string;
};

export type InventoryLocationAuditAction = "created" | "updated" | "status_changed";

export type InventoryLocationAudit = {
  id: string;
  locationId: string;
  action: InventoryLocationAuditAction;
  actorId?: string;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown>;
  createdAt: string;
};

export type InventoryLocationListQuery = {
  search?: string;
  status?: InventoryLocationStatus;
  barcode?: string;
};

export type CreateInventoryLocationInput = {
  locationCode: string;
  physicalDescription?: string | null;
  notes?: string | null;
};

export type CreateInventoryLocationBatchInput = {
  locations: CreateInventoryLocationInput[];
};

export type CreateInventoryLocationBatchResult =
  | { ok: true; locations: InventoryLocation[] }
  | { ok: false; message: string };

export type UpdateInventoryLocationNotesInput = {
  id: string;
  physicalDescription?: string | null;
  notes?: string | null;
};

export type UpdateInventoryLocationNotesResult =
  | { ok: true; location: InventoryLocation }
  | { ok: false; message: string };

export type SetInventoryLocationStatusInput = {
  id: string;
  status: InventoryLocationStatus;
};

export type SetInventoryLocationStatusResult =
  | { ok: true; location: InventoryLocation }
  | { ok: false; message: string };

export type WarehouseHistoryQuery = {
  from?: string;
  to?: string;
  shipmentId?: string;
  palletNumber?: string;
  cartonNumber?: string;
  sku?: string;
  actor?: string;
  action?: WarehouseHistoryAction;
};

export type WarehouseHistoryResult = {
  ok: true;
  events: WarehouseHistoryEvent[];
};

export type PackingListRevisionStatus = "draft" | "confirmed" | "superseded";

export type PackingListRevision = {
  id: string;
  shipmentId: string;
  version: number;
  status: PackingListRevisionStatus;
  payloadSnapshot: ValidatedPackingListRevision;
  totalExpectedQuantity: number;
  createdBy?: string;
  createdAt: string;
  confirmedBy?: string;
  confirmedAt?: string;
};

export type PackingListRevisionResult =
  | { ok: true; revision: PackingListRevision }
  | { ok: false; message: string };

export type PrearrivalShipment = WarehouseExpectedReceipt & {
  revisions: PackingListRevision[];
  productBarcodes: Record<string, string>;
};

export type PrearrivalShipmentResult =
  | { ok: true; shipment: PrearrivalShipment }
  | { ok: false; message: string };

export type PrearrivalShipmentSummary = {
  shipmentId: string;
  shipmentReference?: string;
  status?: string;
};

export type PrearrivalShipmentListResult = {
  ok: true;
  shipments: PrearrivalShipmentSummary[];
};

export type StockMovement = {
  id: string;
  sku: string;
  movement:
    | "Inbound"
    | "Putaway"
    | "Dispatch"
    | "Return"
    | "Quarantine"
    | "Adjustment"
    | "Quarantine Release"
    | "Quarantine Write-off";
  quantity: number;
  location: string;
  reference: string;
  createdAt: string;
  createdBy?: string;
};

export type AdminCatalogueRow = {
  sku: string;
  barcode?: string;
  oemPartNumber?: string;
  brand: string;
  name: string;
  category: string;
  status: Product["status"];
  reorderPoint: number;
  reorderQuantity: number;
  tradePriceExGstCents?: number;
  onHand: number;
  reserved: number;
  quarantine: number;
  available: number;
};

export type AdminReorderAlert = {
  sku: string;
  brand: string;
  name: string;
  available: number;
  reorderPoint: number;
  suggestedOrderQty: number;
  status: Product["status"];
};

export type AdminFitmentRule = {
  sku: string;
  vehicle: string;
  engine?: string;
  confidence: string;
};

export type AdminPurchaseBatch = {
  batchNo: string;
  sku: string;
  receivedQuantity?: number;
  supplierName?: string;
  purchaseRef?: string;
  receivedDate?: string;
};

export type AdminPricingRule = {
  id: string;
  sku: string;
  channel: string;
  priceMode: string;
  unitPriceExGstCents?: number;
  status: string;
};

export type AdminRfqReview = {
  id: string;
  brand: string;
  vehicle: string;
  requestedPart: string;
  priority: string;
  status: string;
};

export type AdminLookupRequest = {
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
};

export type AdminUserRole = {
  userId: string;
  role: string;
  displayName?: string;
  tradeAccountId?: string;
};

export type AdminState = {
  metrics: {
    activeSkus: number;
    onHandUnits: number;
    availableUnits: number;
    reorderAlerts: number;
    openTasks: number;
  };
  catalogue: AdminCatalogueRow[];
  reorderAlerts: AdminReorderAlert[];
  stockMovements: StockMovement[];
  orders: SalesOrder[];
  accountDocuments: AccountDocument[];
  accountApplications: TradeAccountApplication[];
  tradeAccounts: TradeAccountApplication[];
  fitmentRules: AdminFitmentRule[];
  purchaseBatches: AdminPurchaseBatch[];
  pricingRules: AdminPricingRule[];
  rfqReviews: AdminRfqReview[];
  lookupRequests: AdminLookupRequest[];
  userRoles: AdminUserRole[];
};

export type AccountDocument = {
  id: string;
  tradeAccountId: string;
  type:
    | "order_confirmation"
    | "invoice"
    | "credit_note"
    | "statement"
    | "delivery_record";
  reference: string;
  storagePath?: string;
  createdAt: string;
};

export type AccountDocumentAccessResult =
  | { ok: true; document: AccountDocument; downloadUrl: string }
  | { ok: false; message: string };

export type TradeAccountState = {
  tradeAccountId: string;
  orders: SalesOrder[];
  accountDocuments: AccountDocument[];
};

export type VehicleLookupResult = {
  vehicle: {
    make: string;
    model: string;
    year?: number;
    engine?: string;
    market: "AU-spec";
    confidence: "exact" | "manual_review";
  };
  matches: Array<
    AdminCatalogueRow & {
      vehicle: string;
      fitment: string;
      fitmentConfidence: string;
    }
  >;
};

export type InventoryMovementResult =
  | { ok: true; inventory: InventoryRow[]; movement: StockMovement }
  | MovementResult;

export type SubmitOrderResult =
  | { ok: true; order: SalesOrder; inventory: InventoryRow[] }
  | { ok: false; message: string };

export type DispatchOrderResult =
  | {
      ok: true;
      order: SalesOrder;
      inventory: InventoryRow[];
      movements: StockMovement[];
    }
  | { ok: false; message: string };

export type CancelOrderResult =
  | { ok: true; order: SalesOrder; inventory: InventoryRow[] }
  | { ok: false; message: string };

export type UpdateProductMasterResult =
  { ok: true; product: AdminCatalogueRow } | { ok: false; message: string };

export type CreateProductMasterResult =
  { ok: true; product: AdminCatalogueRow } | { ok: false; message: string };

export type CreateFitmentRuleResult =
  { ok: true; rule: AdminFitmentRule } | { ok: false; message: string };

export interface DrivemateRepository {
  mode: "memory" | "supabase";
  getAdminState(): Promise<AdminState>;
  getTradeAccountState(tradeAccountId: string): Promise<TradeAccountState>;
  getAccountDocumentAccess(
    documentId: string,
    tradeAccountId?: string,
  ): Promise<AccountDocumentAccessResult>;
  lookupVehicle(
    input: VehicleLookupInput,
    context?: RepositoryWriteContext,
  ): Promise<VehicleLookupResult>;
  applyInventoryMovement(
    input: InventoryMovementInput,
    context?: RepositoryWriteContext,
  ): Promise<InventoryMovementResult>;
  listInventoryLocations(
    query?: InventoryLocationListQuery,
  ): Promise<InventoryLocation[]>;
  createInventoryLocationBatch(
    input: CreateInventoryLocationBatchInput,
    context?: RepositoryWriteContext,
  ): Promise<CreateInventoryLocationBatchResult>;
  updateInventoryLocationNotes(
    input: UpdateInventoryLocationNotesInput,
    context?: RepositoryWriteContext,
  ): Promise<UpdateInventoryLocationNotesResult>;
  setInventoryLocationStatus(
    input: SetInventoryLocationStatusInput,
    context?: RepositoryWriteContext,
  ): Promise<SetInventoryLocationStatusResult>;
  resolveActivePhysicalDestination(barcode: string): Promise<InventoryLocation | null>;
  listInventoryLocationAudit(locationId: string): Promise<InventoryLocationAudit[]>;
  getWarehouseExpectedReceipt(
    selection: WarehouseInboundSelection,
  ): Promise<WarehouseExpectedReceiptResult>;
  checkWarehouseReceiptPrintGate(
    scope: WarehouseReceiptScope,
  ): Promise<WarehouseReceiptPrintGateResult>;
  createWarehouseReceiptSession(
    input: CreateWarehouseReceiptSessionInput,
    context?: RepositoryWriteContext,
  ): Promise<WarehouseReceiptSessionResult>;
  confirmWarehouseReceipt(
    sessionId: string,
    context?: RepositoryWriteContext,
  ): Promise<WarehouseReceiptSessionResult>;
  getWarehousePutawayScope(
    input: WarehousePutawayScopeInput,
  ): Promise<WarehousePutawayScopeResult>;
  putAwayWarehouseReceipt(
    input: WarehousePutawayInput,
    context?: RepositoryWriteContext,
  ): Promise<WarehousePutawayResult>;
  listWarehouseHistory(
    query?: WarehouseHistoryQuery,
  ): Promise<WarehouseHistoryResult>;
  listPrearrivalShipments(): Promise<PrearrivalShipmentListResult>;
  getPrearrivalShipment(shipmentId: string): Promise<PrearrivalShipmentResult>;
  createPackingListRevision(
    input: ValidatedPackingListRevision,
    context?: RepositoryWriteContext,
  ): Promise<PackingListRevisionResult>;
  confirmPackingListRevision(
    revisionId: string,
    context?: RepositoryWriteContext,
  ): Promise<PackingListRevisionResult>;
  createWarehouseLabelPrintJob(
    input: CreateWarehouseLabelPrintJobInput,
    context?: RepositoryWriteContext,
  ): Promise<WarehouseLabelPrintJobResult>;
  appendWarehouseLabelPrintItems(
    jobId: string,
    payloadSnapshots: Record<string, unknown>[],
  ): Promise<WarehouseLabelPrintItemsResult>;
  getWarehouseLabelPrintJob(jobId: string): Promise<WarehouseLabelPrintAuditResult>;
  recordWarehouseLabelPrintOutcome(
    jobId: string,
    outcome: Exclude<WarehouseLabelPrintJobStatus, "pending">,
  ): Promise<WarehouseLabelPrintJobResult>;
  createWarehouseLabelReprint(
    input: CreateWarehouseLabelReprintInput,
    context?: RepositoryWriteContext,
  ): Promise<WarehouseLabelPrintJobResult>;
  submitOrder(
    input: CreateOrderInput,
    context?: RepositoryWriteContext,
  ): Promise<SubmitOrderResult>;
  dispatchOrder(
    orderId: string,
    input: DispatchOrderInput,
    context?: RepositoryWriteContext,
  ): Promise<DispatchOrderResult>;
  cancelOrder(
    orderId: string,
    input?: CancelOrderInput,
    context?: RepositoryWriteContext,
  ): Promise<CancelOrderResult>;
  submitTradeAccountApplication(
    input: TradeAccountApplicationInput,
  ): Promise<TradeAccountApplicationResult>;
  approveTradeAccountApplication(
    applicationId: string,
    context?: RepositoryWriteContext,
  ): Promise<ApproveTradeAccountApplicationResult>;
  provisionTradeAccountLogin(
    applicationId: string,
    context?: RepositoryWriteContext,
  ): Promise<ProvisionTradeAccountLoginResult>;
  updateTradeAccountStatus(
    applicationId: string,
    status: TradeAccountStatus,
    context?: RepositoryWriteContext,
  ): Promise<UpdateTradeAccountStatusResult>;
  createProductMaster(
    input: CreateProductMasterInput,
    context?: RepositoryWriteContext,
  ): Promise<CreateProductMasterResult>;
  updateProductMaster(
    input: UpdateProductMasterInput,
    context?: RepositoryWriteContext,
  ): Promise<UpdateProductMasterResult>;
  createFitmentRule(
    input: CreateFitmentRuleInput,
    context?: RepositoryWriteContext,
  ): Promise<CreateFitmentRuleResult>;
  resetForTests(): Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __drivemateRepository: DrivemateRepository | undefined;
}

export function getRepository(): DrivemateRepository {
  if (globalThis.__drivemateRepository) return globalThis.__drivemateRepository;

  const mode = process.env.DRIVEMATE_REPOSITORY;
  globalThis.__drivemateRepository =
    mode === "supabase" ? new SupabaseRepository() : new MemoryRepository();
  return globalThis.__drivemateRepository;
}
