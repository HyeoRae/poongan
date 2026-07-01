"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { drawEffectCard } from "@/app/(app)/card/actions";
import { useMyCardsRealtime } from "@/lib/hooks";
import type { EffectCardPreset, GachaResult } from "@/lib/types";
import Spinner from "@/components/Spinner";

const GRADE_STYLE: Record<string, { ring: string; label: string }> = {
  passive: { ring: "#7aa7ff", label: "상시" },
  consumable: { ring: "#f5c542", label: "1회용" },
};

// 카드 아트 (public/effect-cards/<key>.png|svg), 없으면 이모지 폴백
function CardFace({ icon, artKey }: { icon: string; artKey: string | null }) {
  const [broken, setBroken] = useState(false);
  const [src, setSrc] = useState(artKey ? `/effect-cards/${artKey}.png` : "");
  if (!artKey || broken) {
    return <span className="text-5xl">{icon}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      draggable={false}
      onError={() => {
        if (src.endsWith(".png")) setSrc(`/effect-cards/${artKey}.svg`);
        else setBroken(true);
      }}
      className="h-full w-full select-none object-contain"
    />
  );
}

export default function EffectCardGacha({
  userId,
  presets,
  freeLeft,
  nextCost,
}: {
  userId: string;
  presets: EffectCardPreset[];
  freeLeft: number;
  nextCost: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<"idle" | "spin" | "reveal">("idle");
  const [result, setResult] = useState<GachaResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useMyCardsRealtime(userId, () => router.refresh());

  function onDraw() {
    if (pending) return;
    setErr(null);
    setResult(null);
    setPhase("spin");
    startTransition(async () => {
      const started = Date.now();
      const res = await drawEffectCard();
      // 최소 900ms 연출
      const wait = Math.max(0, 900 - (Date.now() - started));
      await new Promise((r) => setTimeout(r, wait));
      if (!res.ok) {
        setErr(res.message);
        setPhase("idle");
        return;
      }
      setResult(res.result);
      setPhase("reveal");
      router.refresh();
    });
  }

  const isFree = freeLeft > 0;
  const grade = result?.grade ?? null;
  const gradeStyle = grade ? GRADE_STYLE[grade] : null;
  const ring = result?.blank ? "#6b7280" : gradeStyle?.ring ?? "#6b7280";

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h1 className="mb-1 text-xl font-black">🎴 효과카드 뽑기</h1>
      <p className="mb-4 text-xs text-white/50">
        꽝 40% · 상시 45% · 희귀 15%. 무료 뽑기 후에는 뽑을수록 비싸져요.
      </p>

      {/* 뽑기 무대 */}
      <div className="mb-4 flex flex-col items-center gap-3">
        <div
          className="relative flex aspect-[300/420] w-40 items-center justify-center overflow-hidden rounded-2xl border-2 bg-background"
          style={{
            borderColor: phase === "idle" ? "#2b2f3a" : ring,
            boxShadow: phase === "reveal" ? `0 8px 36px ${ring}66` : undefined,
          }}
        >
          {phase === "idle" && <span className="text-5xl opacity-40">🎴</span>}
          {phase === "spin" && (
            <span className="animate-pulse text-5xl">🌀</span>
          )}
          {phase === "reveal" && result && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center">
              {result.blank ? (
                <>
                  <span className="text-5xl">💨</span>
                  <p className="font-black text-white/70">꽝</p>
                  {result.refund > 0 && (
                    <p className="text-[11px] text-gold">
                      +{result.refund.toLocaleString()} 환급
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex h-24 w-full items-center justify-center">
                    <CardFace icon={result.icon ?? "🎴"} artKey={result.key} />
                  </div>
                  <p className="text-sm font-black" style={{ color: ring }}>
                    {result.name}
                  </p>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: ring + "22", color: ring }}
                  >
                    {gradeStyle?.label}
                    {result.dup ? " · 중복" : ""}
                  </span>
                  {result.dup && result.refund > 0 && (
                    <p className="text-[11px] text-gold">
                      중복 +{result.refund.toLocaleString()} 환급
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onDraw}
          disabled={pending}
          className="flex w-40 items-center justify-center gap-2 rounded-xl bg-gold py-3 font-black text-black disabled:opacity-50"
        >
          {pending && <Spinner />}
          {pending
            ? "뽑는 중..."
            : isFree
            ? `무료 뽑기 (${freeLeft}회 남음)`
            : `뽑기 · 🪙 ${nextCost.toLocaleString()}`}
        </button>
        {err && <p className="text-sm text-red-400">{err}</p>}
      </div>

      {/* 도감 */}
      <details className="rounded-xl border border-border bg-background/50 p-3">
        <summary className="cursor-pointer text-sm font-bold text-white/70">
          📖 카드 도감 ({presets.length}종)
        </summary>
        <ul className="mt-2 space-y-1.5">
          {presets.map((p) => {
            const gs = GRADE_STYLE[p.grade];
            return (
              <li key={p.id} className="flex items-start gap-2 text-xs">
                <span className="text-base">{p.icon}</span>
                <span className="flex-1">
                  <b>{p.name}</b>{" "}
                  <span style={{ color: gs?.ring }}>· {gs?.label}</span>
                  <br />
                  <span className="text-white/50">{p.description}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}
