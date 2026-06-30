"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placeBet } from "@/app/(app)/games/actions";
import { useGamesRealtime } from "@/lib/hooks";
import type { PoolGameView } from "@/lib/types";

const STATUS_META: Record<
  string,
  { label: string; cls: string }
> = {
  open: { label: "🟢 베팅 진행 중", cls: "bg-green-500/20 text-green-300" },
  locked: { label: "🔒 정산 대기", cls: "bg-yellow-500/20 text-yellow-300" },
  settled: { label: "🏆 종료", cls: "bg-white/10 text-white/60" },
};

export default function Games({
  initialGames,
}: {
  initialGames: PoolGameView[];
}) {
  const router = useRouter();
  useGamesRealtime(() => router.refresh());

  if (initialGames.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-white/50">
        아직 열린 게임이 없어요. 일정이 시작되면 관리자가 배팅을 엽니다 🎣
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {initialGames.map((g) => (
        <GameCard key={g.id} game={g} />
      ))}
    </div>
  );
}

function GameCard({ game }: { game: PoolGameView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<number | null>(null);
  const [bet, setBet] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const status = STATUS_META[game.status] ?? STATUS_META.settled;
  const winningId =
    game.status === "settled" ? game.result?.winning_option ?? null : null;
  const winnerLabel =
    winningId != null
      ? game.options.find((o) => o.id === winningId)?.label ?? "?"
      : null;
  const myProfit = game.my_payout - game.my_total;
  const description = (game.config?.description as string) ?? null;

  function submit() {
    if (selected == null) {
      setMsg("선택지를 먼저 골라주세요.");
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const r = await placeBet(game.id, selected, Number(bet));
      setMsg(r.message);
      if (r.ok) {
        setBet("");
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">{game.title}</h2>
          {game.schedule_title && (
            <p className="text-xs text-white/40">🗓️ {game.schedule_title}</p>
          )}
          {description && (
            <p className="mt-0.5 text-xs text-white/60">{description}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${status.cls}`}
        >
          {status.label}
        </span>
      </div>

      <div className="text-xs text-white/50">
        총 팟 <b className="text-gold">🪙{game.total_pot.toLocaleString()}</b>
        {game.my_total > 0 && (
          <> · 내 베팅 🪙{game.my_total.toLocaleString()}</>
        )}
      </div>

      {/* 선택지 + 팟 비율 막대 */}
      <div className="space-y-2">
        {game.options.map((o) => {
          const ratio =
            game.total_pot > 0 ? (o.pot / game.total_pot) * 100 : 0;
          const isWinner = o.id === winningId;
          const canBet = game.status === "open";
          const active = selected === o.id;
          return (
            <button
              key={o.id}
              disabled={!canBet || pending}
              onClick={() => canBet && setSelected(o.id)}
              className={`relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left transition-colors ${
                isWinner
                  ? "border-gold bg-gold/10"
                  : active
                    ? "border-gold"
                    : "border-border"
              } ${canBet ? "hover:border-gold/60" : "cursor-default"} disabled:opacity-100`}
            >
              <span
                className="absolute inset-y-0 left-0 bg-gold/10"
                style={{ width: `${ratio}%` }}
              />
              <span className="relative flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold">
                  {isWinner && "👑 "}
                  {o.label}
                </span>
                <span className="text-xs text-white/50">
                  🪙{o.pot.toLocaleString()}
                  {o.my_amount > 0 && (
                    <span className="ml-1 text-gold">
                      (내 {o.my_amount.toLocaleString()})
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 베팅 폼 */}
      {game.status === "open" && (
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            type="number"
            min={1}
            placeholder="베팅 풍산토큰"
            value={bet}
            onChange={(e) => setBet(e.target.value)}
          />
          <button
            disabled={pending}
            onClick={submit}
            className="shrink-0 rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-black disabled:opacity-50"
          >
            베팅
          </button>
        </div>
      )}

      {/* 정산 결과 */}
      {game.status === "settled" && (
        <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
          <span className="text-white/70">🏆 우승: </span>
          <b className="text-gold">{winnerLabel}</b>
          {game.my_total > 0 && (
            <span
              className={`ml-2 font-bold ${
                myProfit > 0
                  ? "text-green-300"
                  : myProfit < 0
                    ? "text-red-300"
                    : "text-white/60"
              }`}
            >
              {myProfit > 0 ? "🎉 +" : ""}
              {myProfit.toLocaleString()} 풍산토큰
            </span>
          )}
        </div>
      )}

      {msg && <p className="text-xs text-white/60">{msg}</p>}
    </section>
  );
}
