import { NextResponse } from "next/server";
import { can } from "../../../../lib/auth";
import type { InventoryMovementInput, StockMovement } from "../../../../lib/repository";
import { getRepository } from "../../../../lib/repository";
import { getRequestContext } from "../../../../lib/serverAuth";
import { inventoryMovementImportSchema } from "../../../../lib/validators";
import { mutationRequestAllowed } from "../../../../lib/requestSecurity";
import type { InventoryRow } from "../../../../lib/inventory";

type ImportFailure = {
  row: number;
  sku: string;
  reference: string;
  message: string;
};

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "inventory_write")) {
    return NextResponse.json({ ok: false, message: "Inventory movement import requires a warehouse role." }, { status: 403 });
  }

  const parsed = inventoryMovementImportSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const repository = getRepository();
  const failures: ImportFailure[] = [];
  const movements: StockMovement[] = [];
  let inventory: InventoryRow[] = [];

  for (const [index, row] of parsed.data.rows.entries()) {
    const input: InventoryMovementInput = {
      ...row,
      sku: row.sku.trim(),
      reference: row.reference.trim(),
      location: row.location?.trim(),
      fromLocation: row.fromLocation?.trim(),
      toLocation: row.toLocation?.trim(),
    };
    const result = await repository.applyInventoryMovement(input, { actorId: authContext.userId });
    if (!result.ok) {
      failures.push({ row: index + 1, sku: input.sku, reference: input.reference, message: result.message });
      continue;
    }
    if (!("movement" in result) || !("inventory" in result)) {
      failures.push({
        row: index + 1,
        sku: input.sku,
        reference: input.reference,
        message: "Inventory movement did not return an audit row.",
      });
      continue;
    }

    movements.push(result.movement);
    inventory = result.inventory;
  }

  return NextResponse.json(
    {
      ok: failures.length === 0,
      summary: {
        processed: parsed.data.rows.length,
        created: movements.length,
        failed: failures.length,
      },
      inventory,
      movements,
      failures,
    },
    { status: failures.length ? 207 : 200 },
  );
}
