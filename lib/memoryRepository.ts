import {
  accountDocumentDataUrl,
  createDeliveryRecordText,
  createInvoiceDocumentText,
  createOrderConfirmationDocumentText,
  createStatementDocumentText,
} from "./accountDocumentContent";
import {
  createFitmentRuleData,
  createProductMasterData,
  fitmentRules,
  findProductBySku,
  getCatalogueWithAvailability,
  resetProductMasterData,
  resolveSkuIdentifier,
  updateProductMasterData,
  type CreateFitmentRuleInput,
  type CreateProductMasterInput,
  type UpdateProductMasterInput,
} from "./catalogue";
import {
  demoUserRoles,
  pilotPricingRules,
  pilotPurchaseBatches,
  pilotRfqReviews,
} from "./adminMasterData";
import { matchPartsForVehicle, type VehicleLookupInput } from "./fitment";
import {
  validateDispatchScans,
  type CreateOrderInput,
  type DispatchOrderInput,
  type DispatchScanInput,
} from "./orders";
import {
  applyInventoryMovement,
  approveTradeAccountApplication,
  cancelOrder,
  dispatchOrder,
  ensureInventoryRow,
  getInventoryState,
  provisionTradeAccountLogin,
  receiveQuarantinedStock,
  recordLookupRequest,
  resetStoreForTests,
  submitOrder,
  submitTradeAccountApplication,
  updateTradeAccountStatus,
} from "./store";
import type {
  AccountDocumentAccessResult,
  AdminCatalogueRow,
  AdminReorderAlert,
  AdminState,
  DrivemateRepository,
  InventoryMovementInput,
  RepositoryWriteContext,
  TradeAccountState,
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
import { filterWarehouseExpectedReceipt, type WarehouseExpectedReceipt, type WarehouseInboundSelection, type WarehouseLabelPrintScope } from "./warehouseLabels";
import { RECEIVING_STAGING_LOCATION, type WarehouseReceiptScope } from "./warehouseReceiving";
import { validatePackingListRevision, type ValidatedPackingListRevision } from "./prearrivalShipment";
import type {
  TradeAccountApplicationInput,
  TradeAccountStatus,
} from "./tradeAccounts";

function priceForSku(sku: string): number | undefined {
  return pilotPricingRules.find(
    (rule) => rule.sku === sku && rule.status === "active",
  )?.unitPriceExGstCents;
}

function buildReorderAlerts(
  catalogue: AdminCatalogueRow[],
): AdminReorderAlert[] {
  return catalogue
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
}

let warehouseLabelJobSequence = 0;
let warehouseLabelItemSequence = 0;
let warehouseLabelPrintJobs: WarehouseLabelPrintJob[] = [];
let warehouseLabelPrintItems: WarehouseLabelPrintItem[] = [];
let warehouseReceiptSessionSequence = 0;
let warehouseReceiptSessions: WarehouseReceiptSession[] = [];

function clonePayload(payload: Record<string, unknown>) {
  return structuredClone(payload);
}

function cloneWarehouseLabelPrintJob(job: WarehouseLabelPrintJob): WarehouseLabelPrintJob {
  return { ...job, payloadSnapshot: clonePayload(job.payloadSnapshot) };
}

function cloneWarehouseReceiptSession(session: WarehouseReceiptSession): WarehouseReceiptSession {
  return structuredClone(session);
}

function scopeIsCoveredByPrintedUnitProductJob(
  scope: WarehouseReceiptScope,
  job: WarehouseLabelPrintJob,
) {
  if (job.templateId !== "unit_product" || job.status !== "printed") return false;
  const requiredQuantity = scope.lines.reduce((total, line) => total + line.expectedQuantity, 0);
  if (job.requestedQuantity < requiredQuantity) return false;

  const payload = job.payloadSnapshot as Partial<WarehouseLabelPrintScope>;
  if (payload.shipmentId !== scope.shipmentId || !Array.isArray(payload.cartonNumbers) || !Array.isArray(payload.lines)) {
    return false;
  }

  const printedCartons = new Set(payload.cartonNumbers.map((carton) => carton.trim().toUpperCase()));
  if (!scope.cartonNumbers.every((carton) => printedCartons.has(carton.trim().toUpperCase()))) {
    return false;
  }

  return scope.lines.every((line) =>
    payload.lines?.some((printedLine) =>
      printedLine.sku === line.sku &&
      printedLine.productBarcode?.trim().toUpperCase() === line.productBarcode.trim().toUpperCase() &&
      printedLine.expectedQuantity === line.expectedQuantity,
    ),
  );
}

function cloneWarehouseLabelPrintItem(item: WarehouseLabelPrintItem): WarehouseLabelPrintItem {
  return { ...item, payloadSnapshot: clonePayload(item.payloadSnapshot) };
}

function validRequestedQuantity(value: number) {
  return Number.isInteger(value) && value > 0;
}

function initialPackingListRevision(): PackingListRevision {
  return {
    id: "memory-packing-list-shipment-test-1-v1",
    shipmentId: "shipment-test-1",
    version: 1,
    status: "confirmed",
    payloadSnapshot: {
      shipmentId: "shipment-test-1",
      pallets: [
        {
          sourcePalletNumber: "P001",
          cartons: [
            {
              sourceCartonNumber: "C001",
              lines: [
                { sku: "DM-GWM-OF-001", expectedQuantity: 12 },
                { sku: "DM-GWM-AF-002", expectedQuantity: 6 },
              ],
            },
          ],
        },
        {
          sourcePalletNumber: "P002",
          cartons: [
            {
              sourceCartonNumber: "C002",
              lines: [{ sku: "DM-GWM-OF-001", expectedQuantity: 24 }],
            },
          ],
        },
      ],
    },
    totalExpectedQuantity: 42,
    createdBy: "demo-partner-user",
    createdAt: "2026-08-29T00:00:00.000Z",
    confirmedBy: "demo-partner-user",
    confirmedAt: "2026-08-29T00:00:00.000Z",
  };
}

let packingListRevisionSequence = 1;
let packingListRevisions: PackingListRevision[] = [initialPackingListRevision()];

function clonePackingListRevision(revision: PackingListRevision): PackingListRevision {
  return { ...revision, payloadSnapshot: structuredClone(revision.payloadSnapshot) };
}

function receiptFromPackingListRevision(revision: PackingListRevision): WarehouseExpectedReceipt {
  return {
    shipmentId: revision.shipmentId,
    pallets: revision.payloadSnapshot.pallets.map((pallet) => ({
      sourcePalletNumber: pallet.sourcePalletNumber,
    })),
    cartons: revision.payloadSnapshot.pallets.flatMap((pallet) =>
      pallet.cartons.map((carton) => ({
        sourceCartonNumber: carton.sourceCartonNumber,
        sourcePalletNumber: pallet.sourcePalletNumber,
      })),
    ),
    lines: revision.payloadSnapshot.pallets.flatMap((pallet) =>
      pallet.cartons.flatMap((carton) =>
        carton.lines.map((line) => ({
          sourcePalletNumber: pallet.sourcePalletNumber,
          sourceCartonNumber: carton.sourceCartonNumber,
          sku: line.sku,
          expectedQuantity: line.expectedQuantity,
        })),
      ),
    ),
  };
}

function latestConfirmedPackingListRevision(shipmentId: string): PackingListRevision | undefined {
  return packingListRevisions
    .filter((revision) => revision.shipmentId === shipmentId && revision.status === "confirmed")
    .sort((left, right) => right.version - left.version)[0];
}

function productBarcodesFor(receipt: WarehouseExpectedReceipt): Record<string, string> {
  return Object.fromEntries(
    receipt.lines.flatMap((line) => {
      const product = findProductBySku(line.sku);
      return product?.barcode ? [[line.sku, product.barcode]] : [];
    }),
  );
}

function knownSkusFor(input: ValidatedPackingListRevision): string[] {
  return input.pallets
    .flatMap((pallet) => pallet.cartons)
    .flatMap((carton) => carton.lines)
    .map((line) => line.sku.trim().toUpperCase())
    .filter((sku) => Boolean(findProductBySku(sku)));
}

export class MemoryRepository implements DrivemateRepository {
  mode = "memory" as const;

  async getAdminState(): Promise<AdminState> {
    const state = getInventoryState();
    const catalogue = getCatalogueWithAvailability(state.inventory, {
      includeInactive: true,
    }).map((row) => ({
      ...row,
      tradePriceExGstCents: priceForSku(row.sku),
    }));
    const activeCatalogue = catalogue.filter((row) => row.status === "active");
    const reorderAlerts = buildReorderAlerts(catalogue);

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
          state.orders.length +
          state.stockMovements.length +
          state.accountApplications.length +
          reorderAlerts.length,
      },
      catalogue,
      reorderAlerts,
      stockMovements: state.stockMovements,
      orders: state.orders,
      accountDocuments: state.accountDocuments,
      accountApplications: state.accountApplications.filter(
        (application) => application.status === "pending",
      ),
      tradeAccounts: state.accountApplications,
      fitmentRules: fitmentRules.map((rule) => ({
        sku: rule.sku,
        vehicle: `${rule.make} ${rule.model} ${rule.yearFrom}${rule.yearTo ? `-${rule.yearTo}` : "-on"}`,
        engine: rule.engine,
        confidence: rule.confidence,
      })),
      purchaseBatches: [...state.purchaseBatches, ...pilotPurchaseBatches],
      pricingRules: pilotPricingRules,
      rfqReviews: pilotRfqReviews,
      lookupRequests: state.lookupRequests,
      userRoles: demoUserRoles,
    };
  }

  async lookupVehicle(
    input: VehicleLookupInput,
    context: RepositoryWriteContext = {},
  ) {
    const { inventory } = getInventoryState();
    const result = matchPartsForVehicle(input, inventory);
    const matches = result.matches.map((match) => ({
      ...match,
      tradePriceExGstCents: priceForSku(match.sku),
    }));
    recordLookupRequest({
      tradeAccountId: context.tradeAccountId,
      rego: input.rego,
      vin: input.vin,
      query: input.query,
      vehicle: `${result.vehicle.make} ${result.vehicle.model} ${result.vehicle.year}`,
      matchCount: matches.length,
      confidence: result.vehicle.confidence,
      createdBy: context.actorId,
    });
    return { ...result, matches };
  }

  async getTradeAccountState(
    tradeAccountId: string,
  ): Promise<TradeAccountState> {
    const state = getInventoryState();

    return {
      tradeAccountId,
      orders: state.orders.filter(
        (order) => order.tradeAccountId === tradeAccountId,
      ),
      accountDocuments: state.accountDocuments.filter(
        (document) => document.tradeAccountId === tradeAccountId,
      ),
    };
  }

  async getAccountDocumentAccess(
    documentId: string,
    tradeAccountId?: string,
  ): Promise<AccountDocumentAccessResult> {
    const state = getInventoryState();
    const document = state.accountDocuments.find(
      (candidate) =>
        candidate.id === documentId &&
        (!tradeAccountId || candidate.tradeAccountId === tradeAccountId),
    );

    if (!document)
      return { ok: false, message: "Account document was not found." };

    const order = state.orders.find(
      (candidate) =>
        document.reference.endsWith(candidate.id) ||
        document.storagePath?.includes(candidate.id),
    );
    const content =
      document.type === "order_confirmation" && order
        ? createOrderConfirmationDocumentText({
            reference: document.reference,
            tradeAccountId: document.tradeAccountId,
            orderId: order.id,
            poNumber: order.poNumber,
            vehicleVin: order.vehicleVin,
            vehicleRego: order.vehicleRego,
            lines: order.lines,
            generatedAt: document.createdAt,
          })
        : document.type === "invoice" && order
          ? createInvoiceDocumentText({
              reference: document.reference,
              tradeAccountId: document.tradeAccountId,
              orderId: order.id,
              poNumber: order.poNumber,
              vehicleVin: order.vehicleVin,
              vehicleRego: order.vehicleRego,
              lines: order.lines,
              generatedAt: document.createdAt,
            })
          : document.type === "delivery_record" && order
            ? createDeliveryRecordText({
                reference: document.reference,
                tradeAccountId: document.tradeAccountId,
                orderId: order.id,
                vehicleVin: order.vehicleVin,
                vehicleRego: order.vehicleRego,
                lines: order.lines,
                generatedAt: document.createdAt,
              })
            : createStatementDocumentText({
                reference: document.reference,
                tradeAccountId: document.tradeAccountId,
                statementMonth:
                  document.reference.match(/^STMT-(\d{4}-\d{2})-/)?.[1] ??
                  "Current month",
                generatedAt: document.createdAt,
              });

    return {
      ok: true,
      document,
      downloadUrl: accountDocumentDataUrl(content),
    };
  }

  async applyInventoryMovement(
    input: InventoryMovementInput,
    context: RepositoryWriteContext = {},
  ) {
    return applyInventoryMovement({ ...input, createdBy: context.actorId });
  }

  async getWarehouseExpectedReceipt(
    selection: WarehouseInboundSelection,
  ): Promise<WarehouseExpectedReceiptResult> {
    const revision = latestConfirmedPackingListRevision(selection.shipmentId);
    if (!revision) {
      return { ok: false, message: "Expected shipment was not found." };
    }
    return {
      ok: true,
      receipt: filterWarehouseExpectedReceipt(
        receiptFromPackingListRevision(revision),
        selection,
      ),
    };
  }

  async checkWarehouseReceiptPrintGate(
    scope: WarehouseReceiptScope,
  ): Promise<WarehouseReceiptPrintGateResult> {
    const covered = warehouseLabelPrintJobs.some((job) =>
      scopeIsCoveredByPrintedUnitProductJob(scope, job),
    );
    return covered
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
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) return { ok: false, message: "Idempotency key is required." };
    if (!input.lines.length) return { ok: false, message: "At least one receipt line is required." };

    const existing = warehouseReceiptSessions.find((session) => session.idempotencyKey === idempotencyKey);
    if (existing) return { ok: true, session: cloneWarehouseReceiptSession(existing) };

    const session: WarehouseReceiptSession = {
      id: `memory-receipt-session-${++warehouseReceiptSessionSequence}`,
      shipmentId: input.scope.shipmentId,
      scopeSnapshot: structuredClone(input.scope),
      mode: input.mode,
      status: "in_progress",
      idempotencyKey,
      createdBy: context.actorId,
      createdAt: new Date().toISOString(),
      lines: structuredClone(input.lines),
    };
    warehouseReceiptSessions.push(session);
    return { ok: true, session: cloneWarehouseReceiptSession(session) };
  }

  async confirmWarehouseReceipt(
    sessionId: string,
    context: RepositoryWriteContext = {},
  ): Promise<WarehouseReceiptSessionResult> {
    const session = warehouseReceiptSessions.find((candidate) => candidate.id === sessionId);
    if (!session) return { ok: false, message: "Warehouse receipt session was not found." };
    if (session.status === "confirmed") return { ok: true, session: cloneWarehouseReceiptSession(session) };
    if (session.status !== "in_progress") return { ok: false, message: "Only an in-progress warehouse receipt session can be confirmed." };

    const printGate = await this.checkWarehouseReceiptPrintGate(session.scopeSnapshot);
    if (!printGate.ok) return printGate;

    for (const line of session.lines) {
      if (line.actualQuantity === 0) continue;
      const received = receiveQuarantinedStock({
        sku: line.sku,
        quantity: line.actualQuantity,
        reference: session.id,
        location: RECEIVING_STAGING_LOCATION,
        createdBy: context.actorId,
      });
      if (!received.ok) return received;
    }

    session.status = "confirmed";
    session.confirmedBy = context.actorId;
    session.confirmedAt = new Date().toISOString();
    session.stagingLocation = RECEIVING_STAGING_LOCATION;
    return { ok: true, session: cloneWarehouseReceiptSession(session) };
  }

  async listPrearrivalShipments(): Promise<PrearrivalShipmentListResult> {
    return {
      ok: true,
      shipments: [
        {
          shipmentId: "shipment-test-1",
          shipmentReference: "BNE-TEST-001",
          status: "planned",
        },
      ],
    };
  }

  async getPrearrivalShipment(shipmentId: string): Promise<PrearrivalShipmentResult> {
    const revision = latestConfirmedPackingListRevision(shipmentId);
    if (!revision) return { ok: false, message: "Pre-arrival shipment was not found." };
    return {
      ok: true,
      shipment: {
        ...receiptFromPackingListRevision(revision),
        productBarcodes: productBarcodesFor(receiptFromPackingListRevision(revision)),
        revisions: packingListRevisions
          .filter((candidate) => candidate.shipmentId === shipmentId)
          .sort((left, right) => left.version - right.version)
          .map(clonePackingListRevision),
      },
    };
  }

  async createPackingListRevision(
    input: ValidatedPackingListRevision,
    context: RepositoryWriteContext = {},
  ): Promise<PackingListRevisionResult> {
    if (input.shipmentId !== "shipment-test-1") {
      return { ok: false, message: "Pre-arrival shipment was not found." };
    }
    const validation = validatePackingListRevision(input, {
      knownSkus: knownSkusFor(input),
    });
    if (!validation.ok) return validation;

    const version = Math.max(
      0,
      ...packingListRevisions
        .filter((candidate) => candidate.shipmentId === validation.revision.shipmentId)
        .map((candidate) => candidate.version),
    ) + 1;
    const revision: PackingListRevision = {
      id: `memory-packing-list-${validation.revision.shipmentId}-v${++packingListRevisionSequence}`,
      shipmentId: validation.revision.shipmentId,
      version,
      status: "draft",
      payloadSnapshot: structuredClone(validation.revision),
      totalExpectedQuantity: validation.totalExpectedQuantity,
      createdBy: context.actorId,
      createdAt: new Date().toISOString(),
    };
    packingListRevisions.push(revision);
    return { ok: true, revision: clonePackingListRevision(revision) };
  }

  async confirmPackingListRevision(
    revisionId: string,
    context: RepositoryWriteContext = {},
  ): Promise<PackingListRevisionResult> {
    const revision = packingListRevisions.find((candidate) => candidate.id === revisionId);
    if (!revision) return { ok: false, message: "Packing-list revision was not found." };
    if (revision.status !== "draft") {
      return { ok: false, message: "Only a draft packing-list revision can be confirmed." };
    }

    const timestamp = new Date().toISOString();
    for (const prior of packingListRevisions) {
      if (prior.shipmentId === revision.shipmentId && prior.status === "confirmed") {
        prior.status = "superseded";
      }
    }
    revision.status = "confirmed";
    revision.confirmedBy = context.actorId;
    revision.confirmedAt = timestamp;
    return { ok: true, revision: clonePackingListRevision(revision) };
  }

  async createWarehouseLabelPrintJob(
    input: CreateWarehouseLabelPrintJobInput,
    context: RepositoryWriteContext = {},
  ): Promise<WarehouseLabelPrintJobResult> {
    if (!validRequestedQuantity(input.requestedQuantity)) {
      return { ok: false, message: "Requested label quantity must be a positive integer." };
    }

    const job: WarehouseLabelPrintJob = {
      id: `memory-label-job-${++warehouseLabelJobSequence}`,
      templateId: input.templateId,
      payloadSnapshot: clonePayload(input.payloadSnapshot),
      requestedQuantity: input.requestedQuantity,
      status: "pending",
      createdBy: context.actorId,
      createdAt: new Date().toISOString(),
    };
    warehouseLabelPrintJobs.push(job);
    return { ok: true, job: cloneWarehouseLabelPrintJob(job) };
  }

  async appendWarehouseLabelPrintItems(
    jobId: string,
    payloadSnapshots: Record<string, unknown>[],
  ): Promise<WarehouseLabelPrintItemsResult> {
    const job = warehouseLabelPrintJobs.find((candidate) => candidate.id === jobId);
    if (!job) return { ok: false, message: "Warehouse label print job was not found." };
    if (!payloadSnapshots.length) return { ok: false, message: "At least one label item is required." };

    const existing = warehouseLabelPrintItems.filter((item) => item.jobId === jobId);
    if (existing.length + payloadSnapshots.length > job.requestedQuantity) {
      return { ok: false, message: "Label item count exceeds the requested quantity." };
    }

    const createdAt = new Date().toISOString();
    const items = payloadSnapshots.map((payloadSnapshot, index) => {
      const item: WarehouseLabelPrintItem = {
        id: `memory-label-item-${++warehouseLabelItemSequence}`,
        jobId,
        sequence: existing.length + index + 1,
        payloadSnapshot: clonePayload(payloadSnapshot),
        createdAt,
      };
      warehouseLabelPrintItems.push(item);
      return cloneWarehouseLabelPrintItem(item);
    });
    return { ok: true, items };
  }

  async getWarehouseLabelPrintJob(jobId: string): Promise<WarehouseLabelPrintAuditResult> {
    const job = warehouseLabelPrintJobs.find((candidate) => candidate.id === jobId);
    if (!job) return { ok: false, message: "Warehouse label print job was not found." };
    return {
      ok: true,
      job: cloneWarehouseLabelPrintJob(job),
      items: warehouseLabelPrintItems
        .filter((item) => item.jobId === jobId)
        .sort((left, right) => left.sequence - right.sequence)
        .map(cloneWarehouseLabelPrintItem),
    };
  }

  async recordWarehouseLabelPrintOutcome(
    jobId: string,
    outcome: Exclude<WarehouseLabelPrintJobStatus, "pending">,
  ): Promise<WarehouseLabelPrintJobResult> {
    const job = warehouseLabelPrintJobs.find((candidate) => candidate.id === jobId);
    if (!job) return { ok: false, message: "Warehouse label print job was not found." };
    if (job.status !== "pending") return { ok: false, message: "Warehouse label print job outcome was already recorded." };

    const timestamp = new Date().toISOString();
    job.status = outcome;
    if (outcome === "printed") job.printedAt = timestamp;
    if (outcome === "cancelled") job.cancelledAt = timestamp;
    return { ok: true, job: cloneWarehouseLabelPrintJob(job) };
  }

  async createWarehouseLabelReprint(
    input: CreateWarehouseLabelReprintInput,
    context: RepositoryWriteContext = {},
  ): Promise<WarehouseLabelPrintJobResult> {
    const original = warehouseLabelPrintJobs.find((candidate) => candidate.id === input.reprintOfJobId);
    if (!original) return { ok: false, message: "Original warehouse label print job was not found." };
    const reason = input.reason?.trim();
    if (!reason) return { ok: false, message: "A reprint reason is required." };
    if (!validRequestedQuantity(input.requestedQuantity)) {
      return { ok: false, message: "Requested label quantity must be a positive integer." };
    }

    const job: WarehouseLabelPrintJob = {
      id: `memory-label-job-${++warehouseLabelJobSequence}`,
      templateId: original.templateId,
      payloadSnapshot: clonePayload(original.payloadSnapshot),
      requestedQuantity: input.requestedQuantity,
      status: "pending",
      createdBy: context.actorId,
      createdAt: new Date().toISOString(),
      reprintOfJobId: original.id,
      reprintReason: reason,
    };
    warehouseLabelPrintJobs.push(job);
    return { ok: true, job: cloneWarehouseLabelPrintJob(job) };
  }

  async submitOrder(
    input: CreateOrderInput,
    context: RepositoryWriteContext = {},
  ) {
    return submitOrder(input, {
      createdBy: context.actorId,
      priceResolver: priceForSku,
    });
  }

  async dispatchOrder(
    orderId: string,
    input: DispatchOrderInput,
    context: RepositoryWriteContext = {},
  ) {
    const state = getInventoryState();
    const order = state.orders.find((candidate) => candidate.id === orderId);
    if (!order) return { ok: false as const, message: "Order was not found." };

    const scans: DispatchScanInput[] = [];
    for (const scan of input.scans ?? []) {
      const sku = resolveSkuIdentifier(scan.sku);
      if (!sku)
        return {
          ok: false as const,
          message: `Scanned SKU ${scan.sku} was not found.`,
        };
      scans.push({ sku, quantity: scan.quantity });
    }

    const validation = validateDispatchScans(order.lines, scans);
    if (!validation.ok) return validation;

    return dispatchOrder(orderId, { createdBy: context.actorId });
  }

  async cancelOrder(orderId: string, input = {}) {
    return cancelOrder(orderId, input);
  }

  async submitTradeAccountApplication(input: TradeAccountApplicationInput) {
    return submitTradeAccountApplication(input);
  }

  async approveTradeAccountApplication(applicationId: string) {
    return approveTradeAccountApplication(applicationId);
  }

  async provisionTradeAccountLogin(applicationId: string) {
    return provisionTradeAccountLogin(applicationId);
  }

  async updateTradeAccountStatus(
    applicationId: string,
    status: TradeAccountStatus,
  ) {
    return updateTradeAccountStatus(applicationId, status);
  }

  async createProductMaster(input: CreateProductMasterInput) {
    const result = createProductMasterData(input);
    if (!result.ok) return result;

    ensureInventoryRow(result.product.sku);
    const state = await this.getAdminState();
    const product = state.catalogue.find(
      (row) => row.sku === result.product.sku,
    );
    return product
      ? { ok: true as const, product }
      : { ok: false as const, message: "SKU was not found." };
  }

  async updateProductMaster(input: UpdateProductMasterInput) {
    const result = updateProductMasterData(input);
    if (!result.ok) return result;

    const state = await this.getAdminState();
    const product = state.catalogue.find((row) => row.sku === input.sku);
    return product
      ? { ok: true as const, product }
      : { ok: false as const, message: "SKU was not found." };
  }

  async createFitmentRule(input: CreateFitmentRuleInput) {
    const result = createFitmentRuleData(input);
    if (!result.ok) return result;

    const rule = {
      sku: result.rule.sku,
      vehicle: `${result.rule.make} ${result.rule.model} ${result.rule.yearFrom}${result.rule.yearTo ? `-${result.rule.yearTo}` : "-on"}`,
      engine: result.rule.engine,
      confidence: result.rule.confidence,
    };
    return { ok: true as const, rule };
  }

  async resetForTests(): Promise<void> {
    resetProductMasterData();
    resetStoreForTests();
    warehouseLabelJobSequence = 0;
    warehouseLabelItemSequence = 0;
    warehouseLabelPrintJobs = [];
    warehouseLabelPrintItems = [];
    warehouseReceiptSessionSequence = 0;
    warehouseReceiptSessions = [];
    packingListRevisionSequence = 1;
    packingListRevisions = [initialPackingListRevision()];
  }
}
