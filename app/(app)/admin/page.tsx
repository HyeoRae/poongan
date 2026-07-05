import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import AdminPanel from "@/components/AdminPanel";
import type {
  Profile,
  Team,
  Game,
  BetOption,
  Bet,
  AdminGameView,
  PenaltyPick,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: players }, { data: grantTargetsRaw }, { data: teams }, { data: settings }, { data: gamesRaw }, { data: schedRaw }, { data: picksRaw }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("role", "player")
        .order("display_name"),
      // 지급 대상: 관리자 포함 전원 (관리자 → 참가자 순)
      supabase
        .from("profiles")
        .select("*")
        .order("role")
        .order("display_name"),
      supabase.from("teams").select("*").order("id"),
      supabase.from("app_settings").select("is_public").eq("id", 1).single(),
      supabase
        .from("games")
        .select("*")
        .eq("type", "pool")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false }),
      supabase
        .from("schedule")
        .select("id, day, title")
        .order("day")
        .order("sort_order"),
      supabase
        .from("penalty_picks")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

  const games = (gamesRaw as Game[]) ?? [];
  const gameIds = games.map((g) => g.id);
  const schedule = (schedRaw as { id: number; day: number; title: string }[]) ?? [];
  const schedTitle = new Map(schedule.map((s) => [s.id, s.title]));

  const [{ data: optsRaw }, { data: betsRaw }] = await Promise.all([
    supabase
      .from("bet_options")
      .select("*")
      .in("game_id", gameIds.length ? gameIds : [-1])
      .order("sort_order"),
    supabase
      .from("bets")
      .select("game_id, option_id, amount")
      .in("game_id", gameIds.length ? gameIds : [-1]),
  ]);

  const options = (optsRaw as BetOption[]) ?? [];
  const bets = (betsRaw as Pick<Bet, "game_id" | "option_id" | "amount">[]) ?? [];

  const gameViews: AdminGameView[] = games.map((g) => {
    const gBets = bets.filter((b) => b.game_id === g.id);
    return {
      ...g,
      schedule_title: g.schedule_id ? schedTitle.get(g.schedule_id) ?? null : null,
      options: options
        .filter((o) => o.game_id === g.id)
        .map((o) => ({
          ...o,
          pot: gBets
            .filter((b) => b.option_id === o.id)
            .reduce((s, b) => s + b.amount, 0),
        })),
      total_pot: gBets.reduce((s, b) => s + b.amount, 0),
      bet_count: gBets.length,
    };
  });

  const playerList = (players as Profile[]) ?? [];
  const nameOf = new Map(playerList.map((p) => [p.id, p]));
  const penaltyPicks: PenaltyPick[] = (
    (picksRaw as PenaltyPick[]) ?? []
  ).map((pk) => {
    const p = nameOf.get(pk.user_id);
    return {
      ...pk,
      display_name: p?.display_name ?? "?",
      avatar_url: p?.avatar_url ?? null,
    };
  });

  return (
    <AdminPanel
      players={playerList}
      grantTargets={(grantTargetsRaw as Profile[]) ?? []}
      teams={(teams as Team[]) ?? []}
      isPublic={settings?.is_public ?? false}
      games={gameViews}
      schedule={schedule}
      penaltyPicks={penaltyPicks}
    />
  );
}
