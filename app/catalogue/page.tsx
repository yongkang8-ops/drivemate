import type { Metadata } from "next";
import { CatalogueBrowser } from "../../components/CatalogueBrowser";

export const metadata: Metadata = {
  title: "Parts Catalogue",
  description: "Browse released DriveMate parts by Part Number, vehicle and engine.",
};

export default async function CataloguePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  return (
    <main className="page-main catalogue-page">
      <div className="workspace-header">
        <div><p className="eyebrow">Released catalogue</p><h1>Find the part for the job.</h1><p>Public results show released fitment and availability. Sign in for stock quantity and trade pricing.</p></div>
      </div>
      <CatalogueBrowser initialQuery={q} />
    </main>
  );
}
