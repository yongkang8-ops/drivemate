import type { Metadata } from "next";
import { AdminDashboard } from "../../components/AdminDashboard";
import { RoleGate } from "../../components/RoleGate";
import { PurchaseImportPanel } from "../../components/PurchaseImportPanel";
import { AdminOperationsPanel } from "../../components/AdminOperationsPanel";

export const metadata: Metadata = {
  title: "Admin Backend | DriveMate Parts",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPage() {
  return (
    <main className="page-main internal-page">
      <div className="workspace-header"><div><p className="eyebrow">Administration</p><h1>Control purchasing, release gates and trade operations.</h1><p>Costs and compliance evidence remain restricted to authorised staff.</p></div></div>
      <RoleGate expectedRole="admin">
        <>
          <nav className="internal-tabs" aria-label="Admin modules"><a href="/partner">Dashboard</a><a href="#overview">Overview</a><a href="#purchasing">Purchasing</a><a href="#products">Products</a><a href="/inventory">Inventory</a><a href="#orders">Orders</a><a href="#accounts">Accounts</a><a href="#compliance">Compliance</a><a href="#pricing">Pricing</a><a href="#reports">Reports</a><a href="/admin/staff">Staff</a></nav>
          <PurchaseImportPanel /><AdminOperationsPanel /><AdminDashboard />
        </>
      </RoleGate>
    </main>
  );
}
