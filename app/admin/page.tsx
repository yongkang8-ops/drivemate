import type { Metadata } from "next";
import { AdminDashboard } from "../../components/AdminDashboard";
import { RoleGate } from "../../components/RoleGate";

export const metadata: Metadata = {
  title: "Admin Backend | DriveMate Parts",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPage() {
  return (
    <main className="page-main">
      <p className="eyebrow">Admin backend</p>
      <h1>SKU, inventory and operating queues</h1>
      <RoleGate expectedRole="admin">
        <AdminDashboard />
      </RoleGate>
    </main>
  );
}
