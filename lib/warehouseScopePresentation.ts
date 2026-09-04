export function describeUnmappedPalletSelection(sourceScopes: string[]): string {
  if (sourceScopes.length === 0) {
    return "Pallet mapping not recorded · Full shipment selected";
  }
  if (sourceScopes.length === 1) {
    return `Pallet mapping not recorded · Source scope ${sourceScopes[0]} selected`;
  }
  return `Pallet mapping not recorded · ${sourceScopes.length} source scopes selected`;
}
