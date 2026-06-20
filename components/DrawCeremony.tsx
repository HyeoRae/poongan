"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { useDrawState } from "@/lib/hooks";
import { revealNext, finishDraw, closeDraw } from "@/app/(app)/admin/actions";
import type { DrawAssignment, DrawState } from "@/lib/types";

const SPIN_MS = 1800; // 슬롯머신 도는 시간
const SETTLE_MS = 800; // 착지 후 다음으로 넘어가기까지

export default function DrawCeremony({
  isAdmin,
  initial,
}: {
  isAdmin: boolean;
  initial: DrawState;
}) {
  const draw = useDrawState(initial);
  const router = useRouter();

  const assignments = draw.assignments ?? [];
  const total = assignments.length;

  // 고유 팀 목록 (슬롯 후보)
  const teams = uniqueTeams(assignments);

  // 로컬 애니메이션 진행도: 컬럼에 안착 완료된 인원 수
  const [animated, setAnimated] = useState(() => draw.revealed_count);
  const [spinning, setSpinning] = useState(false);
  const [spinIdx, setSpinIdx] = useState(0); // 슬롯에 현재 표시중인 팀 인덱스
  const [muted, setMuted] = useState(false);
  const [pending, setPending] = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (interval.current) clearInterval(interval.current);
    interval.current = null;
  }, []);

  // 새 배정식 시작/닫기로 revealed_count가 줄면 로컬 진행도 리셋
  useEffect(() => {
    if (draw.revealed_count < animated) {
      clearTimers();
      setSpinning(false);
      setAnimated(draw.revealed_count);
    }
  }, [draw.revealed_count, animated, clearTimers]);

  // 공개 대기열 처리: animated < revealed_count 면 다음 한 명 슬롯 연출
  useEffect(() => {
    if (spinning) return;
    if (animated >= draw.revealed_count) return;
    const target = assignments[animated];
    if (!target) return;

    setSpinning(true);
    // 슬롯 회전
    interval.current = setInterval(() => {
      setSpinIdx((i) => (i + 1) % Math.max(1, teams.length));
      beep(220, 0.03, mutedRef.current);
    }, 90);

    // 착지
    timers.current.push(
      setTimeout(() => {
        if (interval.current) clearInterval(interval.current);
        interval.current = null;
        const landIdx = teams.findIndex((t) => t.team_id === target.team_id);
        setSpinIdx(landIdx < 0 ? 0 : landIdx);
        beep(660, 0.18, mutedRef.current);
        burst(target.team_color);

        timers.current.push(
          setTimeout(() => {
            setSpinning(false);
            setAnimated((n) => n + 1);
          }, SETTLE_MS)
        );
      }, SPIN_MS)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animated, draw.revealed_count, spinning]);

  // 피날레 컨페티
  useEffect(() => {
    if (draw.status === "done") {
      finale();
    }
  }, [draw.status]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (draw.status === "idle") return null;

  const current = spinning ? assignments[animated] : null;
  const allRevealed = draw.revealed_count >= total && animated >= total;

  async function act(fn: () => Promise<{ ok: boolean; message: string }>) {
    setPending(true);
    const r = await fn();
    setPending(false);
    if (!r.ok && r.message) alert(r.message);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#08080d]/98 backdrop-blur-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 pt-5">
        <h1 className="text-lg font-black text-gold">🎲 팀 배정식</h1>
        <button
          onClick={() => setMuted((m) => !m)}
          className="rounded-full bg-white/10 px-3 py-1 text-sm"
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </div>

      {/* 본문 */}
      <div className="flex flex-1 flex-col justify-center px-5">
        {draw.status === "intro" && animated === 0 && !spinning ? (
          <div className="text-center">
            <p className="text-2xl font-black">운명의 팀 배정</p>
            <p className="mt-2 text-white/60">사회자가 한 명씩 공개합니다</p>
            <p className="mt-6 text-5xl">🥁</p>
          </div>
        ) : (
          <>
            {/* 슬롯 무대 */}
            <div className="mb-6 min-h-[140px] text-center">
              {current ? (
                <>
                  <p className="text-sm text-white/50">다음 주인공은...</p>
                  <p className="my-2 text-3xl font-black">{current.display_name}</p>
                  <div
                    className="mx-auto w-56 rounded-2xl border-2 py-5 text-2xl font-black transition-all duration-100"
                    style={{
                      borderColor: teams[spinIdx]?.team_color,
                      color: teams[spinIdx]?.team_color,
                      boxShadow: spinning
                        ? "none"
                        : `0 0 40px ${teams[spinIdx]?.team_color}`,
                    }}
                  >
                    {teams[spinIdx]?.team_name}
                  </div>
                </>
              ) : draw.status === "done" ? (
                <p className="text-4xl font-black text-gold">🏆 배정 완료!</p>
              ) : (
                <p className="text-xl font-bold text-white/70">
                  {allRevealed ? "모두 공개되었습니다!" : "두구두구..."}
                </p>
              )}
            </div>

            {/* 팀 컬럼 */}
            <div className="grid grid-cols-2 gap-3">
              {teams.map((t) => {
                const members = assignments
                  .slice(0, animated)
                  .filter((a) => a.team_id === t.team_id);
                return (
                  <div
                    key={t.team_id}
                    className="rounded-2xl border-2 bg-card/60 p-3"
                    style={{ borderColor: t.team_color + "88" }}
                  >
                    <div
                      className="mb-2 text-center font-black"
                      style={{ color: t.team_color }}
                    >
                      {t.team_name}
                    </div>
                    <ul className="space-y-1.5">
                      {members.map((m) => (
                        <li
                          key={m.user_id}
                          className="animate-[pop_0.4s_ease] rounded-lg bg-white/5 py-1.5 text-center text-sm font-semibold"
                        >
                          {m.display_name}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 관리자 제어 / 참가자 안내 */}
      <div className="px-5 pb-7 pt-3">
        {isAdmin ? (
          <AdminControls
            status={draw.status}
            revealed={draw.revealed_count}
            total={total}
            allRevealed={allRevealed}
            spinning={spinning || pending}
            onReveal={() => act(revealNext)}
            onFinish={() => act(finishDraw)}
            onClose={() => act(closeDraw)}
          />
        ) : (
          <p className="text-center text-sm text-white/40">
            {draw.status === "done"
              ? "잠시 후 종료됩니다"
              : "사회자가 진행 중입니다 🎤"}
          </p>
        )}
      </div>

      <style jsx global>{`
        @keyframes pop {
          0% {
            transform: scale(0.6);
            opacity: 0;
          }
          60% {
            transform: scale(1.08);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

function AdminControls({
  status,
  revealed,
  total,
  allRevealed,
  spinning,
  onReveal,
  onFinish,
  onClose,
}: {
  status: string;
  revealed: number;
  total: number;
  allRevealed: boolean;
  spinning: boolean;
  onReveal: () => void;
  onFinish: () => void;
  onClose: () => void;
}) {
  if (status === "done") {
    return (
      <button
        onClick={onClose}
        className="w-full rounded-xl border border-border py-3 font-bold"
      >
        배정식 닫기
      </button>
    );
  }
  if (allRevealed) {
    return (
      <button
        onClick={onFinish}
        disabled={spinning}
        className="w-full rounded-xl bg-gold py-3.5 text-lg font-black text-black disabled:opacity-50"
      >
        🏆 결과 확정 & 축포
      </button>
    );
  }
  return (
    <button
      onClick={onReveal}
      disabled={spinning || revealed >= total}
      className="w-full rounded-xl bg-gold py-3.5 text-lg font-black text-black disabled:opacity-50"
    >
      {status === "intro" ? "▶ 첫 공개 시작" : `다음 공개 (${revealed}/${total})`}
    </button>
  );
}

// ---------- 헬퍼 ----------
function uniqueTeams(assignments: DrawAssignment[]) {
  const map = new Map<number, { team_id: number; team_name: string; team_color: string }>();
  for (const a of assignments) {
    if (!map.has(a.team_id)) {
      map.set(a.team_id, {
        team_id: a.team_id,
        team_name: a.team_name,
        team_color: a.team_color,
      });
    }
  }
  return [...map.values()].sort((x, y) => x.team_id - y.team_id);
}

function burst(color: string) {
  confetti({
    particleCount: 60,
    spread: 70,
    origin: { y: 0.4 },
    colors: [color, "#ffffff", "#f5c542"],
  });
}

function finale() {
  const end = Date.now() + 1200;
  (function frame() {
    confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0 } });
    confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

// Web Audio 비프음 (음소거/실패 시 무시)
let audioCtx: AudioContext | null = null;
function beep(freq: number, dur: number, muted: boolean) {
  if (muted) return;
  try {
    audioCtx =
      audioCtx ??
      new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.connect(g);
    g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.08, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch {
    /* 자동재생 제약 등 — 무시 */
  }
}
