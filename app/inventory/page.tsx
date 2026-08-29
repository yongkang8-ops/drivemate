import type { Metadata } from "next";
import { InventoryLocationPanel } from "../../components/InventoryLocationPanel";
import { RoleGate } from "../../components/RoleGate";

export const metadata: Metadata = {
  title: "Location Management | DriveMate Parts",
  robots: {
    index: false,
    follow: false,
  },
};

export default function InventoryLocationPage() {
  return (
    <RoleGate expectedRole="partner">
      <InventoryLocationPanel />
    </RoleGate>
  );
}
