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
import { parseInventoryLocationCode } from "./inventoryLocations";
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
  putAwayQuarantinedStock,
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
  CreateWarehouseLabelPrintJobWithItemsInput,
  CreateWarehouseLabelReprintInput,
  WarehouseLabelPrintAuditResult,
  WarehouseLabelPrintItem,
  WarehouseLabelPrintItemsResult,
  WarehouseLabelPrintJob,
  WarehouseLabelPrintJobResult,
  WarehouseLabelPrintJobWithItemsResult,
  WarehouseLabelPrintJobStatus,
  WarehouseExpectedReceiptResult,
  WarehouseReceiptPrintGateResult,
  WarehouseReceiptSession,
  WarehouseReceiptSessionResult,
  CreateWarehouseReceiptSessionInput,
  WarehousePutawayInput,
  WarehousePutawayResult,
  WarehousePutawayScopeInput,
  WarehousePutawayScopeResult,
  WarehousePutawayLine,
  WarehouseHistoryQuery,
  WarehouseHistoryResult,
  PackingListRevision,
  PackingListRevisionResult,
  PrearrivalShipmentListResult,
  PrearrivalShipmentResult,
  InventoryLocation,
  InventoryLocationAudit,
  InventoryLocationListQuery,
  CreateInventoryLocationBatchInput,
  CreateInventoryLocationBatchResult,
  UpdateInventoryLocationNotesInput,
  UpdateInventoryLocationNotesResult,
  SetInventoryLocationStatusInput,
  SetInventoryLocationStatusResult,
} from "./repository";
import { filterWarehouseExpectedReceipt, type WarehouseExpectedReceipt, type WarehouseInboundSelection, type WarehouseLabelPrintScope } from "./warehouseLabels";
import { RECEIVING_STAGING_LOCATION, type WarehouseReceiptScope } from "./warehouseReceiving";
import { type WarehouseHistoryEvent } from "./warehouseHistory";
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
let warehousePutawaySequence = 0;
let warehousePutaways: Array<{
  id: string;
  receiptSessionId: string;
  shipmentId: string;
  cartonNumbers: string[];
  sku: string;
  productBarcode: string;
  quantity: number;
  destinationLocation: string;
  createdAt: string;
  createdBy?: string;
  idempotencyKey: string;
}> = [];

type MemoryInventoryLocation = Omit<InventoryLocation, "currentBalance">;

let inventoryLocationSequence = 0;
let inventoryLocationAuditSequence = 0;
let inventoryLocations: MemoryInventoryLocation[] = [];
let inventoryLocationAudits: InventoryLocationAudit[] = [];

function inventoryLocationAuditValue(location: MemoryInventoryLocation): Record<string, unknown> {
  return {
    id: location.id,
    locationCode: location.locationCode,
    barcode: location.barcode,
    status: location.status,
    isPutawayDestination: location.isPutawayDestination,
    physicalDescription: location.physicalDescription ?? null,
    notes: location.notes ?? null,
  };
}

function currentInventoryLocationBalance(locationCode: string): number {
  if (locationCode === RECEIVING_STAGING_LOCATION) {
    return warehouseReceiptSessions
      .filter((session) => session.status === "confirmed")
      .reduce((total, session) => {
        const receivedQuantity = session.lines.reduce(
          (lineTotal, line) => lineTotal + line.actualQuantity,
          0,
        );
        const putAwayQuantity = warehousePutaways
          .filter((putaway) => putaway.receiptSessionId === session.id)
          .reduce((putawayTotal, putaway) => putawayTotal + putaway.quantity, 0);
        return total + Math.max(receivedQuantity - putAwayQuantity, 0);
      }, 0);
  }

  return warehousePutaways
    .filter((putaway) => putaway.destinationLocation.trim().toUpperCase() === locationCode)
    .reduce((total, putaway) => total + putaway.quantity, 0);
}

function cloneInventoryLocation(location: MemoryInventoryLocation): InventoryLocation {
  return {
    ...location,
    currentBalance: currentInventoryLocationBalance(location.locationCode),
  };
}

function resetInventoryLocationMaster() {
  const now = new Date().toISOString();
  const stagingLocation: MemoryInventoryLocation = {
    id: "memory-inventory-location-1",
    locationCode: RECEIVING_STAGING_LOCATION,
    barcode: `DMLOC:${RECEIVING_STAGING_LOCATION}`,
    status: "active",
    isPutawayDestination: false,
    physicalDescription: "System receiving staging source",
    notes: "Registered system source for confirmed warehouse receipts.",
    createdAt: now,
    createdBy: "system",
    updatedAt: now,
    updatedBy: "system",
  };
  inventoryLocationSequence = 1;
  inventoryLocationAuditSequence = 1;
  inventoryLocations = [stagingLocation];
  inventoryLocationAudits = [{
    id: "memory-inventory-location-audit-1",
    locationId: stagingLocation.id,
    action: "created",
    actorId: "system",
    beforeValue: null,
    afterValue: inventoryLocationAuditValue(stagingLocation),
    createdAt: now,
  }];
}

resetInventoryLocationMaster();

function clonePayload(payload: Record<string, unknown>) {
  return structuredClone(payload);
}

function isPayloadSnapshot(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function samePayloadSnapshot(
  left: Record<string, unknown>,
  right: Record<string, unknown> | undefined,
) {
  return !!right && JSON.stringify(left) === JSON.stringify(right);
}

function itemsForWarehouseLabelPrintJob(jobId: string) {
  return warehouseLabelPrintItems
    .filter((item) => item.jobId === jobId)
    .sort((left, right) => left.sequence - right.sequence);
}

function cloneWarehouseLabelPrintJob(job: WarehouseLabelPrintJob): WarehouseLabelPrintJob {
  return { ...job, payloadSnapshot: clonePayload(job.payloadSnapshot) };
}

function cloneWarehouseReceiptSession(session: WarehouseReceiptSession): WarehouseReceiptSession {
  return structuredClone(session);
}

function normalizedValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean))].sort();
}

function sameReceiptScope(
  session: WarehouseReceiptSession,
  input: WarehousePutawayScopeInput,
) {
  if (session.shipmentId !== input.shipmentId) return false;
  const left = normalizedValues(session.scopeSnapshot.cartonNumbers);
  const right = normalizedValues(input.cartonNumbers);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function remainingReceiptQuantity(
  session: WarehouseReceiptSession,
  productBarcode: string,
) {
  const barcode = productBarcode.trim().toUpperCase();
  const line = session.lines.find(
    (candidate) => candidate.productBarcode.trim().toUpperCase() === barcode,
  );
  if (!line) return undefined;
  const moved = warehousePutaways
    .filter(
      (putaway) =>
        putaway.receiptSessionId === session.id
        && putaway.productBarcode.trim().toUpperCase() === barcode,
    )
    .reduce((total, putaway) => total + putaway.quantity, 0);
  return Math.max(line.actualQuantity - moved, 0);
}

function putawayLinesForScope(input: WarehousePutawayScopeInput): WarehousePutawayLine[] {
  return warehouseReceiptSessions
    .filter((session) => session.status === "confirmed" && sameReceiptScope(session, input))
    .flatMap((session) => session.lines.map((line) => ({
      receiptSessionId: session.id,
      sku: line.sku,
      productBarcode: line.productBarcode,
      actualQuantity: line.actualQuantity,
      remainingQuantity: remainingReceiptQuantity(session, line.productBarcode) ?? 0,
    })))
    .filter((line) => line.remainingQuantity > 0);
}

function labelAuditScope(payload: Record<string, unknown>) {
  const snapshot = payload as Partial<WarehouseLabelPrintScope>;
  if (!snapshot.shipmentId || !Array.isArray(snapshot.cartonNumbers)) return undefined;
  return {
    shipmentId: snapshot.shipmentId,
    palletNumbers: Array.isArray(snapshot.palletNumbers) ? snapshot.palletNumbers : [],
    cartonNumbers: snapshot.cartonNumbers,
    sku: snapshot.lines?.[0]?.sku,
  };
}

function matchesWarehouseHistoryQuery(
  event: WarehouseHistoryEvent,
  query: WarehouseHistoryQuery = {},
) {
  const eventDate = event.createdAt.slice(0, 10);
  if (query.from && eventDate < query.from) return false;
  if (query.to && eventDate > query.to) return false;
  if (query.shipmentId && event.shipmentId !== query.shipmentId) return false;
  if (query.palletNumber && !event.palletNumbers?.includes(query.palletNumber)) return false;
  if (query.cartonNumber && !event.cartonNumbers?.includes(query.cartonNumber)) return false;
  if (query.sku && event.sku !== query.sku) return false;
  if (query.actor && event.actor !== query.actor) return false;
  if (query.action && event.action !== query.action) return false;
  return true;
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

  async listInventoryLocations(
    query: InventoryLocationListQuery = {},
  ): Promise<InventoryLocation[]> {
    const search = query.search?.trim().toUpperCase();
    const barcode = query.barcode?.trim().toUpperCase();
    return inventoryLocations
      .filter((location) => {
        if (query.status && location.status !== query.status) return false;
        if (barcode && location.barcode !== barcode) return false;
        if (!search) return true;
        return [
          location.locationCode,
          location.barcode,
          location.physicalDescription,
          location.notes,
        ].some((value) => value?.toUpperCase().includes(search));
      })
      .map(cloneInventoryLocation)
      .sort((left, right) => left.locationCode.localeCompare(right.locationCode));
  }

  async createInventoryLocationBatch(
    input: CreateInventoryLocationBatchInput,
    context: RepositoryWriteContext = {},
  ): Promise<CreateInventoryLocationBatchResult> {
    if (!input.locations.length) {
      return { ok: false, message: "At least one inventory location is required." };
    }

    const parsedLocations = [] as Array<{
      locationCode: string;
      barcode: string;
      physicalDescription?: string | null;
      notes?: string | null;
    }>;
    const seen = new Set<string>();
    for (const candidate of input.locations) {
      const parsed = parseInventoryLocationCode(candidate.locationCode);
      if (!parsed.ok) return { ok: false, message: parsed.message };
      if (parsed.locationCode === RECEIVING_STAGING_LOCATION) {
        return { ok: false, message: "BNE-RECEIVING-STAGING is registered as a system source." };
      }
      if (seen.has(parsed.locationCode) || inventoryLocations.some((location) => location.locationCode === parsed.locationCode)) {
        return { ok: false, message: `Inventory location ${parsed.locationCode} already exists.` };
      }
      seen.add(parsed.locationCode);
      parsedLocations.push({
        locationCode: parsed.locationCode,
        barcode: parsed.barcode,
        physicalDescription: candidate.physicalDescription?.trim() || null,
        notes: candidate.notes?.trim() || null,
      });
    }

    const now = new Date().toISOString();
    const actorId = context.actorId ?? "system";
    const locations = parsedLocations.map((candidate) => {
      const location: MemoryInventoryLocation = {
        id: `memory-inventory-location-${++inventoryLocationSequence}`,
        locationCode: candidate.locationCode,
        barcode: candidate.barcode,
        status: "active",
        isPutawayDestination: true,
        physicalDescription: candidate.physicalDescription,
        notes: candidate.notes,
        createdAt: now,
        createdBy: actorId,
        updatedAt: now,
        updatedBy: actorId,
      };
      inventoryLocations.push(location);
      inventoryLocationAudits.push({
        id: `memory-inventory-location-audit-${++inventoryLocationAuditSequence}`,
        locationId: location.id,
        action: "created",
        actorId,
        beforeValue: null,
        afterValue: inventoryLocationAuditValue(location),
        createdAt: now,
      });
      return cloneInventoryLocation(location);
    });

    return { ok: true, locations };
  }

  async updateInventoryLocationNotes(
    input: UpdateInventoryLocationNotesInput,
    context: RepositoryWriteContext = {},
  ): Promise<UpdateInventoryLocationNotesResult> {
    const location = inventoryLocations.find((candidate) => candidate.id === input.id);
    if (!location) return { ok: false, message: "Inventory location was not found." };
    if (!("physicalDescription" in input) && !("notes" in input)) {
      return { ok: false, message: "Physical description or notes are required." };
    }

    const beforeValue = inventoryLocationAuditValue(location);
    const physicalDescription = "physicalDescription" in input
      ? input.physicalDescription?.trim() || null
      : location.physicalDescription;
    const notes = "notes" in input ? input.notes?.trim() || null : location.notes;
    if (physicalDescription === location.physicalDescription && notes === location.notes) {
      return { ok: true, location: cloneInventoryLocation(location) };
    }

    const now = new Date().toISOString();
    const actorId = context.actorId ?? "system";
    location.physicalDescription = physicalDescription;
    location.notes = notes;
    location.updatedAt = now;
    location.updatedBy = actorId;
    inventoryLocationAudits.push({
      id: `memory-inventory-location-audit-${++inventoryLocationAuditSequence}`,
      locationId: location.id,
      action: "updated",
      actorId,
      beforeValue,
      afterValue: inventoryLocationAuditValue(location),
      createdAt: now,
    });
    return { ok: true, location: cloneInventoryLocation(location) };
  }

  async setInventoryLocationStatus(
    input: SetInventoryLocationStatusInput,
    context: RepositoryWriteContext = {},
  ): Promise<SetInventoryLocationStatusResult> {
    const location = inventoryLocations.find((candidate) => candidate.id === input.id);
    if (!location) return { ok: false, message: "Inventory location was not found." };
    if (location.locationCode === RECEIVING_STAGING_LOCATION && input.status !== "active") {
      return { ok: false, message: "BNE-RECEIVING-STAGING must remain active." };
    }
    if (input.status !== "active" && currentInventoryLocationBalance(location.locationCode) > 0) {
      return {
        ok: false,
        message: "Locations with on-hand, reserved, or quarantine balance cannot be disabled or archived.",
      };
    }
    if (location.status === input.status) return { ok: true, location: cloneInventoryLocation(location) };

    const now = new Date().toISOString();
    const actorId = context.actorId ?? "system";
    const beforeValue = inventoryLocationAuditValue(location);
    location.status = input.status;
    location.updatedAt = now;
    location.updatedBy = actorId;
    inventoryLocationAudits.push({
      id: `memory-inventory-location-audit-${++inventoryLocationAuditSequence}`,
      locationId: location.id,
      action: "status_changed",
      actorId,
      beforeValue,
      afterValue: inventoryLocationAuditValue(location),
      createdAt: now,
    });
    return { ok: true, location: cloneInventoryLocation(location) };
  }

  async resolveActivePhysicalDestination(barcode: string): Promise<InventoryLocation | null> {
    const normalizedBarcode = barcode.trim().toUpperCase();
    const location = inventoryLocations.find((candidate) =>
      candidate.barcode === normalizedBarcode
      && candidate.status === "active"
      && candidate.isPutawayDestination,
    );
    return location ? cloneInventoryLocation(location) : null;
  }

  async listInventoryLocationAudit(locationId: string): Promise<InventoryLocationAudit[]> {
    return inventoryLocationAudits
      .filter((event) => event.locationId === locationId)
      .map((event) => structuredClone(event));
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

  async getWarehousePutawayScope(
    input: WarehousePutawayScopeInput,
  ): Promise<WarehousePutawayScopeResult> {
    return { ok: true, lines: putawayLinesForScope(input) };
  }

  async putAwayWarehouseReceipt(
    input: WarehousePutawayInput,
    context: RepositoryWriteContext = {},
  ): Promise<WarehousePutawayResult> {
    const idempotencyKey = input.idempotencyKey.trim();
    const existing = warehousePutaways.find(
      (candidate) => candidate.idempotencyKey === idempotencyKey,
    );
    if (existing) {
      const session = warehouseReceiptSessions.find((candidate) => candidate.id === existing.receiptSessionId);
      const movement = (await this.getAdminState()).stockMovements.find(
        (candidate) => candidate.reference === existing.receiptSessionId
          && candidate.sku === existing.sku
          && candidate.createdAt === existing.createdAt,
      );
      if (!session || !movement) return { ok: false, message: "Putaway audit record was not found." };
      return {
        ok: true,
        receiptSessionId: session.id,
        sourceLocation: RECEIVING_STAGING_LOCATION,
        destinationLocation: existing.destinationLocation,
        remainingQuantity: remainingReceiptQuantity(session, existing.productBarcode) ?? 0,
        movement,
      };
    }

    const session = warehouseReceiptSessions.find(
      (candidate) => candidate.status === "confirmed" && sameReceiptScope(candidate, input),
    );
    if (!session) {
      return { ok: false, message: "A confirmed receipt with staged stock is required before putaway." };
    }

    const barcode = input.productBarcode.trim().toUpperCase();
    const line = session.lines.find(
      (candidate) => candidate.productBarcode.trim().toUpperCase() === barcode,
    );
    const remainingQuantity = remainingReceiptQuantity(session, barcode);
    if (!line || remainingQuantity === undefined || remainingQuantity <= 0) {
      return { ok: false, message: "This product has no remaining staged quantity in the selected receipt." };
    }
    if (input.quantity > remainingQuantity) {
      return { ok: false, message: "Putaway quantity exceeds the receipt's remaining staged quantity." };
    }

    const recorded = putAwayQuarantinedStock({
      sku: line.sku,
      quantity: input.quantity,
      reference: session.id,
      destinationLocation: input.destinationLocation,
      createdBy: context.actorId,
    });
    if (!recorded.ok) return recorded;

    const audit = {
      id: `memory-putaway-${++warehousePutawaySequence}`,
      receiptSessionId: session.id,
      shipmentId: session.shipmentId,
      cartonNumbers: [...session.scopeSnapshot.cartonNumbers],
      sku: line.sku,
      productBarcode: barcode,
      quantity: input.quantity,
      destinationLocation: input.destinationLocation,
      createdAt: recorded.movement.createdAt,
      createdBy: context.actorId,
      idempotencyKey,
    };
    warehousePutaways.push(audit);

    return {
      ok: true,
      receiptSessionId: session.id,
      sourceLocation: RECEIVING_STAGING_LOCATION,
      destinationLocation: input.destinationLocation,
      remainingQuantity: remainingQuantity - input.quantity,
      movement: recorded.movement,
    };
  }

  async listWarehouseHistory(
    query: WarehouseHistoryQuery = {},
  ): Promise<WarehouseHistoryResult> {
    const events: WarehouseHistoryEvent[] = [];

    for (const job of warehouseLabelPrintJobs) {
      const scope = labelAuditScope(job.payloadSnapshot);
      if (!scope) continue;
      if (job.reprintOfJobId && job.reprintReason) {
        events.push({
          id: `reprint-${job.id}`,
          createdAt: job.createdAt,
          action: "reprint",
          actor: job.createdBy,
          reference: job.id,
          shipmentId: scope.shipmentId,
          palletNumbers: scope.palletNumbers,
          cartonNumbers: scope.cartonNumbers,
          sku: scope.sku,
          outcome: job.reprintReason,
        });
      }
      if (job.status === "printed" && job.printedAt) {
        events.push({
          id: `print-${job.id}`,
          createdAt: job.printedAt,
          action: "print_confirmed",
          actor: job.createdBy,
          reference: job.id,
          shipmentId: scope.shipmentId,
          palletNumbers: scope.palletNumbers,
          cartonNumbers: scope.cartonNumbers,
          sku: scope.sku,
          outcome: "Printed confirmation recorded",
        });
      }
      if (job.status === "cancelled" && job.cancelledAt) {
        events.push({
          id: `cancel-${job.id}`,
          createdAt: job.cancelledAt,
          action: "print_cancelled",
          actor: job.createdBy,
          reference: job.id,
          shipmentId: scope.shipmentId,
          palletNumbers: scope.palletNumbers,
          cartonNumbers: scope.cartonNumbers,
          sku: scope.sku,
          outcome: "Print cancelled",
        });
      }
    }

    for (const session of warehouseReceiptSessions) {
      if (session.status !== "confirmed" || !session.confirmedAt) continue;
      events.push({
        id: `receipt-${session.id}`,
        createdAt: session.confirmedAt,
        action: "receipt_confirmed",
        actor: session.confirmedBy,
        reference: session.id,
        shipmentId: session.shipmentId,
        cartonNumbers: [...session.scopeSnapshot.cartonNumbers],
        sku: session.lines.length === 1 ? session.lines[0].sku : undefined,
        quantity: session.lines.reduce((total, line) => total + line.actualQuantity, 0),
        outcome: `${session.lines.reduce((total, line) => total + line.actualQuantity, 0)} units staged`,
      });
      for (const line of session.lines) {
        if (!line.discrepancy) continue;
        events.push({
          id: `difference-${session.id}-${line.productBarcode}`,
          createdAt: session.confirmedAt,
          action: "discrepancy_recorded",
          actor: session.confirmedBy,
          reference: session.id,
          shipmentId: session.shipmentId,
          cartonNumbers: [...session.scopeSnapshot.cartonNumbers],
          sku: line.sku,
          quantity: Math.abs(line.actualQuantity - line.expectedQuantity),
          outcome: `${line.discrepancy.type}: ${line.discrepancy.reason}`,
        });
      }
    }

    for (const putaway of warehousePutaways) {
      events.push({
        id: putaway.id,
        createdAt: putaway.createdAt,
        action: "putaway_confirmed",
        actor: putaway.createdBy,
        reference: putaway.destinationLocation,
        shipmentId: putaway.shipmentId,
        cartonNumbers: putaway.cartonNumbers,
        sku: putaway.sku,
        quantity: putaway.quantity,
        outcome: `Moved ${putaway.quantity} units from ${RECEIVING_STAGING_LOCATION}`,
      });
    }

    return { ok: true, events: events.filter((event) => matchesWarehouseHistoryQuery(event, query)) };
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

  async createWarehouseLabelPrintJobWithItems(
    input: CreateWarehouseLabelPrintJobWithItemsInput,
    context: RepositoryWriteContext = {},
  ): Promise<WarehouseLabelPrintJobWithItemsResult> {
    if (!validRequestedQuantity(input.requestedQuantity)) {
      return { ok: false, message: "Requested label quantity must be a positive integer." };
    }
    if (!isPayloadSnapshot(input.payloadSnapshot)) {
      return { ok: false, message: "Warehouse label payload snapshot must be an object." };
    }
    if (input.itemPayloadSnapshots.length !== input.requestedQuantity) {
      return { ok: false, message: "Label item count must equal the requested quantity." };
    }
    if (!input.itemPayloadSnapshots.every(isPayloadSnapshot)) {
      return { ok: false, message: "Label item snapshots must be objects." };
    }

    const reprintOfJobId = input.reprintOfJobId?.trim();
    const reprintReason = input.reprintReason?.trim();
    if (Boolean(reprintOfJobId) !== Boolean(reprintReason)) {
      return { ok: false, message: "A reprint source and reason are required together." };
    }
    if (!reprintOfJobId && input.reprintSourceItemIds) {
      return { ok: false, message: "Reprint source item selection requires a reprint source." };
    }
    let selectedSourceItems: WarehouseLabelPrintItem[] | undefined;
    if (reprintOfJobId && reprintReason) {
      const original = warehouseLabelPrintJobs.find((candidate) => candidate.id === reprintOfJobId);
      if (!original) return { ok: false, message: "Original warehouse label print job was not found." };
      const originalItems = itemsForWarehouseLabelPrintJob(original.id);
      if (originalItems.length !== original.requestedQuantity) {
        return { ok: false, message: "Original warehouse label print job is incomplete and cannot be reprinted." };
      }
      const sourceItemIds = input.reprintSourceItemIds?.map((itemId) => itemId.trim());
      if (
        !sourceItemIds
        || sourceItemIds.length !== input.requestedQuantity
        || new Set(sourceItemIds).size !== sourceItemIds.length
      ) {
        return { ok: false, message: "Reprint source item selection must match the requested quantity." };
      }
      const selectedItems = sourceItemIds.map((itemId) =>
        originalItems.find((item) => item.id === itemId),
      );
      if (selectedItems.some((item) => !item)) {
        return { ok: false, message: "Every reprint source item must belong to the original warehouse label job." };
      }
      selectedSourceItems = selectedItems as WarehouseLabelPrintItem[];
      if (
        original.templateId !== input.templateId
        || !samePayloadSnapshot(original.payloadSnapshot, input.payloadSnapshot)
        || !input.itemPayloadSnapshots.every(
          (payload, index) => samePayloadSnapshot(payload, selectedSourceItems?.[index]?.payloadSnapshot),
        )
      ) {
        return { ok: false, message: "A reprint must reuse the original audited label payload." };
      }
    }

    const payloadSnapshot = clonePayload(input.payloadSnapshot);
    const itemPayloadSnapshots = input.itemPayloadSnapshots.map(clonePayload);
    const createdAt = new Date().toISOString();
    const job: WarehouseLabelPrintJob = {
      id: `memory-label-job-${++warehouseLabelJobSequence}`,
      templateId: input.templateId,
      payloadSnapshot,
      requestedQuantity: input.requestedQuantity,
      status: "pending",
      createdBy: context.actorId,
      createdAt,
      ...(reprintOfJobId && reprintReason
        ? { reprintOfJobId, reprintReason }
        : {}),
    };
    const items = itemPayloadSnapshots.map((payloadSnapshot, index): WarehouseLabelPrintItem => ({
      id: `memory-label-item-${++warehouseLabelItemSequence}`,
      jobId: job.id,
      ...(selectedSourceItems?.[index] ? { sourceItemId: selectedSourceItems[index].id } : {}),
      sequence: index + 1,
      payloadSnapshot,
      createdAt,
    }));

    warehouseLabelPrintJobs.push(job);
    warehouseLabelPrintItems.push(...items);
    return {
      ok: true,
      job: cloneWarehouseLabelPrintJob(job),
      items: items.map(cloneWarehouseLabelPrintItem),
    };
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
    if (itemsForWarehouseLabelPrintJob(job.id).length !== job.requestedQuantity) {
      return { ok: false, message: "Warehouse label print job is incomplete and cannot record an outcome." };
    }

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
    if (itemsForWarehouseLabelPrintJob(original.id).length !== original.requestedQuantity) {
      return { ok: false, message: "Original warehouse label print job is incomplete and cannot be reprinted." };
    }
    const reason = input.reason?.trim();
    if (!reason) return { ok: false, message: "A reprint reason is required." };
    if (!validRequestedQuantity(input.requestedQuantity)) {
      return { ok: false, message: "Requested label quantity must be a positive integer." };
    }

    return {
      ok: false,
      message: "Atomic reprints require the original item snapshots.",
    };
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
    warehousePutawaySequence = 0;
    warehousePutaways = [];
    resetInventoryLocationMaster();
    packingListRevisionSequence = 1;
    packingListRevisions = [initialPackingListRevision()];
  }
}
