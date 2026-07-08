"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import { usePenaltyPicksRealtime } from "@/lib/hooks";
import { endPenaltyEarly } from "@/app/(app)/admin/penaltyActions";
import { PENALTY_OUTFITS } from "@/lib/constants";
import type { PenaltyPick } from "@/lib/types";

// 남은시간 포맷: 3시간 → "2시간 59분", 1시간 미만 → "42분 10초"
function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분 ${sec}초`;
}

// 🩲 벌칙 옷 현황판 — 지금 누가 무슨 옷을 입고 있고 남은시간이 얼마인지(당첨+3시간).
export default function PenaltyTracker({ picks }: { picks: PenaltyPick[] }) {
  const router = useRouter();
  const [nowMs, setNowMs] = useState(() => Date.now());

  // 1초 틱 카운트다운
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 새 당첨/해제 시 서버 재조회(조인된 이름 재로드)
  usePenaltyPicksRealtime(() => router.refresh());

  const active = picks
    .filter((p) => p.expires_at && Date.parse(p.expires_at) > nowMs)
    .sort((a, b) => Date.parse(a.expires_at!) - Date.parse(b.expires_at!));

  if (active.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[#ff5a5a]/40 bg-[#ff5a5a]/5 p-4">
      <h2 className="mb-1 font-bold">🩲 지금 입고 있는 벌칙 옷</h2>
      <p className="mb-3 text-xs text-white/50">
        당첨 후 3시간 착용 · 남은시간이 0이 되면 벗어도 됩니다.
      </p>
      <ul className="space-y-2">
        {active.map((p) => {
          const meta = PENALTY_OUTFITS[p.outfit];
          const left = Date.parse(p.expires_at!) - nowMs;
          const urgent = left < 30 * 60 * 1000; // 30분 미만
          return (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
            >
              <Avatar
                url={p.avatar_url ?? null}
                name={p.display_name ?? "?"}
                color="#ff5a5a"
                size={40}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{p.display_name ?? "?"}</p>
                <p className="text-xs text-white/60">
                  {meta.emoji} {meta.label}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`text-sm font-black tabular-nums ${
                    urgent ? "text-[#ff5a5a]" : "text-gold"
                  }`}
                >
                  {fmt(left)}
                </p>
                <button
                  onClick={() => {
                    if (confirm(`${p.display_name}님 벌칙을 지금 해제할까요?`))
                      endPenaltyEarly(p.id).then(() => router.refresh());
                  }}
                  className="text-[11px] text-white/40 underline"
                >
                  조기 해제
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
