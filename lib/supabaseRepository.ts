import { randomBytes } from "node:crypto";
import { createAccountDocumentText } from "./accountDocumentContent";
import type { CreateFitmentRuleInput, CreateProductMasterInput, FitmentRule, UpdateProductMasterInput } from "./catalogue";
import { demoUserRoles, pilotPricingRules, pilotRfqReviews } from "./adminMasterData";
import { matchCataloguePartsForVehicle, type VehicleLookupInput } from "./fitment";
import { availableStock, type InventoryRow } from "./inventory";
import { calculateOrderPricing, defaultPriceResolver } from "./pricing";
import {
  validateDispatchScans,
  type CancelOrderInput,
  type CreateOrderInput,
  type DispatchOrderInput,
  type DispatchScanInput,
  type SalesOrder,
} from "./orders";
import { formatWarehouseLocation, parseWarehouseLocation, type WarehouseLocationParts } from "./warehouseLocation";
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
  status: "draft" | "submitted" | "confirmed" | "picked" | "dispatched" | "cancelled";
  subtotal_ex_gst_cents?: number | null;
  gst_cents?: number | null;
  total_inc_gst_cents?: number | null;
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
  document_type: "invoice" | "statement" | "delivery_record";
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
  confidence: "mock_match" | "manual_review";
  created_by?: string | null;
  created_at: string;
};

type UserProfileRecord = {
  id: string;
  role: string;
  display_name?: string | null;
  trade_account_id?: string | null;
};

function productSku(record: MovementRecord | { products?: { sku?: string } | { sku?: string }[] }) {
  return Array.isArray(record.products) ? record.products[0]?.sku : record.products?.sku;
}

function batchNo(record?: { inventory_batches?: { batch_no?: string } | { batch_no?: string }[] | null }) {
  const batch = record?.inventory_batches;
  if (!batch) return undefined;
  return Array.isArray(batch) ? batch[0]?.batch_no : batch.batch_no;
}

function locationRecord(record?: LocationRecord | LocationRecord[] | null): LocationRecord | undefined {
  if (!record) return undefined;
  return Array.isArray(record) ? record[0] : record;
}

function locationLabel(record?: LocationRecord | LocationRecord[] | null): string | undefined {
  const location = locationRecord(record);
  return location
    ? formatWarehouseLocation({
        warehouse: location.warehouse,
        zone: location.zone,
        binCode: location.bin_code,
      })
    : undefined;
}

function toInventoryRows(products: ProductRecord[], balances: BalanceRecord[]): InventoryRow[] {
  return products.map((product) => {
    const productBalances = balances.filter((balance) => balance.product_id === product.id);
    return {
      sku: product.sku,
      onHand: productBalances.reduce((sum, balance) => sum + balance.on_hand, 0),
      reserved: productBalances.reduce((sum, balance) => sum + balance.reserved, 0),
      quarantine: productBalances.reduce((sum, balance) => sum + balance.quarantine, 0),
    };
  });
}

function toCatalogueRows(products: ProductRecord[], balances: BalanceRecord[]): AdminState["catalogue"] {
  return products.map((product) => {
    const productBalances = balances.filter((balance) => balance.product_id === product.id);
    const row = {
      sku: product.sku,
      onHand: productBalances.reduce((sum, balance) => sum + balance.on_hand, 0),
      reserved: productBalances.reduce((sum, balance) => sum + balance.reserved, 0),
      quarantine: productBalances.reduce((sum, balance) => sum + balance.quarantine, 0),
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
    movementType === "inbound" || movementType === "return" || movementType === "putaway" || (movementType === "adjustment" && !!record.to_location)
      ? locationLabel(record.to_location)
      : locationLabel(record.from_location);

  const movement =
    movementType === "adjustment" && record.reference_type === "quarantine_release"
      ? "Quarantine Release"
      : movementType === "adjustment" && record.reference_type === "quarantine_writeoff"
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

function statementStoragePath(tradeAccountId: string, date = new Date()): string {
  return `generated/statements/${statementMonth(date)}/${tradeAccountId}.txt`;
}

function invoiceStoragePath(orderId: string): string {
  return `generated/invoices/${orderId}.txt`;
}

function deliveryRecordStoragePath(orderId: string): string {
  return `generated/delivery-records/${orderId}.txt`;
}

function temporaryPassword(): string {
  return `DMp-${randomBytes(12).toString("base64url")}-1aA!`;
}

export class SupabaseRepository implements DrivemateRepository {
  mode = "supabase" as const;

  private client() {
    return createServiceSupabaseClient();
  }

  private accountDocumentsBucket() {
    return process.env.SUPABASE_ACCOUNT_DOCUMENTS_BUCKET ?? "account-documents";
  }

  private async uploadGeneratedAccountDocument(input: {
    storagePath: string;
    type: AccountDocument["type"];
    reference: string;
    tradeAccountId: string;
    contentLines?: string[];
  }) {
    const supabase = this.client();
    const content = createAccountDocumentText({
      type: input.type,
      reference: input.reference,
      tradeAccountId: input.tradeAccountId,
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
    const candidates = Array.from(new Set([raw, raw.toUpperCase()])).filter(Boolean);

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
      const { data, error } = await this.client().auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;

      const user = data.users.find((candidate) => candidate.email?.toLowerCase() === target);
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
    if (existing) return { ...(existing as LocationRecord & { id: string }), parsed: location };

    const { data, error } = await supabase
      .from("inventory_locations")
      .insert({
        warehouse: location.warehouse,
        zone: location.zone,
        bin_code: location.binCode,
      })
      .select("id, warehouse, zone, bin_code")
      .single();

    if (error || !data) throw error ?? new Error("Inventory location insert failed.");
    return { ...(data as LocationRecord & { id: string }), parsed: location };
  }

  private async ensureInventoryBatch(productId: string, batchNo: string, type: InventoryMovementInput["type"]) {
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
        supplier_name: type === "return" ? "Return intake" : type === "adjustment" ? "Stock adjustment" : "Inbound receiving",
        purchase_ref: normalizedBatchNo,
        received_date: new Date().toISOString().slice(0, 10),
      })
      .select("id, batch_no")
      .single();

    if (error || !data) throw error ?? new Error("Inventory batch insert failed.");
    return data as { id: string; batch_no: string };
  }

  private async getOrCreateBalance(productId: string, locationId: string, batchId: string) {
    const supabase = this.client();
    const { data: existing, error: existingError } = await supabase
      .from("inventory_balances")
      .select("id, product_id, location_id, batch_id, on_hand, reserved, quarantine")
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
      .select("id, product_id, location_id, batch_id, on_hand, reserved, quarantine")
      .single();

    if (error || !data) throw error ?? new Error("Inventory balance insert failed.");
    return data as BalanceRecord;
  }

  private async selectBalanceForDecrease(productId: string, quantity: number) {
    const supabase = this.client();
    const { data, error } = await supabase
      .from("inventory_balances")
      .select("id, product_id, location_id, batch_id, on_hand, reserved, quarantine")
      .eq("product_id", productId)
      .order("on_hand", { ascending: false });

    if (error) throw error;
    const balances = (data ?? []) as BalanceRecord[];
    return balances.find((balance) => availableStock({
      sku: productId,
      onHand: balance.on_hand,
      reserved: balance.reserved,
      quarantine: balance.quarantine,
    }) >= quantity) ?? balances[0];
  }

  private async selectBalanceForLocationDecrease(productId: string, locationId: string, quantity: number) {
    const supabase = this.client();
    const { data, error } = await supabase
      .from("inventory_balances")
      .select("id, product_id, location_id, batch_id, on_hand, reserved, quarantine")
      .eq("product_id", productId)
      .eq("location_id", locationId)
      .order("on_hand", { ascending: false });

    if (error) throw error;
    const balances = (data ?? []) as BalanceRecord[];
    return balances.find((balance) =>
      availableStock({
        sku: productId,
        onHand: balance.on_hand,
        reserved: balance.reserved,
        quarantine: balance.quarantine,
      }) >= quantity,
    );
  }

  private async selectBalanceForLocationQuarantine(productId: string, locationId: string, quantity: number) {
    const supabase = this.client();
    const { data, error } = await supabase
      .from("inventory_balances")
      .select("id, product_id, location_id, batch_id, on_hand, reserved, quarantine")
      .eq("product_id", productId)
      .eq("location_id", locationId)
      .order("quarantine", { ascending: false });

    if (error) throw error;
    const balances = (data ?? []) as BalanceRecord[];
    return balances.find((balance) => balance.quarantine >= quantity);
  }

  private async selectBalanceForQuarantine(productId: string, quantity: number) {
    const supabase = this.client();
    const { data, error } = await supabase
      .from("inventory_balances")
      .select("id, product_id, location_id, batch_id, on_hand, reserved, quarantine")
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
      contentLines: [`Statement month: ${statementMonth()}`, "Document status: Generated for account portal access."],
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
    const [{ data: products, error: productsError }, { data: balances, error: balancesError }] = await Promise.all([
      supabase.from("products").select("id, sku, brand, part_name, category, barcode, oem_part_number, reorder_point, reorder_quantity, status"),
      supabase.from("inventory_balances").select("id, product_id, on_hand, reserved, quarantine"),
    ]);

    if (productsError) throw productsError;
    if (balancesError) throw balancesError;

    const productRecords = (products ?? []) as ProductRecord[];
    const balanceRecords = (balances ?? []) as BalanceRecord[];
    const inventory = toInventoryRows(productRecords, balanceRecords);
    const catalogue = toCatalogueRows(productRecords, balanceRecords);
    const activeCatalogue = catalogue.filter((row) => row.status === "active");
    const reorderAlerts = catalogue
      .filter((row) => row.status === "active" && row.reorderPoint > 0 && row.available <= row.reorderPoint)
      .map((row) => ({
        sku: row.sku,
        brand: row.brand,
        name: row.name,
        available: row.available,
        reorderPoint: row.reorderPoint,
        suggestedOrderQty: Math.max(row.reorderQuantity, row.reorderPoint - row.available),
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
          "id, trade_account_id, po_number, vehicle_vin, vehicle_rego, status, subtotal_ex_gst_cents, gst_cents, total_inc_gst_cents, created_by, sales_order_lines(quantity, unit_price_ex_gst_cents, line_total_ex_gst_cents, gst_cents, line_total_inc_gst_cents, products(sku))",
        )
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("account_documents")
        .select("id, trade_account_id, document_type, document_ref, storage_path, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("fitment_rules")
        .select("make, model, year_from, year_to, engine, confidence, products(sku)")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("inventory_batches")
        .select("batch_no, supplier_name, purchase_ref, received_date, products(sku)")
        .order("received_date", { ascending: false })
        .limit(30),
      supabase
        .from("stock_movements")
        .select("quantity, products(sku), inventory_batches(batch_no)")
        .eq("movement_type", "inbound")
        .limit(500),
      supabase.from("pricing_rules").select("id, sku, channel, price_mode, unit_price_ex_gst_cents, status").order("sku", { ascending: true }).limit(30),
      supabase.from("rfq_reviews").select("id, brand, vehicle, requested_part, priority, status").order("created_at", { ascending: false }).limit(30),
      supabase
        .from("vehicle_lookup_requests")
        .select("id, trade_account_id, rego, vin, query, vehicle, match_count, confidence, created_by, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("user_profiles").select("id, role, display_name, trade_account_id").order("role", { ascending: true }).limit(30),
    ]);
    const { data: applicationRecords, error: applicationsError } = await supabase
      .from("trade_accounts")
      .select("id, account_name, abn, contact_name, contact_email, contact_phone, postcode, notes, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);

    if (applicationsError) throw applicationsError;

    const { data: tradeAccountRecords, error: tradeAccountsError } = await supabase
      .from("trade_accounts")
      .select("id, account_name, abn, contact_name, contact_email, contact_phone, postcode, notes, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (tradeAccountsError) throw tradeAccountsError;

    const stockMovements = ((movementRecords ?? []) as MovementRecord[]).map(toStockMovement);
    const orders = ((orderRecords ?? []) as SalesOrderRecord[]).map(toSalesOrder);
    const accountDocuments = ((accountDocumentRecords ?? []) as AccountDocumentRecord[]).map(toAccountDocument);
    const accountApplications = ((applicationRecords ?? []) as TradeAccountRecord[]).map(toTradeAccountApplication);
    const tradeAccounts = ((tradeAccountRecords ?? []) as TradeAccountRecord[]).map(toTradeAccountApplication);
    const fitmentRules = ((fitmentRecords ?? []) as FitmentRuleRecord[]).map((rule) => ({
      sku: productSku(rule) ?? "UNKNOWN",
      vehicle: `${rule.make} ${rule.model} ${rule.year_from ?? ""}${rule.year_to ? `-${rule.year_to}` : "-on"}`.trim(),
      engine: rule.engine ?? undefined,
      confidence: rule.confidence,
    }));
    const receivedQuantityByBatch = ((inboundBatchMovementRecords ?? []) as InboundBatchMovementRecord[]).reduce(
      (map, movement) => {
        const key = `${batchNo(movement) ?? ""}::${productSku(movement) ?? ""}`;
        map.set(key, (map.get(key) ?? 0) + movement.quantity);
        return map;
      },
      new Map<string, number>(),
    );
    const purchaseBatches = ((batchRecords ?? []) as InventoryBatchRecord[]).map((batch) => ({
      batchNo: batch.batch_no,
      sku: productSku(batch) ?? "UNKNOWN",
      receivedQuantity: receivedQuantityByBatch.get(`${batch.batch_no}::${productSku(batch) ?? "UNKNOWN"}`) ?? undefined,
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
        .map((rule) => [rule.sku, rule.unitPriceExGstCents ?? defaultPriceResolver(rule.sku)]),
    );
    const pricedCatalogue = catalogue.map((row) => ({
      ...row,
      tradePriceExGstCents: tradePriceBySku.get(row.sku) ?? defaultPriceResolver(row.sku),
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
    const lookupRequests = ((lookupRequestRecords ?? []) as LookupRequestRecord[]).map(toLookupRequest);
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
        onHandUnits: activeCatalogue.reduce((sum, item) => sum + item.onHand, 0),
        availableUnits: activeCatalogue.reduce((sum, item) => sum + item.available, 0),
        reorderAlerts: reorderAlerts.length,
        openTasks: 4 + orders.length + stockMovements.length + accountApplications.length + reorderAlerts.length,
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

  async lookupVehicle(input: VehicleLookupInput, context: RepositoryWriteContext = {}) {
    const supabase = this.client();
    const state = await this.getAdminState();
    const { data, error } = await supabase
      .from("fitment_rules")
      .select("make, model, year_from, year_to, engine, confidence, products(sku)")
      .limit(500);

    if (error) throw error;
    const rules = ((data ?? []) as FitmentRuleRecord[]).map(toFitmentRule).filter((rule) => rule !== null);
    const result = matchCataloguePartsForVehicle(input, state.catalogue, rules);
    const { error: lookupError } = await supabase.from("vehicle_lookup_requests").insert({
      trade_account_id: context.tradeAccountId,
      rego: input.rego,
      vin: input.vin,
      query: input.query,
      vehicle: `${result.vehicle.make} ${result.vehicle.model} ${result.vehicle.year}`,
      match_count: result.matches.length,
      confidence: result.vehicle.confidence,
      created_by: context.actorId,
    });

    if (lookupError) throw lookupError;
    return result;
  }

  async getTradeAccountState(tradeAccountId: string): Promise<TradeAccountState> {
    const supabase = this.client();
    const [{ data: orderRecords, error: orderError }, { data: documentRecords, error: documentError }] = await Promise.all([
      supabase
        .from("sales_orders")
        .select(
          "id, trade_account_id, po_number, vehicle_vin, vehicle_rego, status, subtotal_ex_gst_cents, gst_cents, total_inc_gst_cents, created_by, created_at, sales_order_lines(quantity, unit_price_ex_gst_cents, line_total_ex_gst_cents, gst_cents, line_total_inc_gst_cents, products(sku))",
        )
        .eq("trade_account_id", tradeAccountId)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("account_documents")
        .select("id, trade_account_id, document_type, document_ref, storage_path, created_at")
        .eq("trade_account_id", tradeAccountId)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    if (orderError) throw orderError;
    if (documentError) throw documentError;

    return {
      tradeAccountId,
      orders: ((orderRecords ?? []) as SalesOrderRecord[]).map(toSalesOrder),
      accountDocuments: ((documentRecords ?? []) as AccountDocumentRecord[]).map(toAccountDocument),
    };
  }

  async getAccountDocumentAccess(documentId: string, tradeAccountId?: string): Promise<AccountDocumentAccessResult> {
    const supabase = this.client();
    let query = supabase
      .from("account_documents")
      .select("id, trade_account_id, document_type, document_ref, storage_path, created_at")
      .eq("id", documentId);

    if (tradeAccountId) query = query.eq("trade_account_id", tradeAccountId);

    const { data, error } = await query.single();
    if (error || !data) return { ok: false, message: "Account document was not found." };

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
  }

  async submitOrder(input: CreateOrderInput, context: RepositoryWriteContext = {}): Promise<SubmitOrderResult> {
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
  }

  async dispatchOrder(
    orderId: string,
    input: DispatchOrderInput,
    context: RepositoryWriteContext = {},
  ): Promise<DispatchOrderResult> {
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
  }

  async cancelOrder(orderId: string, input: CancelOrderInput = {}): Promise<CancelOrderResult> {
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
  }

  async submitTradeAccountApplication(
    input: TradeAccountApplicationInput,
  ): Promise<TradeAccountApplicationResult> {
    const supabase = this.client();
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
      })
      .select("id, account_name, abn, contact_name, contact_email, contact_phone, postcode, notes, status, created_at")
      .single();

    if (error || !data) throw error ?? new Error("Trade account application insert failed.");
    return { ok: true, application: toTradeAccountApplication(data as TradeAccountRecord) };
  }

  async approveTradeAccountApplication(applicationId: string): Promise<ApproveTradeAccountApplicationResult> {
    const supabase = this.client();
    const { data: existing, error: existingError } = await supabase
      .from("trade_accounts")
      .select("id, status")
      .eq("id", applicationId)
      .single();

    if (existingError || !existing) return { ok: false, message: "Trade account application was not found." };
    if (existing.status !== "pending") return { ok: false, message: "Trade account application is not pending." };

    const { data, error } = await supabase
      .from("trade_accounts")
      .update({ status: "approved" })
      .eq("id", applicationId)
      .select("id, account_name, abn, contact_name, contact_email, contact_phone, postcode, notes, status, created_at")
      .single();

    if (error || !data) throw error ?? new Error("Trade account application approval failed.");
    return { ok: true, application: toTradeAccountApplication(data as TradeAccountRecord) };
  }

  async provisionTradeAccountLogin(applicationId: string): Promise<ProvisionTradeAccountLoginResult> {
    const supabase = this.client();
    const { data: existing, error: existingError } = await supabase
      .from("trade_accounts")
      .select("id, account_name, abn, contact_name, contact_email, contact_phone, postcode, notes, status, created_at")
      .eq("id", applicationId)
      .single();

    if (existingError || !existing) return { ok: false, message: "Trade account application was not found." };
    const account = existing as TradeAccountRecord;
    if (account.status === "paused" || account.status === "closed") {
      return { ok: false, message: "Paused or closed trade accounts cannot be provisioned." };
    }
    if (!account.contact_email) {
      return { ok: false, message: "Trade account contact email is required before login can be provisioned." };
    }

    const password = temporaryPassword();
    const existingUser = await this.findAuthUserByEmail(account.contact_email);
    let user = existingUser;
    if (!user) {
      const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
        email: account.contact_email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: account.contact_name ?? account.account_name,
          drivemate_role: "trade",
          trade_account_id: account.id,
        },
      });

      if (createError) throw createError;
      user = createdUser.user;
    }

    if (!user) return { ok: false, message: "Trade account user could not be created." };

    const { data: updatedAccount, error: updateError } = await supabase
      .from("trade_accounts")
      .update({ status: "approved" })
      .eq("id", account.id)
      .select("id, account_name, abn, contact_name, contact_email, contact_phone, postcode, notes, status, created_at")
      .single();

    if (updateError || !updatedAccount) throw updateError ?? new Error("Trade account approval failed.");

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
      application: toTradeAccountApplication(updatedAccount as TradeAccountRecord),
      login: {
        email: account.contact_email,
        userId: user.id,
        created: !existingUser,
        temporaryPassword: existingUser ? undefined : password,
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
      .select("id, account_name, abn, contact_name, contact_email, contact_phone, postcode, notes, status, created_at")
      .maybeSingle();

    if (error) throw error;
    if (!data) return { ok: false, message: "Trade account was not found." };

    return { ok: true, application: toTradeAccountApplication(data as TradeAccountRecord) };
  }

  async createProductMaster(input: CreateProductMasterInput): Promise<CreateProductMasterResult> {
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
        return { ok: false, message: "SKU, barcode, or OEM part number is already mapped." };
      }
      throw error;
    }
    if (!data) return { ok: false, message: "Product master could not be created." };

    const state = await this.getAdminState();
    const product = state.catalogue.find((row) => row.sku === sku);
    return product ? { ok: true, product } : { ok: false, message: "SKU was not found." };
  }

  async updateProductMaster(input: UpdateProductMasterInput): Promise<UpdateProductMasterResult> {
    const supabase = this.client();
    const update: Record<string, string | number | null> = {};

    if (input.barcode !== undefined) update.barcode = input.barcode.trim() || null;
    if (input.oemPartNumber !== undefined) update.oem_part_number = input.oemPartNumber.trim() || null;
    if (input.brand !== undefined) update.brand = input.brand;
    if (input.name !== undefined) update.part_name = input.name.trim();
    if (input.category !== undefined) update.category = input.category.trim();
    if (input.reorderPoint !== undefined) update.reorder_point = input.reorderPoint;
    if (input.reorderQuantity !== undefined) update.reorder_quantity = input.reorderQuantity;
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
    return product ? { ok: true, product } : { ok: false, message: "SKU was not found." };
  }

  async createFitmentRule(input: CreateFitmentRuleInput): Promise<CreateFitmentRuleResult> {
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
    if (duplicate) return { ok: false, message: "Fitment rule already exists for this SKU and vehicle." };

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

  async resetForTests(): Promise<void> {
    throw new Error("Supabase repository reset is not available from the application runtime.");
  }
}
