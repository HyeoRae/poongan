"use client";

import { RANK_GUIDE, JABI_GUIDE } from "@/lib/sutda";

const JABI_NAMES = ["암행어사", "땡잡이", "멍텅구리구사"];

// 라벨이 속한 등급(tier) 판정
function tierOf(label: string | null): string | null {
  if (!label) return null;
  if (label.includes("광땡")) return "광땡";
  if (JABI_NAMES.includes(label)) return "잡이";
  if (label.endsWith("땡")) return "땡";
  if (["알리", "독사", "구삥", "장사", "세륙"].includes(label)) return "특수";
  return "끗";
}

export default function SutdaRankGuide({
  myLabel,
  onClose,
}: {
  myLabel: string | null;
  onClose: () => void;
}) {
  const myTier = tierOf(myLabel);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black">📖 섯다 족보</h2>
          <button onClick={onClose} className="rounded-lg px-3 py-1 text-sm text-white/60">
            닫기
          </button>
        </div>

        {myLabel && (
          <div className="mb-4 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3 text-sm font-bold text-gold">
            내 패 = {myLabel}
          </div>
        )}

        <p className="mb-2 text-xs text-white/50">위쪽이 강한 패 (높은 등급)</p>
        <div className="space-y-2">
          {RANK_GUIDE.map((row) => {
            const hit = myTier === row.tier;
            return (
              <div
                key={row.tier}
                className={`rounded-xl border px-4 py-3 ${
                  hit ? "border-gold bg-gold/10" : "border-border bg-background"
                }`}
              >
                <div className="mb-1 text-sm font-bold">
                  {row.tier}
                  {hit && <span className="ml-2 text-[11px] text-gold">← 내 패</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {row.items.map((it) => (
                    <span
                      key={it}
                      className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70"
                    >
                      {it}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <h3 className="mb-2 mt-4 text-sm font-bold text-white/70">잡이패 (특수 룰)</h3>
        <div className="space-y-2">
          {JABI_GUIDE.map((j) => {
            const hit = myLabel === j.name;
            return (
              <div
                key={j.name}
                className={`rounded-xl border px-4 py-2.5 text-sm ${
                  hit ? "border-gold bg-gold/10" : "border-border bg-background"
                }`}
              >
                <span className="font-bold">{j.name}</span>{" "}
                <span className="text-white/50">({j.pair})</span>
                <div className="text-xs text-white/60">{j.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
