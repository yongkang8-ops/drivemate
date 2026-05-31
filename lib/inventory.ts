export type InventoryRow = {
  sku: string;
  onHand: number;
  reserved: number;
  quarantine?: number;
};

export type MovementInput = {
  sku: string;
  quantity: number;
};

export type MovementResult = { ok: true } | { ok: false; message: string };

export function availableStock(row: InventoryRow): number {
  return Math.max(row.onHand - row.reserved - (row.quarantine ?? 0), 0);
}

export function receiveStock(rows: InventoryRow[], input: MovementInput): MovementResult {
  const row = rows.find((item) => item.sku === input.sku);
  if (!row) return { ok: false, message: "SKU not found." };
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return { ok: false, message: "Quantity must be positive." };
  }

  row.onHand += input.quantity;
  return { ok: true };
}

export function dispatchStock(rows: InventoryRow[], input: MovementInput): MovementResult {
  const row = rows.find((item) => item.sku === input.sku);
  if (!row) return { ok: false, message: "SKU not found." };
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return { ok: false, message: "Quantity must be positive." };
  }
  if (availableStock(row) < input.quantity) {
    return { ok: false, message: "Not enough available stock." };
  }

  row.onHand -= input.quantity;
  return { ok: true };
}

export function quarantineStock(rows: InventoryRow[], input: MovementInput): MovementResult {
  const row = rows.find((item) => item.sku === input.sku);
  if (!row) return { ok: false, message: "SKU not found." };
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return { ok: false, message: "Quantity must be positive." };
  }
  if (availableStock(row) < input.quantity) {
    return { ok: false, message: "Not enough available stock." };
  }

  row.quarantine = (row.quarantine ?? 0) + input.quantity;
  return { ok: true };
}
