import type { Metadata } from "next";
import { RoleGate } from "../../components/RoleGate";
import { TradePortalWorkspace } from "../../components/TradePortalWorkspace";
import { getTradingGate } from "../../lib/tradingGate";

export const metadata: Metadata = {
  title: "Trade Portal | DriveMate Parts",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PortalPage() {
  const tradingEnabled = getTradingGate().enabled;

  return (
    <main className="page-main internal-page">
      <div className="workspace-header"><div><p className="eyebrow">Trade portal</p><h1>Parts, vehicles and orders in one workspace.</h1><p>Use an approved VIN for exact lookup, or send an unknown vehicle for manual review.</p></div></div>
      <nav className="internal-tabs" aria-label="Trade workspace"><a href="#lookup">Vehicle &amp; Parts</a><a href="#orders">Orders</a><a href="#documents">Documents</a></nav>
      <RoleGate expectedRole="trade">
        <TradePortalWorkspace tradingEnabled={tradingEnabled} />
      </RoleGate>
    </main>
  );
}
