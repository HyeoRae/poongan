import { createClient } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";
import MyRoleCard from "@/components/MyRoleCard";
import MyProfileCard from "@/components/MyProfileCard";
import EnableNotifications from "@/components/EnableNotifications";
import type { PlayerRole, Profile, Team } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profiles }, { data: teams }, { data: myRole }] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("teams").select("*").order("id"),
    user
      ? supabase
          .from("player_roles")
          .select("user_id, role, revealed")
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const role = myRole as PlayerRole | null;
  const me = ((profiles as Profile[]) ?? []).find((p) => p.id === user?.id);
  const myTeam = ((teams as Team[]) ?? []).find((t) => t.id === me?.team_id);

  return (
    <div className="space-y-5">
      {me && (
        <MyProfileCard
          userId={me.id}
          displayName={me.display_name}
          avatarUrl={me.avatar_url}
          teamColor={myTeam?.color}
        />
      )}
      {role && <MyRoleCard role={role.role} teamColor={myTeam?.color} />}
      <Dashboard
        initialProfiles={(profiles as Profile[]) ?? []}
        teams={(teams as Team[]) ?? []}
      />
      <EnableNotifications />
    </div>
  );
}
