"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ScheduleItem, ScheduleGameBadge } from "@/lib/types";

// 일차 → 실제 날짜 (docs/schedule.md 기준, 2026년)
const DAY_META: Record<number, { date: string; y: number; m: number; d: number }> = {
  1: { date: "7/10", y: 2026, m: 7, d: 10 },
  2: { date: "7/11", y: 2026, m: 7, d: 11 },
  3: { date: "7/12", y: 2026, m: 7, d: 12 },
};

type Status = "past" | "current" | "upcoming";

/** start_time("08:00", "~11:00")과 일차를 합쳐 실제 시작 시각(ms)을 만든다. */
function itemStartMs(it: ScheduleItem): number | null {
  const meta = DAY_META[it.day];
  if (!meta || !it.start_time) return null;
  const m = it.start_time.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return new Date(meta.y, meta.m - 1, meta.d, Number(m[1]), Number(m[2])).getTime();
}

/** 현재 시각 기준으로 펼쳐 보여줄 일차: 진행 중 > 가장 가까운 예정 > (전부 지났으면) 마지막. */
function pickActiveDay(items: ScheduleItem[], nowMs: number): number | null {
  const sorted = items
    .map((it) => ({ it, start: itemStartMs(it) }))
    .filter((x): x is { it: ScheduleItem; start: number } => x.start !== null)
    .sort((a, b) => a.start - b.start);
  if (sorted.length === 0) return null;
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    const end = next ? next.start : cur.start + 2 * 60 * 60 * 1000;
    if (nowMs < end) return cur.it.day; // 예정(앞)이거나 진행 중인 첫 항목의 일차
  }
  return sorted[sorted.length - 1].it.day; // 전부 지남
}

export default function ScheduleTimeline({
  items,
  games = [],
}: {
  items: ScheduleItem[];
  games?: ScheduleGameBadge[];
}) {
  const days = [...new Set(items.map((i) => i.day))].sort((a, b) => a - b);

  // 일정 id → 연결된 게임 배지들
  const gamesByItem = new Map<number, ScheduleGameBadge[]>();
  games.forEach((g) => {
    const arr = gamesByItem.get(g.schedule_id) ?? [];
    arr.push(g);
    gamesByItem.set(g.schedule_id, arr);
  });

  const [selectedDay, setSelectedDay] = useState<number>(days[0]);
  // 서버 렌더(=null)와 첫 클라이언트 렌더를 일치시켜 하이드레이션 불일치를 피한다.
  const [now, setNow] = useState<number | null>(null);
  const autoSelected = useRef(false);

  useEffect(() => {
    const n = Date.now();
    setNow(n);
    // 마운트 시 한 번만, 오늘/진행 중인 일차로 자동 전환 (이후 사용자가 고른 탭은 존중)
    if (!autoSelected.current) {
      const active = pickActiveDay(items, n);
      if (active != null) setSelectedDay(active);
      autoSelected.current = true;
    }
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 진행 여부는 여러 일차를 통틀어 시작시각 순으로 판단 (현재 보는 일차와 무관하게 정확)
  const sorted = items
    .map((it) => ({ it, start: itemStartMs(it) }))
    .filter((x): x is { it: ScheduleItem; start: number } => x.start !== null)
    .sort((a, b) => a.start - b.start);

  const statusOf = new Map<number, Status>();
  if (now !== null) {
    sorted.forEach((cur, idx) => {
      const next = sorted[idx + 1];
      const end = next ? next.start : cur.start + 2 * 60 * 60 * 1000;
      const status: Status = now < cur.start ? "upcoming" : now < end ? "current" : "past";
      statusOf.set(cur.it.id, status);
    });
  }

  const dayItems = items.filter((i) => i.day === selectedDay);

  return (
    <div className="space-y-4">
      {/* 일차 서브탭 */}
      <div className="flex gap-2">
        {days.map((d) => {
          const active = d === selectedDay;
          return (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`flex-1 rounded-xl px-3 py-2 text-center transition-colors ${
                active
                  ? "bg-gold text-black"
                  : "border border-border bg-card text-white/60"
              }`}
            >
              <div className="text-sm font-bold">{d}일차</div>
              <div className={`text-[10px] ${active ? "opacity-70" : "opacity-50"}`}>
                {DAY_META[d]?.date}
              </div>
            </button>
          );
        })}
      </div>

      {/* 선택한 일차 타임라인 */}
      <ol className="relative space-y-3 border-l border-border pl-4">
        {dayItems.map((it) => {
          const status = statusOf.get(it.id) ?? "upcoming";
          const isCurrent = status === "current";
          const isPast = status === "past";

          const dotCls = isCurrent
            ? "bg-gold animate-pulse ring-4 ring-gold/30"
            : isPast
              ? "bg-white/20"
              : "bg-gold";

          const cardCls = isCurrent
            ? "border-gold bg-gold/10 ring-1 ring-gold/40"
            : isPast
              ? "border-border bg-card opacity-50"
              : "border-border bg-card";

          return (
            <li key={it.id} className="relative">
              <span
                className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full transition-colors ${dotCls}`}
              />
              <div className={`rounded-xl border p-3 transition-all ${cardCls}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`font-semibold ${isCurrent ? "text-gold" : isPast ? "text-white/60" : ""}`}
                  >
                    {it.title}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isCurrent && (
                      <span className="rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-bold text-black">
                        진행 중
                      </span>
                    )}
                    {it.start_time && (
                      <span className="text-xs text-white/50">{it.start_time}</span>
                    )}
                  </div>
                </div>
                {it.location && (
                  <a
                    href={`https://map.kakao.com/?q=${encodeURIComponent(it.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-white/50 underline decoration-dotted underline-offset-2 hover:text-gold"
                  >
                    📍 {it.location}
                  </a>
                )}
                {it.description && (
                  <p className="mt-1 text-sm text-white/70">{it.description}</p>
                )}
                {(gamesByItem.get(it.id) ?? []).map((g) => (
                  <Link
                    key={g.title}
                    href="/games"
                    className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1.5 text-xs font-semibold text-gold"
                  >
                    <span>
                      {g.status === "settled"
                        ? `🏆 ${g.title} 우승: ${g.winner_label ?? "?"}`
                        : g.status === "locked"
                          ? `🔒 ${g.title} · 정산 대기`
                          : `🎮 ${g.title} · 베팅하기`}
                    </span>
                    <span className="opacity-60">→</span>
                  </Link>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
