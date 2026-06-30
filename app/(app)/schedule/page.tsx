import { createClient } from "@/lib/supabase/server";
import type { ScheduleItem, Game, ScheduleGameBadge } from "@/lib/types";
import ScheduleTimeline from "@/components/ScheduleTimeline";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const supabase = await createClient();
  const [{ data }, { data: gamesRaw }] = await Promise.all([
    supabase.from("schedule").select("*").order("day").order("sort_order"),
    supabase
      .from("games")
      .select("*")
      .eq("type", "pool")
      .not("schedule_id", "is", null)
      .in("status", ["open", "locked", "settled"]),
  ]);

  const items = (data as ScheduleItem[]) ?? [];
  const games = (gamesRaw as Game[]) ?? [];

  // 정산된 게임의 우승 선택지 라벨 조회
  const winnerIds = games
    .filter((g) => g.status === "settled" && g.result)
    .map((g) => g.result!.winning_option);
  const winnerLabels = new Map<number, string>();
  if (winnerIds.length) {
    const { data: opts } = await supabase
      .from("bet_options")
      .select("id, label")
      .in("id", winnerIds);
    ((opts as { id: number; label: string }[]) ?? []).forEach((o) =>
      winnerLabels.set(o.id, o.label)
    );
  }

  const gameBadges: ScheduleGameBadge[] = games.map((g) => ({
    schedule_id: g.schedule_id as number,
    title: g.title,
    status: g.status,
    winner_label:
      g.status === "settled" && g.result
        ? winnerLabels.get(g.result.winning_option) ?? null
        : null,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black">🗓️ 여행 일정</h1>

      {items.length === 0 ? (
        <p className="text-sm text-white/50">아직 등록된 일정이 없습니다.</p>
      ) : (
        <ScheduleTimeline items={items} games={gameBadges} />
      )}
    </div>
  );
}
