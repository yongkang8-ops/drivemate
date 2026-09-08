import type { Metadata } from "next";
import { StaffLoginPanel } from "../../../components/StaffLoginPanel";

export const metadata: Metadata = {
  title: "Staff login",
  robots: { index: false, follow: false },
};

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;
  return (
    <main className="page-main narrow-page">
      <p className="eyebrow">DriveMate workspace</p>
      <h1>Sign in to your workspace.</h1>
      <StaffLoginPanel next={next} />
    </main>
  );
}
