import type { Metadata } from "next";
import { RoleGate } from "../../../components/RoleGate";
import { StaffManagementPage } from "../../../components/staff/StaffManagementPage";

export const metadata: Metadata = {
  title: "Staff Management | DriveMate Parts",
  robots: { index: false, follow: false },
};

export default function StaffManagementRoute() {
  return (
    <main className="staff-management-route">
      <RoleGate expectedRole="partner">
        <StaffManagementPage />
      </RoleGate>
    </main>
  );
}
