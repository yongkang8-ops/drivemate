type ScopeShipment = {
  cartons: { sourceCartonNumber: string }[];
  pallets: { sourcePalletNumber: string }[];
};

export function readWarehouseScope(params: URLSearchParams, shipment: ScopeShipment):
  | { ok: true; palletNumbers: string[]; cartonNumbers: string[] }
  | { ok: false } {
  const palletNumbers = [...new Set(params.getAll("palletNumber"))];
  const cartonNumbers = [...new Set(params.getAll("cartonNumber"))];
  if (palletNumbers.length && cartonNumbers.length) return { ok: false };
  if (params.has("scope")) {
    if (params.getAll("scope").length !== 1 || params.get("scope") !== "all" || palletNumbers.length || cartonNumbers.length) return { ok: false };
    return { ok: true, palletNumbers: [], cartonNumbers: [] };
  }
  if (palletNumbers.some(value => !value || value.length > 200 || /\p{Cc}/u.test(value) || !shipment.pallets.some(pallet => pallet.sourcePalletNumber === value))
    || cartonNumbers.some(value => !value || value.length > 200 || /\p{Cc}/u.test(value) || !shipment.cartons.some(carton => carton.sourceCartonNumber === value))) return { ok: false };
  if (!palletNumbers.length && !cartonNumbers.length && shipment.pallets[0]) palletNumbers.push(shipment.pallets[0].sourcePalletNumber);
  return { ok: true, palletNumbers, cartonNumbers };
}

export function writeWarehouseScope(params: URLSearchParams, palletNumbers: string[], cartonNumbers: string[]) {
  params.delete("palletNumber"); params.delete("cartonNumber"); params.delete("scope");
  palletNumbers.forEach(value => params.append("palletNumber", value));
  cartonNumbers.forEach(value => params.append("cartonNumber", value));
  if (!palletNumbers.length && !cartonNumbers.length) params.set("scope", "all");
}

export function warehouseScopeKey(href: string): string {
  const params = new URL(href).searchParams;
  return JSON.stringify([params.getAll("palletNumber").sort(), params.getAll("cartonNumber").sort(), params.get("scope")]);
}
