import { createClient } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";
import MyRoleCard from "@/components/MyRoleCard";
import MyProfileCard from "@/components/MyProfileCard";
import EnableNotifications from "@/components/EnableNotifications";
import PenaltyHistoryCard from "@/components/PenaltyHistoryCard";
import type {
  PenaltyPick,
  PlayerRole,
  PublicProfile,
  Team,
  TeamTotal,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 개인 잔액은 비공개 → 이름/팀은 list_public_profiles, 팀 점수는 team_totals 로.
  const [
    { data: profiles },
    { data: teams },
    { data: totals },
    { data: myRole },
    { data: picksRaw },
  ] = await Promise.all([
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
    supabase
      .from("penalty_picks")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  const role = myRole as PlayerRole | null;
  const roster = (profiles as PublicProfile[]) ?? [];
  const me = roster.find((p) => p.id === user?.id);
  const myTeam = ((teams as Team[]) ?? []).find((t) => t.id === me?.team_id);

  // 역할 능력(도둑 훔치기 등) 대상 목록 — 본인·관리자·봇 제외.
  const roleTargets = roster
    .filter((p) => p.id !== user?.id && p.role === "player" && !p.is_bot)
    .map((p) => ({ id: p.id, name: p.display_name }));

  // 벌칙 이력 — 표시용 이름/아바타를 공개 로스터에서 조인.
  const nameOf = new Map(roster.map((p) => [p.id, p]));
  const penaltyPicks: PenaltyPick[] = ((picksRaw as PenaltyPick[]) ?? []).map(
    (pk) => {
      const p = nameOf.get(pk.user_id);
      return {
        ...pk,
        display_name: p?.display_name ?? "?",
        avatar_url: p?.avatar_url ?? null,
      };
    }
  );

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
          targets={roleTargets}
        />
      )}
      <Dashboard
        initialProfiles={roster}
        teams={(teams as Team[]) ?? []}
        initialTotals={(totals as TeamTotal[]) ?? []}
      />
      <PenaltyHistoryCard picks={penaltyPicks} />
      <EnableNotifications />
    </div>
  );
}
