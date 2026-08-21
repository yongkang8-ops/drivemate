import type { OrderLineInput } from "./orders";
import type { AccountDocument } from "./repository";
import { formatAudCents } from "./pricing";

type DocumentLine = OrderLineInput & {
  unitPriceExGstCents?: number;
  lineTotalExGstCents?: number;
  gstCents?: number;
  lineTotalIncGstCents?: number;
};

type BusinessProfile = {
  legalName: string;
  abn: string;
  accountsEmail: string;
  warehouseLabel: string;
};

export function getBusinessProfile(): BusinessProfile {
  return {
    legalName:
      process.env.DRIVEMATE_LEGAL_NAME?.trim() || "DriveMate Parts Pty Ltd",
    abn: process.env.DRIVEMATE_ABN?.trim() || "ABN pending",
    accountsEmail:
      process.env.DRIVEMATE_ACCOUNTS_EMAIL?.trim() ||
      "accounts@drivemateparts.com.au",
    warehouseLabel:
      process.env.DRIVEMATE_WAREHOUSE_LABEL?.trim() ||
      "Brisbane dispatch warehouse",
  };
}

export function hasConfiguredBusinessProfile(): boolean {
  return Boolean(
    process.env.DRIVEMATE_LEGAL_NAME?.trim() &&
    process.env.DRIVEMATE_ABN?.trim() &&
    process.env.DRIVEMATE_ACCOUNTS_EMAIL?.trim(),
  );
}

function documentLabel(type: AccountDocument["type"]) {
  if (type === "order_confirmation") return "Order confirmation";
  if (type === "invoice") return "Tax invoice";
  if (type === "credit_note") return "Credit note";
  if (type === "delivery_record") return "Delivery record";
  return "Monthly statement";
}

function formatDate(value: string | Date = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

function lineItems(lines: DocumentLine[]) {
  if (!lines.length) return ["- No order lines recorded on this document."];
  return lines.map((line) =>
    line.lineTotalIncGstCents !== undefined &&
    line.unitPriceExGstCents !== undefined
      ? `- ${line.sku} x ${line.quantity} @ ${formatAudCents(line.unitPriceExGstCents)} ex GST = ${formatAudCents(line.lineTotalIncGstCents)} inc GST`
      : `- ${line.sku} x ${line.quantity}`,
  );
}

function orderTotals(lines: DocumentLine[]) {
  const subtotalExGstCents = lines.reduce(
    (sum, line) => sum + (line.lineTotalExGstCents ?? 0),
    0,
  );
  const gstCents = lines.reduce((sum, line) => sum + (line.gstCents ?? 0), 0);
  const totalIncGstCents = lines.reduce(
    (sum, line) => sum + (line.lineTotalIncGstCents ?? 0),
    0,
  );
  if (!totalIncGstCents) return [];

  return [
    `Subtotal ex GST: ${formatAudCents(subtotalExGstCents)}`,
    `GST: ${formatAudCents(gstCents)}`,
    `Total inc GST: ${formatAudCents(totalIncGstCents)}`,
  ];
}

export function createAccountDocumentText(input: {
  type: AccountDocument["type"];
  reference: string;
  tradeAccountId: string;
  customerName?: string;
  customerAbn?: string;
  customerEmail?: string;
  generatedAt?: string | Date;
  contentLines?: string[];
}) {
  const profile = getBusinessProfile();

  return [
    "DriveMate Parts account document",
    `Document: ${documentLabel(input.type)}`,
    `Reference: ${input.reference}`,
    `Issued by: ${profile.legalName}`,
    `ABN: ${profile.abn}`,
    `Accounts contact: ${profile.accountsEmail}`,
    `Dispatch location: ${profile.warehouseLabel}`,
    `Trade account: ${input.tradeAccountId}`,
    `Bill to: ${input.customerName || input.tradeAccountId}`,
    `Buyer ABN: ${input.customerAbn || "Not supplied"}`,
    `Buyer contact: ${input.customerEmail || "Not supplied"}`,
    `Generated: ${formatDate(input.generatedAt)}`,
    "",
    ...(input.contentLines ?? []),
    "",
    "Status: Issued account record.",
  ].join("\n");
}

export function createInvoiceDocumentText(input: {
  reference: string;
  tradeAccountId: string;
  orderId: string;
  poNumber?: string;
  vehicleVin?: string;
  vehicleRego?: string;
  lines: DocumentLine[];
  generatedAt?: string | Date;
}) {
  return createAccountDocumentText({
    type: "invoice",
    reference: input.reference,
    tradeAccountId: input.tradeAccountId,
    generatedAt: input.generatedAt,
    contentLines: [
      `Order: ${input.orderId}`,
      `PO / job: ${input.poNumber || "Not supplied"}`,
      `Vehicle VIN: ${input.vehicleVin || "Not supplied"}`,
      `Vehicle rego: ${input.vehicleRego || "Not supplied"}`,
      "Lines:",
      ...lineItems(input.lines),
      ...orderTotals(input.lines),
    ],
  });
}

export function createOrderConfirmationDocumentText(input: {
  reference: string;
  tradeAccountId: string;
  orderId: string;
  poNumber?: string;
  vehicleVin?: string;
  vehicleRego?: string;
  lines: DocumentLine[];
  generatedAt?: string | Date;
}) {
  return createAccountDocumentText({
    type: "order_confirmation",
    reference: input.reference,
    tradeAccountId: input.tradeAccountId,
    generatedAt: input.generatedAt,
    contentLines: [
      `Order: ${input.orderId}`,
      `PO / job: ${input.poNumber || "Not supplied"}`,
      `Vehicle VIN: ${input.vehicleVin || "Not supplied"}`,
      `Vehicle rego: ${input.vehicleRego || "Not supplied"}`,
      "Reserved lines:",
      ...lineItems(input.lines),
      ...orderTotals(input.lines),
    ],
  });
}

export function createDeliveryRecordText(input: {
  reference: string;
  tradeAccountId: string;
  orderId: string;
  vehicleVin?: string;
  vehicleRego?: string;
  lines: DocumentLine[];
  generatedAt?: string | Date;
}) {
  return createAccountDocumentText({
    type: "delivery_record",
    reference: input.reference,
    tradeAccountId: input.tradeAccountId,
    generatedAt: input.generatedAt,
    contentLines: [
      `Order: ${input.orderId}`,
      `Vehicle VIN: ${input.vehicleVin || "Not supplied"}`,
      `Vehicle rego: ${input.vehicleRego || "Not supplied"}`,
      "Dispatched lines:",
      ...lineItems(input.lines),
    ],
  });
}

export function createStatementDocumentText(input: {
  reference: string;
  tradeAccountId: string;
  statementMonth: string;
  generatedAt?: string | Date;
}) {
  return createAccountDocumentText({
    type: "statement",
    reference: input.reference,
    tradeAccountId: input.tradeAccountId,
    generatedAt: input.generatedAt,
    contentLines: [
      `Statement month: ${input.statementMonth}`,
      "Scope: Released invoice records, delivery records and account activity for this trade account.",
    ],
  });
}

export function accountDocumentDataUrl(content: string) {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
}
