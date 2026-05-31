import { NextResponse } from "next/server";
import { can } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/repository";
import type { AdminCatalogueRow } from "../../../../lib/repository";
import { getRequestContext } from "../../../../lib/serverAuth";
import { productMasterImportSchema } from "../../../../lib/validators";

type ImportFailure = {
  row: number;
  sku: string;
  message: string;
};

export async function POST(request: Request) {
  const authContext = await getRequestContext(request);
  if (!can(authContext.role, "admin_write")) {
    return NextResponse.json({ ok: false, message: "Product master import requires an admin role." }, { status: 403 });
  }

  const parsed = productMasterImportSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const repository = getRepository();
  const currentState = await repository.getAdminState();
  const existingSkus = new Set(currentState.catalogue.map((product) => product.sku.toUpperCase()));
  const failures: ImportFailure[] = [];
  const products: AdminCatalogueRow[] = [];
  let created = 0;
  let updated = 0;

  for (const [index, row] of parsed.data.rows.entries()) {
    const sku = row.sku.trim().toUpperCase();
    const result = existingSkus.has(sku)
      ? await repository.updateProductMaster(
          {
            sku,
            brand: row.brand,
            name: row.name,
            category: row.category,
            barcode: row.barcode,
            oemPartNumber: row.oemPartNumber,
            reorderPoint: row.reorderPoint,
            reorderQuantity: row.reorderQuantity,
            status: row.status,
          },
          { actorId: authContext.userId },
        )
      : await repository.createProductMaster({ ...row, sku }, { actorId: authContext.userId });

    if (!result.ok) {
      failures.push({ row: index + 1, sku, message: result.message });
      continue;
    }

    products.push(result.product);
    if (existingSkus.has(sku)) {
      updated += 1;
    } else {
      created += 1;
      existingSkus.add(sku);
    }
  }

  const response = {
    ok: failures.length === 0,
    summary: {
      created,
      updated,
      failed: failures.length,
    },
    products,
    failures,
  };

  return NextResponse.json(response, { status: failures.length ? 207 : 200 });
}
