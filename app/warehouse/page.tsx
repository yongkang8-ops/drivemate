import type { Metadata } from "next";
import { RoleGate } from "../../components/RoleGate";
import { PartnerInboundWorkspace } from "../../components/PartnerInboundWorkspace";

export const metadata: Metadata = {
  title: "Warehouse Operations | DriveMate Parts",
  robots: {
    index: false,
    follow: false,
  },
};

export default function WarehousePage() {
  return (
    <RoleGate expectedRole="partner"><PartnerInboundWorkspace /></RoleGate>
  );
}
