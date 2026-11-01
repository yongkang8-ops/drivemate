import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "../../../../lib/serverAuth";
import { can } from "../../../../lib/auth";
import { mutationRequestAllowed } from "../../../../lib/requestSecurity";
import { getRepository } from "../../../../lib/repository";
import { resolveWarehouseInboundScope } from "../../../../lib/warehouseInboundScope";
import { buildProductLabelContent } from "../../../../lib/warehouseLabelContent";
import { testPrintItemsSchema } from "../../../../lib/warehouseTestPrint";
const selectionSchema = z
  .object({
    shipmentId: z.string().trim().min(1).max(120),
    palletNumbers: z
      .array(z.string().trim().min(1).max(120))
      .max(100)
      .optional(),
    cartonNumbers: z
      .array(z.string().trim().min(1).max(120))
      .max(100)
      .optional(),
  })
  .strict();
const schema = z
  .object({
    requestId: z.uuid(),
    selection: selectionSchema,
    items: testPrintItemsSchema,
  })
  .strict();
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  if (!mutationRequestAllowed(request))
    return reply(
      { ok: false, message: "Request security validation failed." },
      403,
    );
  const actor = await getRequestContext(request);
  if (!actor.userId || !can(actor.role, "warehouse_label_print"))
    return reply(
      { ok: false, message: "Warehouse label permission is required." },
      403,
    );
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return reply(
      {
        ok: false,
        message: "Choose 1–10 unique SKUs, 1–5 copies each, at most 20 labels.",
      },
      400,
    );
  try {
    const { selection, requestId, items } = parsed.data;
    const requestKey = JSON.stringify({
      shipmentId: selection.shipmentId,
      palletNumbers: [...new Set(selection.palletNumbers ?? [])].sort(),
      cartonNumbers: [...new Set(selection.cartonNumbers ?? [])].sort(),
      items: [...items].sort((a, b) => a.sku.localeCompare(b.sku)),
    });
    const repo = getRepository();
    const existing = await repo.testPrint.findByRequest(
      requestId,
      actor.userId,
    );
    if (existing)
      return existing.requestKey === requestKey
        ? reply({ ok: true, job: existing })
        : reply(
            {
              ok: false,
              message: "Request ID already used for different test details.",
            },
            409,
          );
    const pendingFormal = await repo.findPendingWarehouseLabelPrintJob(
      selection.shipmentId,
    );
    if (pendingFormal)
      return reply(
        {
          ok: false,
          message: `Formal print task ${pendingFormal.id} still needs an outcome. Review it before creating a test task.`,
        },
        409,
      );
    const scope = await resolveWarehouseInboundScope(repo, selection);
    if (!scope.ok) return reply({ ok: false, message: scope.message }, 404);
    if (
      items.some(
        (item) => !scope.scope.lines.some((line) => line.sku === item.sku),
      )
    )
      return reply(
        {
          ok: false,
          message: "A selected SKU is outside this confirmed scope.",
        },
        422,
      );
    const products = await repo.getWarehouseLabelProducts(
      items.map((i) => i.sku),
    );
    const labels = [];
    let sequence = 0;
    for (const item of items) {
      const matches = products.filter((p) => p.sku === item.sku);
      if (
        matches.length !== 1 ||
        matches[0].barcode !==
          scope.scope.lines.find((l) => l.sku === item.sku)?.productBarcode
      )
        return reply(
          { ok: false, message: "Product barcode requires review." },
          422,
        );
      const label = buildProductLabelContent(matches[0]);
      if (!label.content)
        return reply(
          {
            ok: false,
            message: `Complete label details for ${item.sku} before test printing.`,
          },
          422,
        );
      for (let i = 0; i < item.copies; i++)
        labels.push({
          itemId: randomUUID(),
          sequence: ++sequence,
          sku: item.sku,
          barcode: label.content.productBarcode,
          labelContent: label.content,
        });
    }
    const result = await repo.testPrint.create(
      { requestId, requestKey, shipmentId: selection.shipmentId, labels },
      actor.userId,
    );
    return reply(result, result.ok ? 201 : 409);
  } catch {
    return reply(
      {
        ok: false,
        message:
          "Test creation result could not be confirmed. Check this request before retrying.",
      },
      503,
    );
  }
}
export async function GET(request: Request) {
  const actor = await getRequestContext(request);
  if (!actor.userId || !can(actor.role, "warehouse_label_print"))
    return reply(
      { ok: false, message: "Warehouse label permission is required." },
      403,
    );
  const params = new URL(request.url).searchParams;
  try {
    if (params.has("requestId")) {
      const id = z.uuid().safeParse(params.get("requestId"));
      if (!id.success)
        return reply({ ok: false, message: "Invalid request ID." }, 400);
      const job = await getRepository().testPrint.findByRequest(
        id.data,
        actor.userId,
      );
      return reply({ ok: true, job });
    }
    const query = z
      .object({
        shipmentId: z.string().min(1).max(120),
        page: z.coerce.number().int().min(1).max(100000),
      })
      .safeParse({
        shipmentId: params.get("shipmentId"),
        page: params.get("page") ?? 1,
      });
    if (!query.success)
      return reply({ ok: false, message: "Invalid test-record query." }, 400);
    return reply({
      ok: true,
      ...(await getRepository().testPrint.list(
        query.data.shipmentId,
        query.data.page,
      )),
    });
  } catch {
    return reply(
      {
        ok: false,
        message: "Test records could not be loaded. Retry the read.",
      },
      503,
    );
  }
}
