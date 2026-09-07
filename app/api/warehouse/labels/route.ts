import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/repository";
import { mutationRequestAllowed } from "../../../../lib/requestSecurity";
import { getRequestContext, requestCan } from "../../../../lib/serverAuth";
import { resolveWarehouseInboundScope } from "../../../../lib/warehouseInboundScope";
import { buildProductLabelContent, type ProductLabelSnapshot } from "../../../../lib/warehouseLabelContent";

const selectionSchema = z.object({
  shipmentId: z.string().trim().min(1).max(120),
  palletNumbers: z.array(z.string().trim().min(1).max(120)).optional(),
  cartonNumbers: z.array(z.string().trim().min(1).max(120)).optional(),
}).strict();

const createPrintJobSchema = z.object({
  selection: selectionSchema,
  templateId: z.literal("unit_product"),
}).strict();

function selectionFromSearchParams(request: Request) {
  const params = new URL(request.url).searchParams;
  return selectionSchema.safeParse({
    shipmentId: params.get("shipmentId") ?? "",
    palletNumbers: params.getAll("palletNumber"),
    cartonNumbers: params.getAll("cartonNumber"),
  });
}

function labelItemPayloads(scope: Awaited<ReturnType<typeof resolveWarehouseInboundScope>> & { ok: true }, contents: Map<string, ProductLabelSnapshot>) {
  return scope.scope.lines.flatMap((line) =>
    Array.from({ length: line.expectedQuantity }, (_, index) => ({
      shipmentId: scope.scope.shipmentId,
      sku: line.sku,
      productBarcode: line.productBarcode,
      copy: index + 1,
      labelContent: contents.get(line.sku)!,
    })),
  );
}

export async function GET(request: Request) {
  if (!(await requestCan(request, "warehouse_label_print"))) {
    return NextResponse.json(
      { ok: false, message: "Warehouse label preview requires warehouse label access." },
      { status: 403 },
    );
  }
  const parsed = selectionFromSearchParams(request);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const repository = getRepository();
  const resolved = await resolveWarehouseInboundScope(repository, parsed.data);
  if (!resolved.ok) return NextResponse.json(resolved, { status: 404 });
  const shipments = await repository.listPrearrivalShipments();
  const shipmentReference = shipments.shipments.find(
    (shipment) => shipment.shipmentId === resolved.shipment.shipmentId,
  )?.shipmentReference;

  const printGate = await repository.checkWarehouseReceiptPrintGate(resolved.scope);
  const products = await repository.getWarehouseLabelProducts(resolved.scope.lines.map(line => line.sku));
  const labelProducts = resolved.scope.lines.map(line => {
    const matches = products.filter(product => product.sku === line.sku);
    if (matches.length !== 1) return { sku: line.sku, issues: ["product"] };
    if (matches[0].barcode !== line.productBarcode) return { sku: line.sku, issues: ["barcode"] };
    return buildProductLabelContent(matches[0]);
  });
  return NextResponse.json({
    ok: true,
    shipment: {
      shipmentId: resolved.shipment.shipmentId,
      shipmentReference,
      pallets: resolved.shipment.pallets,
      cartons: resolved.shipment.cartons,
      productIdentifiers: [...new Set(resolved.shipment.lines.flatMap(line => [line.sku, resolved.shipment.productBarcodes[line.sku]]).filter(Boolean))],
    },
    scope: resolved.scope,
    printGate,
    labelProducts,
  });
}

export async function POST(request: Request) {
  if (!mutationRequestAllowed(request)) {
    return NextResponse.json({ ok: false, message: "Request security validation failed." }, { status: 403 });
  }
  const auth = await getRequestContext(request);
  if (!can(auth.role, "warehouse_label_print")) {
    return NextResponse.json(
      { ok: false, message: "Warehouse label printing requires warehouse label access." },
      { status: 403 },
    );
  }

  const parsed = createPrintJobSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const repository = getRepository();
  const resolved = await resolveWarehouseInboundScope(repository, parsed.data.selection);
  if (!resolved.ok) return NextResponse.json(resolved, { status: 404 });
  const products = await repository.getWarehouseLabelProducts(resolved.scope.lines.map(line => line.sku));
  const contents = new Map<string, ProductLabelSnapshot>();
  const labelIssues: Array<{ sku: string; fields: string[] }> = [];
  for (const line of resolved.scope.lines) {
    const matches = products.filter(product => product.sku === line.sku);
    const result = matches.length !== 1 ? { issues: ["product"], content: undefined }
      : matches[0].barcode !== line.productBarcode ? { issues: ["barcode"], content: undefined }
      : buildProductLabelContent(matches[0]);
    if (!result.content) labelIssues.push({ sku: line.sku, fields: result.issues });
    else contents.set(line.sku, result.content);
  }
  if (labelIssues.length) return NextResponse.json({ ok: false, message: "Complete the selected products' label details before creating a print job.", labelIssues }, { status: 422 });
  const requestedQuantity = resolved.scope.lines.reduce(
    (total, line) => total + line.expectedQuantity,
    0,
  );
  const created = await repository.createWarehouseLabelPrintJobWithItems({
    templateId: parsed.data.templateId,
    payloadSnapshot: { ...resolved.scope, labelVersion: "unit-product-v4" },
    requestedQuantity,
    itemPayloadSnapshots: labelItemPayloads(resolved, contents),
  }, { actorId: auth.userId });
  if (!created.ok) return NextResponse.json(created, { status: 422 });

  return NextResponse.json({ ok: true, job: created.job, items: created.items }, { status: 201 });
}
