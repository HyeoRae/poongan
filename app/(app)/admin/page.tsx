import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import AdminPanel from "@/components/AdminPanel";
import type { Profile, Team } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: players }, { data: teams }, { data: settings }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("role", "player")
        .order("display_name"),
      supabase.from("teams").select("*").order("id"),
      supabase.from("app_settings").select("is_public").eq("id", 1).single(),
    ]);

  return (
    <AdminPanel
      players={(players as Profile[]) ?? []}
      teams={(teams as Team[]) ?? []}
      isPublic={settings?.is_public ?? false}
    />
  );
}
