import {
  findProductBySku,
  initialInventory,
  resolveSkuIdentifier,
} from "./catalogue";
import {
  availableStock,
  dispatchStock,
  quarantineStock,
  receiveStock,
  type InventoryRow,
} from "./inventory";
import {
  createDraftOrder,
  type CreateOrderInput,
  type SalesOrder,
} from "./orders";
import type { PriceResolver } from "./pricing";
import type {
  AccountDocument,
  AdminLookupRequest,
  AdminPurchaseBatch,
} from "./repository";
import type {
  TradeAccountApplicationInput,
  TradeAccountApplication,
  TradeAccountStatus,
} from "./tradeAccounts";

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

type StoreState = {
  inventory: InventoryRow[];
  stockMovements: StockMovement[];
  orders: SalesOrder[];
  accountDocuments: AccountDocument[];
  accountApplications: TradeAccountApplication[];
  purchaseBatches: AdminPurchaseBatch[];
  lookupRequests: AdminLookupRequest[];
};

function createInitialStore(): StoreState {
  return {
    inventory: initialInventory.map((row) => ({ ...row })),
    stockMovements: [],
    orders: [],
    accountDocuments: [],
    accountApplications: [],
    purchaseBatches: [],
    lookupRequests: [],
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __drivemateStore: StoreState | undefined;
}

const state: StoreState = globalThis.__drivemateStore ?? createInitialStore();
globalThis.__drivemateStore = state;

function createAccountDocument(input: {
  tradeAccountId: string;
  type: AccountDocument["type"];
  reference: string;
  storagePath: string;
}): AccountDocument {
  return {
    id: `DOC-${Date.now()}-${input.type}`,
    tradeAccountId: input.tradeAccountId,
    type: input.type,
    reference: input.reference,
    storagePath: input.storagePath,
    createdAt: new Date().toISOString(),
  };
}

function statementMonth(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

function ensureMonthlyStatementDocument(
  tradeAccountId: string,
): AccountDocument {
  const month = statementMonth();
  const reference = `STMT-${month}-${tradeAccountId}`;
  const existing = state.accountDocuments.find(
    (document) =>
      document.tradeAccountId === tradeAccountId &&
      document.type === "statement" &&
      document.reference === reference,
  );

  if (existing) return existing;

  const statement = createAccountDocument({
    tradeAccountId,
    type: "statement",
    reference,
    storagePath: `generated/statements/${month}/${tradeAccountId}.txt`,
  });
  state.accountDocuments.unshift(statement);
  return statement;
}

export function getInventoryState(): StoreState {
  return {
    inventory: state.inventory.map((row) => ({
      ...row,
      quarantine: row.quarantine ?? 0,
    })),
    stockMovements: state.stockMovements.map((movement) => ({ ...movement })),
    orders: state.orders.map((order) => ({
      ...order,
      lines: order.lines.map((line) => ({ ...line })),
    })),
    accountDocuments: state.accountDocuments.map((document) => ({
      ...document,
    })),
    accountApplications: state.accountApplications.map((application) => ({
      ...application,
    })),
    purchaseBatches: state.purchaseBatches.map((batch) => ({ ...batch })),
    lookupRequests: state.lookupRequests.map((request) => ({ ...request })),
  };
}

export function recordLookupRequest(
  input: Omit<AdminLookupRequest, "id" | "createdAt">,
) {
  const request: AdminLookupRequest = {
    id: `LOOKUP-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...input,
  };

  state.lookupRequests.unshift(request);
  return request;
}

export function ensureInventoryRow(sku: string) {
  if (state.inventory.some((row) => row.sku === sku)) return;
  state.inventory.push({ sku, onHand: 0, reserved: 0, quarantine: 0 });
}

function isTradeAccountApprovedForOrdering(tradeAccountId: string) {
  if (tradeAccountId === "acct-demo") return true;
  const application = state.accountApplications.find(
    (candidate) => candidate.id === tradeAccountId,
  );
  return application?.status === "approved";
}

export function applyInventoryMovement(input: {
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
  createdBy?: string;
}) {
  const sku = resolveSkuIdentifier(input.sku);
  if (!sku) return { ok: false as const, message: "SKU or barcode not found." };

  const movementLabels = {
    inbound: "Inbound",
    putaway: "Putaway",
    dispatch: "Dispatch",
    return: "Return",
    quarantine: "Quarantine",
    adjustment: "Adjustment",
  } as const;
  const result = (() => {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      return { ok: false as const, message: "Quantity must be positive." };
    }

    if (input.type === "putaway") {
      const row = state.inventory.find((item) => item.sku === sku);
      if (!row) return { ok: false as const, message: "SKU not found." };
      if (availableStock(row) < input.quantity) {
        return { ok: false as const, message: "Not enough available stock." };
      }
      return { ok: true as const };
    }

    if (input.type === "adjustment") {
      const row = state.inventory.find((item) => item.sku === sku);
      if (!row) return { ok: false as const, message: "SKU not found." };
      if (input.quarantineAction) {
        const currentQuarantine = row.quarantine ?? 0;
        if (currentQuarantine < input.quantity) {
          return {
            ok: false as const,
            message: "Not enough quarantined stock.",
          };
        }
        if (input.quarantineAction === "writeoff") {
          if (row.onHand < input.quantity) {
            return {
              ok: false as const,
              message: "Not enough on-hand stock to write off.",
            };
          }
          row.onHand -= input.quantity;
        }
        row.quarantine = currentQuarantine - input.quantity;
        return { ok: true as const };
      }
      if (input.adjustmentDirection === "decrease") {
        if (availableStock(row) < input.quantity) {
          return { ok: false as const, message: "Not enough available stock." };
        }
        row.onHand -= input.quantity;
        return { ok: true as const };
      }

      row.onHand += input.quantity;
      return { ok: true as const };
    }

    return input.type === "inbound" || input.type === "return"
      ? receiveStock(state.inventory, { sku, quantity: input.quantity })
      : input.type === "quarantine"
        ? quarantineStock(state.inventory, { sku, quantity: input.quantity })
        : dispatchStock(state.inventory, { sku, quantity: input.quantity });
  })();

  if (!result.ok) return result;

  const location =
    input.type === "putaway"
      ? (input.toLocation ?? input.location ?? "BNE putaway")
      : input.type === "adjustment"
        ? (input.location ??
          (input.quarantineAction ? "BNE quarantine" : "BNE adjustment"))
        : (input.location ??
          (input.type === "inbound"
            ? "BNE receiving"
            : input.type === "return"
              ? "BNE returns"
              : input.type === "quarantine"
                ? "BNE quarantine"
                : "BNE dispatch"));

  const movement: StockMovement = {
    id: `SM-${Date.now()}`,
    sku,
    movement:
      input.type === "adjustment" && input.quarantineAction === "release"
        ? "Quarantine Release"
        : input.type === "adjustment" && input.quarantineAction === "writeoff"
          ? "Quarantine Write-off"
          : movementLabels[input.type],
    quantity: input.quantity,
    location,
    reference: input.reference,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };

  if (input.type === "inbound") {
    const existingBatch = state.purchaseBatches.find(
      (batch) => batch.batchNo === input.reference && batch.sku === sku,
    );
    if (existingBatch) {
      existingBatch.receivedQuantity =
        (existingBatch.receivedQuantity ?? 0) + input.quantity;
      existingBatch.receivedDate =
        existingBatch.receivedDate ?? movement.createdAt.slice(0, 10);
    } else {
      state.purchaseBatches.unshift({
        batchNo: input.reference,
        sku,
        receivedQuantity: input.quantity,
        supplierName: "Warehouse receiving",
        purchaseRef: input.reference,
        receivedDate: movement.createdAt.slice(0, 10),
      });
    }
  }

  state.stockMovements.unshift(movement);
  return {
    ok: true as const,
    inventory: getInventoryState().inventory,
    movement,
  };
}

export function receiveQuarantinedStock(input: {
  sku: string;
  quantity: number;
  reference: string;
  location: string;
  createdBy?: string;
}) {
  const sku = resolveSkuIdentifier(input.sku);
  if (!sku) return { ok: false as const, message: "SKU or barcode not found." };
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return { ok: false as const, message: "Quantity must be positive." };
  }

  const row = state.inventory.find((item) => item.sku === sku);
  if (!row) return { ok: false as const, message: "SKU not found." };

  row.onHand += input.quantity;
  row.quarantine = (row.quarantine ?? 0) + input.quantity;

  const movement: StockMovement = {
    id: `SM-${Date.now()}-${sku}`,
    sku,
    movement: "Inbound",
    quantity: input.quantity,
    location: input.location,
    reference: input.reference,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
  state.stockMovements.unshift(movement);

  const existingBatch = state.purchaseBatches.find(
    (batch) => batch.batchNo === input.reference && batch.sku === sku,
  );
  if (existingBatch) {
    existingBatch.receivedQuantity = (existingBatch.receivedQuantity ?? 0) + input.quantity;
    existingBatch.receivedDate = existingBatch.receivedDate ?? movement.createdAt.slice(0, 10);
  } else {
    state.purchaseBatches.unshift({
      batchNo: input.reference,
      sku,
      receivedQuantity: input.quantity,
      supplierName: "Warehouse receiving",
      purchaseRef: input.reference,
      receivedDate: movement.createdAt.slice(0, 10),
    });
  }

  return {
    ok: true as const,
    inventory: getInventoryState().inventory,
    movement,
  };
}

export function submitOrder(
  input: CreateOrderInput,
  context: { createdBy?: string; priceResolver?: PriceResolver } = {},
) {
  if (!isTradeAccountApprovedForOrdering(input.tradeAccountId)) {
    return {
      ok: false as const,
      message: "Trade account must be approved before orders can be submitted.",
    };
  }

  for (const line of input.lines) {
    const product = findProductBySku(line.sku);
    if (!product)
      return { ok: false as const, message: `SKU ${line.sku} was not found.` };
    if (product.status !== "active") {
      return {
        ok: false as const,
        message: `SKU ${line.sku} is not active for trade ordering.`,
      };
    }
  }

  const result = createDraftOrder(
    state.inventory,
    input,
    context.priceResolver,
  );
  if (!result.ok) return result;

  state.inventory = result.inventory;
  const order = { ...result.order, createdBy: context.createdBy };
  state.orders.unshift(order);
  state.accountDocuments.unshift(
    createAccountDocument({
      tradeAccountId: order.tradeAccountId,
      type: "order_confirmation",
      reference: `OC-${order.id}`,
      storagePath: `generated/order-confirmations/${order.id}.txt`,
    }),
  );
  ensureMonthlyStatementDocument(order.tradeAccountId);

  return { ok: true as const, order, inventory: getInventoryState().inventory };
}

export function dispatchOrder(
  orderId: string,
  context: { createdBy?: string } = {},
) {
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return { ok: false as const, message: "Order was not found." };
  if (order.status === "dispatched")
    return {
      ok: false as const,
      message: "Order has already been dispatched.",
    };
  if (order.status === "cancelled")
    return {
      ok: false as const,
      message: "Cancelled orders cannot be dispatched.",
    };

  for (const line of order.lines) {
    const row = state.inventory.find((item) => item.sku === line.sku);
    if (!row)
      return { ok: false as const, message: `SKU ${line.sku} was not found.` };
    if (row.reserved < line.quantity || row.onHand < line.quantity) {
      return {
        ok: false as const,
        message: `SKU ${line.sku} does not have enough reserved stock.`,
      };
    }
  }

  const movements: StockMovement[] = [];
  for (const line of order.lines) {
    const row = state.inventory.find((item) => item.sku === line.sku);
    if (!row) continue;

    row.reserved -= line.quantity;
    row.onHand -= line.quantity;

    const movement: StockMovement = {
      id: `SM-${Date.now()}-${line.sku}`,
      sku: line.sku,
      movement: "Dispatch",
      quantity: line.quantity,
      location: "BNE dispatch",
      reference: order.id,
      createdAt: new Date().toISOString(),
      createdBy: context.createdBy,
    };
    movements.push(movement);
    state.stockMovements.unshift(movement);
  }

  order.status = "dispatched";
  state.accountDocuments.unshift(
    createAccountDocument({
      tradeAccountId: order.tradeAccountId,
      type: "invoice",
      reference: `INV-${order.id}`,
      storagePath: `generated/invoices/${order.id}.txt`,
    }),
  );
  state.accountDocuments.unshift(
    createAccountDocument({
      tradeAccountId: order.tradeAccountId,
      type: "delivery_record",
      reference: `DEL-${order.id}`,
      storagePath: `generated/delivery-records/${order.id}.txt`,
    }),
  );
  return {
    ok: true as const,
    order: { ...order, lines: order.lines.map((line) => ({ ...line })) },
    inventory: getInventoryState().inventory,
    movements,
  };
}

export function cancelOrder(
  orderId: string,
  input: { tradeAccountId?: string } = {},
) {
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return { ok: false as const, message: "Order was not found." };
  if (input.tradeAccountId && order.tradeAccountId !== input.tradeAccountId) {
    return { ok: false as const, message: "Order was not found." };
  }
  if (order.status === "dispatched")
    return {
      ok: false as const,
      message: "Dispatched orders cannot be cancelled.",
    };
  if (order.status === "cancelled")
    return { ok: false as const, message: "Order has already been cancelled." };

  for (const line of order.lines) {
    const row = state.inventory.find((item) => item.sku === line.sku);
    if (row) row.reserved = Math.max(row.reserved - line.quantity, 0);
  }

  order.status = "cancelled";
  return {
    ok: true as const,
    order: { ...order, lines: order.lines.map((line) => ({ ...line })) },
    inventory: getInventoryState().inventory,
  };
}

export function submitTradeAccountApplication(
  input: TradeAccountApplicationInput,
) {
  const normalizedEmail = input.contactEmail.trim().toLowerCase();
  const normalizedAbn = (input.abn ?? "").replace(/[^0-9]/g, "");
  const duplicate = state.accountApplications.find(
    (candidate) =>
      candidate.status !== "closed" &&
      (candidate.contactEmail.trim().toLowerCase() === normalizedEmail ||
        (normalizedAbn &&
          (candidate.abn ?? "").replace(/[^0-9]/g, "") === normalizedAbn)),
  );
  if (duplicate) {
    return {
      ok: false as const,
      message: "An active application already exists for this email or ABN.",
    };
  }

  const application: TradeAccountApplication = {
    ...input,
    id: `TA-${Date.now()}`,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  state.accountApplications.unshift(application);
  return { ok: true as const, application };
}

export function approveTradeAccountApplication(applicationId: string) {
  const application = state.accountApplications.find(
    (candidate) => candidate.id === applicationId,
  );
  if (!application)
    return {
      ok: false as const,
      message: "Trade account application was not found.",
    };
  if (application.status !== "pending") {
    return {
      ok: false as const,
      message: "Trade account application is not pending.",
    };
  }

  application.status = "approved";
  return { ok: true as const, application: { ...application } };
}

export function provisionTradeAccountLogin(applicationId: string) {
  const application = state.accountApplications.find(
    (candidate) => candidate.id === applicationId,
  );
  if (!application)
    return {
      ok: false as const,
      message: "Trade account application was not found.",
    };
  if (application.status === "paused" || application.status === "closed") {
    return {
      ok: false as const,
      message: "Paused or closed trade accounts cannot be provisioned.",
    };
  }
  if (!application.contactEmail) {
    return {
      ok: false as const,
      message:
        "Trade account contact email is required before login can be provisioned.",
    };
  }

  application.status = "approved";
  const suffix =
    application.id.replace(/[^0-9A-Za-z]/g, "").slice(-6) || "demo";
  return {
    ok: true as const,
    application: { ...application },
    login: {
      email: application.contactEmail,
      userId: `demo-user-${suffix}`,
      created: true,
      setupEmailSent: true,
    },
  };
}

export function updateTradeAccountStatus(
  applicationId: string,
  status: TradeAccountStatus,
) {
  if (applicationId === "acct-demo") {
    return {
      ok: false as const,
      message: "Demo trade account status cannot be changed.",
    };
  }

  const application = state.accountApplications.find(
    (candidate) => candidate.id === applicationId,
  );
  if (!application)
    return { ok: false as const, message: "Trade account was not found." };

  application.status = status;
  return { ok: true as const, application: { ...application } };
}

export function resetStoreForTests() {
  state.inventory = createInitialStore().inventory;
  state.stockMovements = [];
  state.orders = [];
  state.accountDocuments = [];
  state.accountApplications = [];
  state.purchaseBatches = [];
  state.lookupRequests = [];
}
