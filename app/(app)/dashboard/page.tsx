import { createClient } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";
import type { Profile, Team } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const [{ data: profiles }, { data: teams }] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("teams").select("*").order("id"),
  ]);

  return (
    <Dashboard
      initialProfiles={(profiles as Profile[]) ?? []}
      teams={(teams as Team[]) ?? []}
    />
  );
}
