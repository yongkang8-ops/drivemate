import type { Metadata } from "next";
import { PartnerDashboard } from "../../components/PartnerDashboard";
import { RoleGate } from "../../components/RoleGate";

export const metadata: Metadata = {
  title: "Operations Dashboard | DriveMate Parts",
  robots: { index: false, follow: false },
};

export default function PartnerDashboardPage() {
  return (
    <RoleGate expectedRole="partner">
      <>
        <nav className="internal-tabs" aria-label="Partner modules">
          <a href="/partner">Operations dashboard</a>
          <a href="/admin/staff">Staff</a>
        </nav>
        <PartnerDashboard />
      </>
    </RoleGate>
  );
}
