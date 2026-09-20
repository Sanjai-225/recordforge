import { redirect } from "next/navigation";
import { authenticated } from "@/lib/supabase/server";
import { ParticipantDashboard } from "@/components/participant-dashboard";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  try {
    await authenticated();
  } catch {
    redirect("/login");
  }
  return <ParticipantDashboard />;
}
