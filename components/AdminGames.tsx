"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPoolGame,
  openGame,
  lockGame,
  settleGame,
  cancelGame,
} from "@/app/(app)/admin/actions";
import type { AdminGameView } from "@/lib/types";

type ScheduleOpt = { id: number; day: number; title: string };

export default function AdminGames({
  games,
  schedule,
}: {
  games: AdminGameView[];
  schedule: ScheduleOpt[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // 생성 폼
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [source, setSource] = useState<"players" | "custom">("players");
  const [customOpts, setCustomOpts] = useState("");

  // 정산 시 선택한 우승 옵션 (게임별)
  const [winner, setWinner] = useState<Record<number, number>>({});

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      setMsg(res.message);
      if (res.ok) router.refresh();
    });
  }

  function create() {
    run(async () => {
      const r = await createPoolGame(
        title,
        scheduleId ? Number(scheduleId) : null,
        source,
        desc,
        source === "custom" ? customOpts.split("\n") : []
      );
      if (r.ok) {
        setTitle("");
        setDesc("");
        setScheduleId("");
        setCustomOpts("");
      }
      return r;
    });
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">
          {msg}
        </div>
      )}

      {/* 새 게임 만들기 */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-bold">➕ 새 배팅 게임</h2>
        <div className="space-y-2">
          <input
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            placeholder="제목 (예: 🎣 강태공 배팅)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            placeholder="설명 (선택, 예: 누가 제일 많이 낚을까?)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <select
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            value={scheduleId}
            onChange={(e) => setScheduleId(e.target.value)}
          >
            <option value="">연결 일정 (선택 안 함)</option>
            {schedule.map((s) => (
              <option key={s.id} value={s.id}>
                {s.day}일차 · {s.title}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => setSource("players")}
              className={`flex-1 rounded-xl border py-2 text-xs font-bold ${
                source === "players"
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border text-white/60"
              }`}
            >
              👥 참가자 중 1등
            </button>
            <button
              onClick={() => setSource("custom")}
              className={`flex-1 rounded-xl border py-2 text-xs font-bold ${
                source === "custom"
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border text-white/60"
              }`}
            >
              ✏️ 직접 선택지
            </button>
          </div>
          {source === "players" ? (
            <p className="text-[11px] text-white/40">
              열 때(오픈) 현재 참가자 명단으로 선택지가 자동 생성됩니다.
            </p>
          ) : (
            <textarea
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
              rows={3}
              placeholder={"선택지를 줄바꿈으로 구분\n예)\n맑음\n흐림\n비"}
              value={customOpts}
              onChange={(e) => setCustomOpts(e.target.value)}
            />
          )}
          <button
            disabled={pending}
            onClick={create}
            className="w-full rounded-xl bg-gold py-2.5 font-bold text-black disabled:opacity-50"
          >
            게임 만들기
          </button>
        </div>
      </section>

      {/* 게임 목록 + 운영 */}
      {games.length === 0 ? (
        <p className="text-sm text-white/50">아직 만든 게임이 없습니다.</p>
      ) : (
        games.map((g) => (
          <section
            key={g.id}
            className="space-y-3 rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold">{g.title}</h3>
                {g.schedule_title && (
                  <p className="text-xs text-white/40">🗓️ {g.schedule_title}</p>
                )}
                <p className="mt-0.5 text-xs text-white/50">
                  팟 🪙{g.total_pot.toLocaleString()} · 베팅 {g.bet_count}건
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-white/70">
                {g.status}
              </span>
            </div>

            {/* 선택지 + 팟 */}
            {g.options.length > 0 && (
              <div className="space-y-1 text-xs text-white/60">
                {g.options.map((o) => (
                  <div key={o.id} className="flex justify-between">
                    <span>
                      {g.result?.winning_option === o.id && "👑 "}
                      {o.label}
                    </span>
                    <span>🪙{o.pot.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 액션 */}
            <div className="flex flex-wrap gap-2">
              {(g.status === "draft" || g.status === "locked") && (
                <button
                  disabled={pending}
                  onClick={() => run(() => openGame(g.id))}
                  className="rounded-xl bg-gold px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
                >
                  {g.status === "locked" ? "다시 열기" : "🟢 베팅 열기"}
                </button>
              )}
              {g.status === "open" && (
                <button
                  disabled={pending}
                  onClick={() => run(() => lockGame(g.id))}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-bold disabled:opacity-50"
                >
                  🔒 베팅 마감
                </button>
              )}
              {(g.status === "open" || g.status === "locked") && (
                <>
                  <select
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold"
                    value={winner[g.id] ?? ""}
                    onChange={(e) =>
                      setWinner((w) => ({ ...w, [g.id]: Number(e.target.value) }))
                    }
                  >
                    <option value="">우승 선택지</option>
                    {g.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={pending || !winner[g.id]}
                    onClick={() => {
                      if (confirm("이 선택지를 우승으로 정산할까요?"))
                        run(() => settleGame(g.id, winner[g.id]));
                    }}
                    className="rounded-xl bg-gold px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
                  >
                    🏆 정산
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => {
                      if (confirm("게임을 취소하고 전원 환불할까요?"))
                        run(() => cancelGame(g.id));
                    }}
                    className="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-bold text-red-300 disabled:opacity-50"
                  >
                    취소
                  </button>
                </>
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
