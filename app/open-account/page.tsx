import type { Metadata } from "next";
import { TradeAccountApplicationForm } from "../../components/TradeAccountApplicationForm";

export const metadata: Metadata = { title: "Open Trade Account", description: "Apply for a DriveMate workshop trade account." };
export default function OpenAccountPage() { return <main className="page-main account-page"><div className="workspace-header"><div><p className="eyebrow">Workshop application</p><h1>Open a DriveMate trade account.</h1><p>Provide the business and primary contact details used for account approval. Login setup is sent by email after review.</p></div></div><TradeAccountApplicationForm /></main>; }
