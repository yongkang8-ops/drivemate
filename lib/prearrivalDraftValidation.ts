import type { PackingListRevisionInput } from "./prearrivalShipment";

export type PackingListFieldErrors = Record<string, string>;

export type PackingListServerError = {
  fieldErrors?: unknown;
};

export function packingListFieldKey(path: Array<string | number>): string {
  return path.map(String).join(".");
}

export function mapPackingListServerErrors(
  error?: PackingListServerError,
): PackingListFieldErrors {
  const fieldErrors: PackingListFieldErrors = {};
  if (!Array.isArray(error?.fieldErrors)) return fieldErrors;

  for (const candidate of error.fieldErrors) {
    if (!candidate || typeof candidate !== "object") continue;
    const { path, message } = candidate as { path?: unknown; message?: unknown };
    if (
      !Array.isArray(path)
      || !path.length
      || !path.every((segment) => (
        typeof segment === "string"
        || (typeof segment === "number" && Number.isSafeInteger(segment))
      ))
      || typeof message !== "string"
    ) continue;

    const key = packingListFieldKey(path);
    if (!(key in fieldErrors)) fieldErrors[key] = message;
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
  const palletNumbers = new Set<string>();
  const cartonNumbers = new Set<string>();

  payload.pallets.forEach((pallet, palletIndex) => {
    const palletField = packingListFieldKey([
      "pallets",
      palletIndex,
      "sourcePalletNumber",
    ]);
    const normalizedPalletNumber = pallet.sourcePalletNumber.trim().toUpperCase();
    if (!normalizedPalletNumber) {
      fieldErrors[palletField] = "Enter the pallet number.";
    } else if (palletNumbers.has(normalizedPalletNumber)) {
      fieldErrors[palletField] = "Use a unique pallet number.";
    } else {
      palletNumbers.add(normalizedPalletNumber);
    }

    pallet.cartons.forEach((carton, cartonIndex) => {
      const cartonField = packingListFieldKey([
        "pallets",
        palletIndex,
        "cartons",
        cartonIndex,
        "sourceCartonNumber",
      ]);
      const normalizedCartonNumber = carton.sourceCartonNumber.trim().toUpperCase();
      if (!normalizedCartonNumber) {
        fieldErrors[cartonField] = "Enter the carton number.";
      } else if (cartonNumbers.has(normalizedCartonNumber)) {
        fieldErrors[cartonField] = "Use a unique carton number.";
      } else {
        cartonNumbers.add(normalizedCartonNumber);
      }

      const cartonSkus = new Set<string>();
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
        } else if (cartonSkus.has(normalizedSku)) {
          fieldErrors[skuField] = "Use each SKU once per carton.";
        } else {
          cartonSkus.add(normalizedSku);
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
