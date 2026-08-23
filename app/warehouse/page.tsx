import type { Metadata } from "next";
import { RoleGate } from "../../components/RoleGate";
import { WarehouseScannerPanel } from "../../components/WarehouseScannerPanel";
import { GoodsReceiptPanel } from "../../components/GoodsReceiptPanel";
import { RmaReceivingPanel } from "../../components/RmaReceivingPanel";

export const metadata: Metadata = {
  title: "Warehouse Operations | DriveMate Parts",
  robots: {
    index: false,
    follow: false,
  },
};

export default function WarehousePage() {
  const showLegacyDirectMovements =
    process.env.DRIVEMATE_REPOSITORY !== "supabase";

  return (
    <main className="page-main internal-page">
      <div className="workspace-header"><div><p className="eyebrow">Warehouse operations</p><h1>Receive, locate, pick and dispatch.</h1><p>All purchase stock enters quarantine until the required acceptance gates are complete.</p></div></div>
      <nav className="internal-tabs" aria-label="Warehouse workflow"><a href="#receiving">Receiving</a><a href="#putaway">Putaway</a><a href="#dispatch">Pick &amp; Dispatch</a><a href="#returns">Returns</a><a href="#quarantine">Quarantine</a><a href="#stocktake">Stocktake</a></nav>
      <RoleGate expectedRole="warehouse">
        <>
          <GoodsReceiptPanel />
          <RmaReceivingPanel />
          <WarehouseScannerPanel
            showLegacyDirectMovements={showLegacyDirectMovements}
          />
        </>
      </RoleGate>
    </main>
  );
}
