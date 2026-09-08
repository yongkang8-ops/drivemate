import type { Metadata } from "next";
import { AdministrationWorkspace } from "../../components/AdministrationWorkspace";
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
      <RoleGate expectedRole="admin">
        <AdministrationWorkspace />
      </RoleGate>
  );
}
