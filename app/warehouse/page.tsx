import type { Metadata } from "next";
import { RoleGate } from "../../components/RoleGate";
import { WarehouseScannerPanel } from "../../components/WarehouseScannerPanel";

export const metadata: Metadata = {
  title: "Warehouse Operations | DriveMate Parts",
  robots: {
    index: false,
    follow: false,
  },
};

export default function WarehousePage() {
  return (
    <main className="page-main">
      <p className="eyebrow">Warehouse operations</p>
      <h1>Scan-based receiving and dispatch</h1>
      <RoleGate expectedRole="warehouse">
        <WarehouseScannerPanel />
      </RoleGate>
    </main>
  );
}
