import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "DriveMate Parts",
  description: "Trade parts supply portal for Chinese-brand vehicles in Australia.",
};

const publicNavItems = [
  { href: "/", label: "Parts Lookup" },
  { href: "/catalogue", label: "Catalogue" },
  { href: "/portal", label: "Trade Portal" },
];

const internalNavItems = [
  { href: "/warehouse", label: "Warehouse" },
  { href: "/admin", label: "Admin" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const showInternalNav =
    process.env.NEXT_PUBLIC_SHOW_INTERNAL_NAV === "true" || process.env.NODE_ENV !== "production";
  const navItems = showInternalNav ? [...publicNavItems, ...internalNavItems] : publicNavItems;

  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <header className="site-header">
            <Link className="brand" href="/" aria-label="DriveMate Parts home">
              <span className="brand-mark">DM</span>
              <span>
                DriveMate Parts
                <small>Trade supply portal</small>
              </span>
            </Link>
            <nav className="site-nav" aria-label="Main navigation">
              {navItems.map((item) => (
                <Link href={item.href} key={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="account-actions" aria-label="Trade account actions">
              <Link href="/portal">Trade Login</Link>
              <Link href="/#open-account">Open Trade Account</Link>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
