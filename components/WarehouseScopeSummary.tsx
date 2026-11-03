type ScopeSummaryProps = {
  className: string;
  sourceScopeCount: number;
  physicalCartonCount: number;
  cartonGroupCount: number;
};

export function WarehouseScopeSummary({ className, sourceScopeCount, physicalCartonCount, cartonGroupCount }: ScopeSummaryProps) {
  // The optional group is an element so translation cannot detach a text node React needs to remove.
  return (
    <p className={className} translate="no">
      <strong>{sourceScopeCount}</strong>{sourceScopeCount === 1 ? " source scope · " : " source scopes · "}
      <strong>{physicalCartonCount}</strong>{physicalCartonCount === 1 ? " physical carton" : " physical cartons"}
      {cartonGroupCount > 0 && <span>{` · ${cartonGroupCount} ${cartonGroupCount === 1 ? "group" : "groups"}`}</span>}
    </p>
  );
}
