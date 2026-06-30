import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Game,
  BetOption,
  Bet,
  PoolGameView,
  PoolOptionView,
} from "@/lib/types";
import Games from "@/components/Games";

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  const me = await requireProfile();
  const supabase = await createClient();

  // 진행/정산된 팟배팅 게임 (draft·cancelled 제외)
  const { data: gamesRaw } = await supabase
    .from("games")
    .select("*")
    .eq("type", "pool")
    .in("status", ["open", "locked", "settled"])
    .order("created_at", { ascending: false });

  const games = (gamesRaw as Game[]) ?? [];
  const ids = games.map((g) => g.id);

  const [{ data: optsRaw }, { data: betsRaw }, { data: schedRaw }] =
    await Promise.all([
      supabase
        .from("bet_options")
        .select("*")
        .in("game_id", ids.length ? ids : [-1])
        .order("sort_order"),
      supabase
        .from("bets")
        .select("*")
        .in("game_id", ids.length ? ids : [-1]),
      supabase.from("schedule").select("id, title"),
    ]);

  const options = (optsRaw as BetOption[]) ?? [];
  const bets = (betsRaw as Bet[]) ?? [];
  const schedMap = new Map<number, string>(
    ((schedRaw as { id: number; title: string }[]) ?? []).map((s) => [
      s.id,
      s.title,
    ])
  );

  const views: PoolGameView[] = games.map((g) => {
    const gOpts = options.filter((o) => o.game_id === g.id);
    const gBets = bets.filter((b) => b.game_id === g.id);

    const optViews: PoolOptionView[] = gOpts.map((o) => ({
      ...o,
      pot: gBets
        .filter((b) => b.option_id === o.id)
        .reduce((s, b) => s + b.amount, 0),
      my_amount: gBets
        .filter((b) => b.option_id === o.id && b.user_id === me.id)
        .reduce((s, b) => s + b.amount, 0),
    }));

    const myBets = gBets.filter((b) => b.user_id === me.id);

    return {
      ...g,
      schedule_title: g.schedule_id ? schedMap.get(g.schedule_id) ?? null : null,
      options: optViews,
      total_pot: gBets.reduce((s, b) => s + b.amount, 0),
      my_total: myBets.reduce((s, b) => s + b.amount, 0),
      my_payout: myBets.reduce((s, b) => s + b.payout, 0),
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black">🎮 미니게임</h1>
      <p className="text-xs text-white/50">
        일정마다 열리는 예측 배팅! 적중하면 모인 팟을 베팅한 만큼 나눠 갖습니다.
      </p>
      <Games initialGames={views} />
    </div>
  );
}
