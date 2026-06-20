import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import AdminPanel from "@/components/AdminPanel";
import type { Profile, Team } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: players }, { data: teams }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "player")
      .order("display_name"),
    supabase.from("teams").select("*").order("id"),
  ]);

  return (
    <AdminPanel
      players={(players as Profile[]) ?? []}
      teams={(teams as Team[]) ?? []}
    />
  );
}
