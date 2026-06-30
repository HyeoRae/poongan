"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { playCoinflip, playDice, playRoulette } from "@/app/(app)/gamble/actions";
import Spinner from "@/components/Spinner";

export default function Gamble({ initialGold }: { initialGold: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [bet, setBet] = useState("");
  const [log, setLog] = useState<string | null>(null);
  const [flash, setFlash] = useState<"win" | "lose" | null>(null);
  const [active, setActive] = useState<string | null>(null);

  function done(win: boolean | undefined, text: string) {
    setLog(text);
    setFlash(win ? "win" : "lose");
    setActive(null);
    router.refresh();
  }

  function coin(choice: "front" | "back") {
    setLog(null);
    setActive(`coin-${choice}`);
    startTransition(async () => {
      const r = await playCoinflip(Number(bet), choice);
      if (!r.ok) return done(undefined, r.message ?? "오류");
      const face = r.outcome === "front" ? "앞면" : "뒷면";
      done(r.win, `🪙 결과: ${face} → ${r.win ? "🎉 당첨!" : "💸 꽝"} (잔액 ${r.balance?.toLocaleString()})`);
    });
  }

  function dice(guess: number) {
    setLog(null);
    setActive(`dice-${guess}`);
    startTransition(async () => {
      const r = await playDice(Number(bet), guess);
      if (!r.ok) return done(undefined, r.message ?? "오류");
      done(r.win, `🎲 결과: ${r.roll} → ${r.win ? "🎉 6배 당첨!" : "💸 꽝"} (잔액 ${r.balance?.toLocaleString()})`);
    });
  }

  function roulette(choice: string, labelOf: string) {
    setLog(null);
    setActive(`roul-${choice}`);
    startTransition(async () => {
      const r = await playRoulette(Number(bet), choice);
      if (!r.ok) return done(undefined, r.message ?? "오류");
      done(
        r.win,
        `🎡 결과: ${r.roll} (${labelOf}) → ${r.win ? `🎉 ${r.mult}배 당첨!` : "💸 꽝"} (잔액 ${r.balance?.toLocaleString()})`
      );
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black">🎰 풍산 카지노</h1>
      <p className="text-xs text-white/50">베팅액을 정하고 게임을 선택하세요.</p>

      {/* 섯다 입장 */}
      <Link
        href="/sutda"
        className="flex items-center justify-between rounded-2xl border border-gold/40 bg-gradient-to-r from-gold/15 to-transparent p-4"
      >
        <div>
          <div className="font-black">🃏 섯다 (실시간 대전)</div>
          <div className="text-xs text-white/50">참가자끼리 풍산토큰 걸고 맞짱!</div>
        </div>
        <span className="text-gold">→</span>
      </Link>

      <input
        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base outline-none focus:border-gold"
        type="number"
        min={1}
        placeholder="베팅 풍산토큰"
        value={bet}
        onChange={(e) => setBet(e.target.value)}
      />

      {log && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${
            flash === "win"
              ? "border border-green-500/40 bg-green-500/10 text-green-300"
              : flash === "lose"
              ? "border border-red-500/40 bg-red-500/10 text-red-300"
              : "border border-border bg-card text-white/70"
          }`}
        >
          {log}
        </div>
      )}

      {/* 동전던지기 */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-1 font-bold">🪙 동전던지기</h2>
        <p className="mb-3 text-xs text-white/50">적중 시 2배 (50%)</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={pending}
            onClick={() => coin("front")}
            className="flex items-center justify-center gap-2 rounded-xl bg-gold py-3 font-bold text-black disabled:opacity-50"
          >
            {active === "coin-front" && <Spinner />}
            앞면
          </button>
          <button
            disabled={pending}
            onClick={() => coin("back")}
            className="flex items-center justify-center gap-2 rounded-xl border border-gold py-3 font-bold text-gold disabled:opacity-50"
          >
            {active === "coin-back" && <Spinner />}
            뒷면
          </button>
        </div>
      </section>

      {/* 주사위 */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-1 font-bold">🎲 주사위 맞히기</h2>
        <p className="mb-3 text-xs text-white/50">적중 시 6배 (1/6)</p>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              disabled={pending}
              onClick={() => dice(n)}
              className="flex items-center justify-center gap-2 rounded-xl border border-border py-3 text-lg font-bold disabled:opacity-50 hover:border-gold"
            >
              {active === `dice-${n}` && <Spinner />}
              {n}
            </button>
          ))}
        </div>
      </section>

      {/* 룰렛 */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-1 font-bold">🎡 룰렛 (1~10)</h2>
        <p className="mb-3 text-xs text-white/50">
          짝/홀·언더/오버는 2배, 숫자 적중은 10배!
        </p>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <button
            disabled={pending}
            onClick={() => roulette("low", "1-5")}
            className="flex items-center justify-center gap-2 rounded-xl border border-gold py-2.5 text-sm font-bold text-gold disabled:opacity-50"
          >
            {active === "roul-low" && <Spinner />}
            언더 1-5 (2배)
          </button>
          <button
            disabled={pending}
            onClick={() => roulette("high", "6-10")}
            className="flex items-center justify-center gap-2 rounded-xl border border-gold py-2.5 text-sm font-bold text-gold disabled:opacity-50"
          >
            {active === "roul-high" && <Spinner />}
            오버 6-10 (2배)
          </button>
          <button
            disabled={pending}
            onClick={() => roulette("odd", "홀")}
            className="flex items-center justify-center gap-2 rounded-xl border border-gold py-2.5 text-sm font-bold text-gold disabled:opacity-50"
          >
            {active === "roul-odd" && <Spinner />}
            홀 (2배)
          </button>
          <button
            disabled={pending}
            onClick={() => roulette("even", "짝")}
            className="flex items-center justify-center gap-2 rounded-xl border border-gold py-2.5 text-sm font-bold text-gold disabled:opacity-50"
          >
            {active === "roul-even" && <Spinner />}
            짝 (2배)
          </button>
        </div>
        <p className="mb-2 text-[11px] text-white/40">숫자 적중 (10배)</p>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              disabled={pending}
              onClick={() => roulette(String(n), String(n))}
              className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 font-bold disabled:opacity-50 hover:border-gold"
            >
              {active === `roul-${n}` && <Spinner />}
              {n}
            </button>
          ))}
        </div>
      </section>

      <p className="text-center text-[11px] text-white/30">
        도박은 재미로! 풍산토큰는 잃을 수 있습니다 😈
      </p>
    </div>
  );
}
