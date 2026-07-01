import { createClient } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";
import MyRoleCard from "@/components/MyRoleCard";
import MyProfileCard from "@/components/MyProfileCard";
import EnableNotifications from "@/components/EnableNotifications";
import type { PlayerRole, PublicProfile, Team, TeamTotal } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 개인 잔액은 비공개 → 이름/팀은 list_public_profiles, 팀 점수는 team_totals 로.
  const [{ data: profiles }, { data: teams }, { data: totals }, { data: myRole }] =
    await Promise.all([
      supabase.rpc("list_public_profiles"),
      supabase.from("teams").select("*").order("id"),
      supabase.from("team_totals").select("*"),
      user
        ? supabase
            .from("player_roles")
            .select("user_id, role, revealed")
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const role = myRole as PlayerRole | null;
  const roster = (profiles as PublicProfile[]) ?? [];
  const me = roster.find((p) => p.id === user?.id);
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
      {role && (
        <MyRoleCard
          role={role.role}
          teamColor={myTeam?.color}
          teamName={myTeam?.name}
        />
      )}
      <Dashboard
        initialProfiles={roster}
        teams={(teams as Team[]) ?? []}
        initialTotals={(totals as TeamTotal[]) ?? []}
      />
      <EnableNotifications />
    </div>
  );
}
