import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { SignIn, UserPlus } from "@phosphor-icons/react/dist/ssr";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://drivemateparts.com.au"),
  title: { default: "DriveMate Parts", template: "%s | DriveMate Parts" },
  description: "Trade parts supply for Chinese-brand vehicles, supporting Australian workshops from Brisbane.",
};

const publicNavItems = [
  { href: "/catalogue", label: "Catalogue" },
  { href: "/#delivery", label: "Delivery" },
  { href: "/#support", label: "Account Support" },
];

const internalNavItems = [
  { href: "/warehouse", label: "Warehouse" },
  { href: "/admin", label: "Admin" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const showInternalNav = process.env.NEXT_PUBLIC_SHOW_INTERNAL_NAV === "true" || process.env.NODE_ENV !== "production";
  return (
    <html lang="en">
      <body className={`${geist.variable} ${geistMono.variable}`}>
        <div className="site-shell">
          <header className="site-header">
            <Link className="brand" href="/">
              <img className="brand-logo" src="/assets/brand/DriveMate_Parts_Primary_Lockup_v2.0.svg" alt="DriveMate Parts" />
            </Link>
            <nav className="site-nav" aria-label="Main navigation">
              {publicNavItems.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
              {showInternalNav && internalNavItems.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
            </nav>
            <div className="account-actions" aria-label="Trade account actions">
              <Link className="button button-secondary" href="/portal"><SignIn size={18} weight="bold" />Trade Login</Link>
              <Link className="button button-primary" href="/open-account"><UserPlus size={18} weight="bold" />Open Trade Account</Link>
            </div>
          </header>
          {children}
          <footer className="site-footer">
            <div>
              <Link className="brand footer-brand" href="/"><img className="brand-logo" src="/assets/brand/DriveMate_Parts_Primary_Lockup_v2.0.svg" alt="DriveMate Parts" /></Link>
              <p>Trade parts supply for Australian workshops, dispatched from Brisbane.</p>
              <p>DriveMate Parts is operated by DRIVER MATE PTY LTD | ABN 66 701 612 768.</p>
            </div>
            <nav aria-label="Legal information">
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Website Terms</Link>
              <Link href="/trade-terms">Trade Terms</Link>
              <Link href="/delivery-returns-warranty">Delivery, Returns &amp; Warranty</Link>
            </nav>
          </footer>
        </div>
      </body>
    </html>
  );
}
