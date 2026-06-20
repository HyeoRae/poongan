"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { playCoinflip, playDice } from "@/app/(app)/gamble/actions";

export default function Gamble({ initialGold }: { initialGold: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [bet, setBet] = useState("");
  const [log, setLog] = useState<string | null>(null);
  const [flash, setFlash] = useState<"win" | "lose" | null>(null);

  function done(win: boolean | undefined, text: string) {
    setLog(text);
    setFlash(win ? "win" : "lose");
    router.refresh();
  }

  function coin(choice: "front" | "back") {
    setLog(null);
    startTransition(async () => {
      const r = await playCoinflip(Number(bet), choice);
      if (!r.ok) return done(undefined, r.message ?? "오류");
      const face = r.outcome === "front" ? "앞면" : "뒷면";
      done(r.win, `🪙 결과: ${face} → ${r.win ? "🎉 당첨!" : "💸 꽝"} (잔액 ${r.balance?.toLocaleString()})`);
    });
  }

  function dice(guess: number) {
    setLog(null);
    startTransition(async () => {
      const r = await playDice(Number(bet), guess);
      if (!r.ok) return done(undefined, r.message ?? "오류");
      done(r.win, `🎲 결과: ${r.roll} → ${r.win ? "🎉 6배 당첨!" : "💸 꽝"} (잔액 ${r.balance?.toLocaleString()})`);
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black">🎰 풍산 카지노</h1>
      <p className="text-xs text-white/50">베팅액을 정하고 게임을 선택하세요.</p>

      <input
        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base outline-none focus:border-gold"
        type="number"
        min={1}
        placeholder="베팅 골드"
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
            className="rounded-xl bg-gold py-3 font-bold text-black disabled:opacity-50"
          >
            앞면
          </button>
          <button
            disabled={pending}
            onClick={() => coin("back")}
            className="rounded-xl border border-gold py-3 font-bold text-gold disabled:opacity-50"
          >
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
              className="rounded-xl border border-border py-3 text-lg font-bold disabled:opacity-50 hover:border-gold"
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <p className="text-center text-[11px] text-white/30">
        도박은 재미로! 골드는 잃을 수 있습니다 😈
      </p>
    </div>
  );
}
