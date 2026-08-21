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
