import { z } from "zod";

export const vehicleLookupSchema = z.object({
  rego: z.string().trim().optional(),
  vin: z.string().trim().optional(),
  query: z.string().trim().optional(),
});

export const inventoryMovementSchema = z.object({
  type: z.enum(["inbound", "putaway", "dispatch", "return", "quarantine", "adjustment"]),
  sku: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  reference: z.string().trim().min(1),
  location: z.string().trim().optional(),
  fromLocation: z.string().trim().optional(),
  toLocation: z.string().trim().optional(),
  adjustmentDirection: z.enum(["increase", "decrease"]).optional(),
  quarantineAction: z.enum(["release", "writeoff"]).optional(),
});

export const inventoryMovementImportSchema = z.object({
  rows: z.array(inventoryMovementSchema).min(1).max(200),
});

export const createOrderSchema = z.object({
  tradeAccountId: z.string().trim().min(1).optional(),
  poNumber: z.string().trim().optional(),
  vehicleVin: z.string().trim().optional(),
  vehicleRego: z.string().trim().optional(),
  lines: z
    .array(
      z.object({
        sku: z.string().trim().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
});

export const dispatchOrderSchema = z.object({
  scans: z
    .array(
      z.object({
        sku: z.string().trim().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
});

export const tradeAccountApplicationSchema = z.object({
  accountName: z.string().trim().min(2),
  abn: z.string().trim().optional(),
  contactName: z.string().trim().min(2),
  contactEmail: z.string().trim().email(),
  contactPhone: z.string().trim().min(6),
  postcode: z.string().trim().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const tradeAccountStatusUpdateSchema = z.object({
  status: z.enum(["pending", "approved", "paused", "closed"]),
});

export const productMasterUpdateSchema = z.object({
  barcode: z.string().trim().min(1).optional(),
  oemPartNumber: z.string().trim().optional(),
  brand: z.enum(["GWM", "BYD", "MG"]).optional(),
  name: z.string().trim().min(2).optional(),
  category: z.string().trim().min(2).optional(),
  reorderPoint: z.number().int().min(0).optional(),
  reorderQuantity: z.number().int().min(0).optional(),
  status: z.enum(["active", "draft", "paused"]).optional(),
});

export const productMasterCreateSchema = z.object({
  sku: z.string().trim().min(3),
  barcode: z.string().trim().min(1),
  oemPartNumber: z.string().trim().optional(),
  brand: z.enum(["GWM", "BYD", "MG"]),
  name: z.string().trim().min(2),
  category: z.string().trim().min(2),
  vehicle: z.string().trim().optional(),
  fitment: z.string().trim().optional(),
  reorderPoint: z.number().int().min(0).optional(),
  reorderQuantity: z.number().int().min(0).optional(),
  status: z.enum(["active", "draft", "paused"]).optional(),
});

export const productMasterImportSchema = z.object({
  rows: z.array(productMasterCreateSchema).min(1).max(100),
});

export const fitmentRuleCreateSchema = z
  .object({
    sku: z.string().trim().min(3),
    make: z.string().trim().min(2),
    model: z.string().trim().min(2),
    yearFrom: z.number().int().min(1900).max(2100),
    yearTo: z.number().int().min(1900).max(2100).optional(),
    engine: z.string().trim().optional(),
    confidence: z.enum(["exact", "likely", "confirm_vin"]),
  })
  .refine((value) => value.yearTo === undefined || value.yearTo >= value.yearFrom, {
    message: "yearTo must be greater than or equal to yearFrom",
    path: ["yearTo"],
  });

export const fitmentRuleImportSchema = z.object({
  rows: z.array(fitmentRuleCreateSchema).min(1).max(200),
});
