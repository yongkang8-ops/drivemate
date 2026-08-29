import type { Metadata } from "next";
import { PrearrivalShipmentPanel } from "../../components/PrearrivalShipmentPanel";
import { RoleGate } from "../../components/RoleGate";

export const metadata: Metadata = {
  title: "Pre-arrival shipments",
  robots: { index: false, follow: false },
};

export default function PrearrivalPage() {
  return <RoleGate expectedRole="partner"><PrearrivalShipmentPanel /></RoleGate>;
}
