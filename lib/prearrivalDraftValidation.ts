import type { PackingListRevisionInput } from "./prearrivalShipment";

export type PackingListFieldErrors = Record<string, string>;

export type PackingListServerError = {
  fieldErrors?: Array<{
    path: Array<string | number>;
    message: string;
  }>;
};

export function packingListFieldKey(path: Array<string | number>): string {
  return path.map(String).join(".");
}

export function mapPackingListServerErrors(
  error?: PackingListServerError,
): PackingListFieldErrors {
  const fieldErrors: PackingListFieldErrors = {};

  for (const fieldError of error?.fieldErrors ?? []) {
    fieldErrors[packingListFieldKey(fieldError.path)] = fieldError.message;
  }

  return fieldErrors;
}

export function validatePackingListDraft(
  payload: PackingListRevisionInput,
  knownSkus: readonly string[],
): {
  ok: boolean;
  fieldErrors: PackingListFieldErrors;
  firstField: string | undefined;
  summary: string | undefined;
} {
  const normalizedKnownSkus = new Set(
    knownSkus.map((sku) => sku.trim().toUpperCase()),
  );
  const fieldErrors: PackingListFieldErrors = {};

  payload.pallets.forEach((pallet, palletIndex) => {
    if (!pallet.sourcePalletNumber.trim()) {
      fieldErrors[
        packingListFieldKey(["pallets", palletIndex, "sourcePalletNumber"])
      ] = "Enter the pallet number.";
    }

    pallet.cartons.forEach((carton, cartonIndex) => {
      if (!carton.sourceCartonNumber.trim()) {
        fieldErrors[
          packingListFieldKey([
            "pallets",
            palletIndex,
            "cartons",
            cartonIndex,
            "sourceCartonNumber",
          ])
        ] = "Enter the carton number.";
      }

      carton.lines.forEach((line, lineIndex) => {
        const skuField = packingListFieldKey([
          "pallets",
          palletIndex,
          "cartons",
          cartonIndex,
          "lines",
          lineIndex,
          "sku",
        ]);
        const normalizedSku = line.sku.trim().toUpperCase();

        if (!normalizedSku) {
          fieldErrors[skuField] = "Enter a recognised SKU.";
        } else if (!normalizedKnownSkus.has(normalizedSku)) {
          fieldErrors[skuField] = "Select an SKU from the product master.";
        }

        if (!Number.isInteger(line.expectedQuantity) || line.expectedQuantity <= 0) {
          fieldErrors[
            packingListFieldKey([
              "pallets",
              palletIndex,
              "cartons",
              cartonIndex,
              "lines",
              lineIndex,
              "expectedQuantity",
            ])
          ] = "Enter a positive whole quantity.";
        }
      });
    });
  });

  const firstField = Object.keys(fieldErrors)[0];
  const ok = firstField === undefined;

  return {
    ok,
    fieldErrors,
    firstField,
    summary: ok
      ? undefined
      : "Complete the highlighted Packing List fields before confirming.",
  };
}
