type Carton = { sourceCartonNumber: string; memberCartonNumbers?: string[] };
export function resolveWarehouseScopeLookup(input: string, cartons: Carton[], productIdentifiers: string[]) {
  const normalize = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");
  const identifier = normalize(input);
  if (!identifier) return { status: "empty" as const };
  const carton = cartons.find(value => normalize(value.sourceCartonNumber) === identifier || value.memberCartonNumbers?.some(member => normalize(member) === identifier));
  if (carton) return { status: "matched" as const, carton, isMember: normalize(carton.sourceCartonNumber) !== identifier };
  if (productIdentifiers.some(value => normalize(value) === identifier)) return { status: "wrong_kind" as const };
  return { status: "not_found" as const };
}
