import { NextResponse } from "next/server";
import { can } from "../../../../lib/auth";
import { sensitiveOperationAccessError } from "../../../../lib/apiAuthResponses";
import type {
  InventoryMovementInput,
  StockMovement,
} from "../../../../lib/repository";
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
    return NextResponse.json(
      { ok: false, message: "Request security validation failed." },
      { status: 403 },
    );
  }
  const authContext = await getRequestContext(request);
  const accessError = sensitiveOperationAccessError(authContext, can(authContext.role, "inventory_adjust"), "Inventory movement import requires authorised inventory access.");
  if (accessError) return accessError;

  const parsed = inventoryMovementImportSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  if (process.env.DRIVEMATE_REPOSITORY === "supabase") {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Bulk inbound is disabled. Receive purchase shipments through /api/warehouse/receipts.",
      },
      { status: 422 },
    );
  }

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
    const result = await repository.applyInventoryMovement(input, {
      actorId: authContext.userId,
    });
    if (!result.ok) {
      failures.push({
        row: index + 1,
        sku: input.sku,
        reference: input.reference,
        message: result.message,
      });
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
