import type { Metadata } from "next";
import { RoleGate } from "../../components/RoleGate";
import { TradePortalWorkspace } from "../../components/TradePortalWorkspace";

export const metadata: Metadata = {
  title: "Trade Portal | DriveMate Parts",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PortalPage() {
  return (
    <main className="page-main">
      <p className="eyebrow">Trade portal</p>
      <h1>Workshop lookup, quote and order workspace</h1>
      <RoleGate expectedRole="trade">
        <TradePortalWorkspace />
      </RoleGate>
    </main>
  );
}
