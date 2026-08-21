import type { Metadata } from "next";
import { PasswordSetupForm } from "../../components/PasswordSetupForm";
export const metadata: Metadata = { title: "Password Setup", robots: { index: false, follow: false } };
export default function PasswordSetupPage() { return <main className="page-main narrow-page"><p className="eyebrow">Account security</p><h1>Set your DriveMate password.</h1><PasswordSetupForm /></main>; }
