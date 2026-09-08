"use client";

import Link from "./StableLink";
import { useWorkspaceRole } from "./RoleGate";

export function WorkspaceNavigation({ current, shipmentId, className = "", label = "Workspace navigation" }: {
  current: string; shipmentId?: string; className?: string; label?: string;
}) {
  const role = useWorkspaceRole();
  const elevated = role === "admin" || role === "partner";
  const context = shipmentId ? `?shipmentId=${encodeURIComponent(shipmentId)}` : "";
  const links = [
    ...(elevated ? [{ href: "/partner", label: "Dashboard" }, { href: `/prearrival${context}`, label: "Pre-arrival shipments" }] : []),
    { href: `/warehouse${context}`, label: "Inbound operations" },
    ...(elevated ? [{ href: "/inventory", label: "Inventory & locations" }, { href: "/admin/staff", label: "Staff management" }] : []),
    ...(role === "admin" ? [{ href: "/admin", label: "Administration" }] : []),
    { href: "/", label: "Public website" },
  ];
  return <nav className={`workspace-navigation ${className}`} aria-label={label}>
    <span>Workspace</span>
    {links.map(link => <Link key={link.href} href={link.href} aria-current={link.href.split("?")[0] === current ? "page" : undefined} className={link.href.split("?")[0] === current ? "is-active" : undefined}>{link.label}</Link>)}
  </nav>;
}
