import { redirect } from "next/navigation";
import { authenticated } from "@/lib/supabase/server";
import { DeveloperDashboard } from "@/components/developer-dashboard";
export const dynamic = "force-dynamic";
export default async function Developer({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; q?: string }>;
}) {
  try {
    await authenticated(true);
  } catch {
    redirect("/developer/login");
  }
  const q = await searchParams;
  return (
    <DeveloperDashboard
      key={`${q.section}-${q.q}`}
      section={q.section || "overview"}
      initialQuery={q.q}
    />
  );
}
