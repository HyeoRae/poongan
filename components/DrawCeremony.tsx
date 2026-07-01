"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { useDrawState } from "@/lib/hooks";
import {
  revealNext,
  finishDraw,
  closeDraw,
  startRoleDeal,
} from "@/app/(app)/admin/actions";
import Avatar from "@/components/Avatar";
import type { DrawAssignment, DrawState } from "@/lib/types";

const SPIN_MS = 1800; // 슬롯머신 도는 시간
const SETTLE_MS = 800; // 착지 후 다음으로 넘어가기까지
const DEAL_STAGGER_MS = 160; // 역할 카드 한 장씩 분배 간격

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
  // 낙관적 공개 목표: 버튼 클릭 즉시 연출 시작(서버 왕복 대기 없이). realtime 값과 max 로 수렴.
  const [optimistic, setOptimistic] = useState(() => draw.revealed_count);
  const revealTarget = Math.max(draw.revealed_count, optimistic);
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

  // 서버 공개수가 "줄어들면"(새 배정식 시작/닫기 등) 로컬 진행도 리셋.
  // 낙관적 공개 중엔 animated 가 잠깐 서버값을 앞설 수 있으므로 animated 로 판단하지 않는다.
  const prevRevealed = useRef(draw.revealed_count);
  useEffect(() => {
    if (draw.revealed_count < prevRevealed.current) {
      clearTimers();
      setSpinning(false);
      setAnimated(draw.revealed_count);
      setOptimistic(draw.revealed_count);
    }
    prevRevealed.current = draw.revealed_count;
  }, [draw.revealed_count, clearTimers]);

  // 공개 대기열 처리: animated < revealTarget 면 다음 한 명 슬롯 연출
  useEffect(() => {
    if (spinning) return;
    if (animated >= revealTarget) return;
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
  }, [animated, revealTarget, spinning]);

  // 팀 공개 완료 시 축포. 역할 카드 분배는 관리자가 버튼으로 트리거(status='roles').
  useEffect(() => {
    if (draw.status === "done") finale();
  }, [draw.status]);

  const dealing = draw.status === "roles"; // 역할 카드 분배 단계

  // 안착 완료된 역할 카드 수 (RoleDealFlight 의 onLand 가 구동)
  const [dealtCount, setDealtCount] = useState(0);
  useEffect(() => {
    if (!dealing) setDealtCount(0);
  }, [dealing]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (draw.status === "idle") return null;

  const current = spinning ? assignments[animated] : null;
  const allRevealed = revealTarget >= total && animated >= total;
  // 공개 애니메이션이 아직 따라잡는 중이면 버튼 비활성화(중복 클릭 방지)
  const revealBusy = spinning || animated < revealTarget;

  // 다음 공개: 클릭 즉시 로컬 연출 시작, DB 반영은 백그라운드(렉 방지).
  // 공개 진행은 realtime 으로 다른 참가자에게도 전파되므로 router.refresh 불필요.
  function onRevealClick() {
    if (revealBusy || revealTarget >= total) return;
    setOptimistic((o) => Math.min(total, Math.max(o, animated) + 1));
    revealNext().then((r) => {
      if (!r.ok && r.message) alert(r.message);
    });
  }

  // 시작/닫기 등 저빈도 동작: 상태 정리를 위해 refresh 유지
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
                  <div className="my-2 flex items-center justify-center gap-3">
                    <Avatar
                      url={current.avatar_url}
                      name={current.display_name}
                      color={teams[spinIdx]?.team_color}
                      size={48}
                    />
                    <p className="text-3xl font-black">{current.display_name}</p>
                  </div>
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
              ) : dealing ? (
                // 역할 분배 중엔 상단 캡션이 안내를 담당(문구 겹침 방지)
                <p className="text-4xl font-black text-gold/30">🏆</p>
              ) : draw.status === "done" ? (
                <p className="text-4xl font-black text-gold">🏆 배정 완료!</p>
              ) : (
                <p className="text-xl font-bold text-white/70">
                  {allRevealed ? "모두 공개되었습니다!" : "두구두구..."}
                </p>
              )}
            </div>

            {/* 팀 컬럼 (프로필 카드 + 역할 카드 분배) */}
            <div className="grid grid-cols-2 gap-3">
              {teams.map((t) => {
                // slice(0, animated) 라 idx 는 곧 공개 순서(전역 인덱스)
                const members = assignments
                  .slice(0, animated)
                  .map((a, idx) => ({ ...a, idx }))
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
                      {members.map((m) => {
                        const dealt = dealing && m.idx < dealtCount;
                        return (
                          <li
                            key={m.user_id}
                            data-member-id={m.user_id}
                            className="relative animate-[pop_0.4s_ease] overflow-hidden rounded-lg bg-white/5 p-1.5"
                          >
                            <div className="flex items-center gap-2">
                              <Avatar
                                url={m.avatar_url}
                                name={m.display_name}
                                color={t.team_color}
                                size={30}
                              />
                              <span className="truncate text-sm font-semibold">
                                {m.display_name}
                              </span>
                            </div>
                            {/* 역할 카드 (뒷면) 가 프로필 카드 위로 안착 */}
                            {dealing && (
                              <div
                                aria-hidden
                                className={`role-overlay ${dealt ? "is-dealt" : ""}`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src="/role-cards/back.svg"
                                  alt=""
                                  draggable={false}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 역할 카드 분배: 중앙 덱 셔플 → 각 프로필 카드로 한 장씩 비행 → 안착 */}
      {dealing && total > 0 && (
        <RoleDealFlight
          order={assignments.map((a) => a.user_id)}
          total={total}
          dealtCount={dealtCount}
          muted={muted}
          onLand={setDealtCount}
        />
      )}

      {/* 관리자 제어 / 참가자 안내 (분배 암전 위로 올림) */}
      <div className="relative z-[60] px-5 pb-7 pt-3">
        {isAdmin ? (
          <AdminControls
            status={draw.status}
            revealed={revealTarget}
            total={total}
            allRevealed={allRevealed}
            spinning={revealBusy || pending}
            onReveal={onRevealClick}
            onFinish={() => act(finishDraw)}
            onDealRoles={() => act(startRoleDeal)}
            onClose={() => act(closeDraw)}
          />
        ) : (
          <p className="text-center text-sm text-white/40">
            {dealing
              ? "역할 카드를 나눠주는 중... 📱"
              : draw.status === "done"
              ? "곧 역할 카드를 배정합니다 🎴"
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
        /* 역할 카드: 비행 카드가 안착하는 순간 프로필 카드 위로 나타남 */
        .role-overlay {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          opacity: 0;
          transform: scale(1.08);
          transition: opacity 0.28s ease, transform 0.28s ease;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.55);
          pointer-events: none;
        }
        .role-overlay.is-dealt {
          opacity: 1;
          transform: scale(1);
        }
      `}</style>
    </div>
  );
}

// ---------- 역할 카드 분배 연출 (중앙 덱 셔플 → 프로필 카드로 비행) ----------
const SHUFFLE_MS = 2800; // 중앙 덱 셔플 시간
const FLIGHT_MS = 560; // 카드 한 장이 날아가는 시간
const CARD_W = 60;
const CARD_H = 84; // 300:420 비율 (덱을 크게)
const PILE_OFFSET = 40; // 셔플 시 좌/우 두 더미 간격

type FlightCard = {
  x: number;
  y: number;
  rot: number;
  moving: boolean;
  gone: boolean;
};

function RoleDealFlight({
  order,
  total,
  dealtCount,
  muted,
  onLand,
}: {
  order: string[];
  total: number;
  dealtCount: number;
  muted: boolean;
  onLand: (dealtCount: number) => void;
}) {
  const [phase, setPhase] = useState<"shuffle" | "deal">("shuffle");
  const [ready, setReady] = useState(false); // 덱 위치 잡힌 뒤 표시(좌상단 플래시 방지)
  const [cards, setCards] = useState<FlightCard[]>(() =>
    Array.from({ length: total }, (_, i) => ({
      x: 0,
      y: 0,
      rot: (i - total / 2) * 2,
      moving: false,
      gone: false,
    }))
  );
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // 덱 위치 (화면 중앙)
    const dx = window.innerWidth / 2;
    const dy = window.innerHeight * 0.44;
    setCards((cs) => cs.map((c) => ({ ...c, x: dx, y: dy })));
    setReady(true);

    if (reduce) {
      setPhase("deal");
      onLand(total);
      return;
    }

    const dealOne = (i: number) => {
      const el = document.querySelector<HTMLElement>(
        `[data-member-id="${order[i]}"]`
      );
      let tx = dx;
      let ty = dy;
      if (el) {
        const r = el.getBoundingClientRect();
        tx = r.left + r.width / 2;
        ty = r.top + r.height / 2;
      }
      beep(520 + i * 14, 0.05, mutedRef.current);
      setCards((cs) =>
        cs.map((c, j) => (j === i ? { ...c, x: tx, y: ty, rot: 0, moving: true } : c))
      );
      timers.push(
        setTimeout(() => {
          onLand(i + 1);
          setCards((cs) => cs.map((c, j) => (j === i ? { ...c, gone: true } : c)));
        }, FLIGHT_MS)
      );
    };

    timers.push(
      setTimeout(() => {
        setPhase("deal");
        for (let i = 0; i < total; i++) {
          timers.push(setTimeout(() => dealOne(i), i * DEAL_STAGGER_MS));
        }
      }, SHUFFLE_MS)
    );

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const caption =
    dealtCount >= total && total > 0
      ? "각자 폰에서 카드를 확인하세요! 📱"
      : phase === "shuffle"
      ? "🎴 카드를 섞는 중..."
      : "역할 카드 분배 중...";

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      <p
        className="absolute left-0 right-0 top-[11%] text-center text-xl font-black text-gold"
        style={{ textShadow: "0 0 18px rgba(245,197,66,0.55)" }}
      >
        {caption}
      </p>

      {ready &&
        cards.map((c, i) => {
          if (c.gone) return null;
          // 셔플/대기 중엔 좌·우 두 더미로 갈라두고, 날아갈 땐 더미 오프셋 제거
          const off = c.moving ? 0 : i % 2 === 0 ? -PILE_OFFSET : PILE_OFFSET;
          const isLeft = i % 2 === 0;
          return (
            <div
              key={i}
              className="flight-card"
              style={{
                width: CARD_W,
                height: CARD_H,
                transform: `translate(${c.x - CARD_W / 2 + off}px, ${
                  c.y - CARD_H / 2
                }px) rotate(${c.rot}deg)`,
                transition: c.moving
                  ? `transform ${FLIGHT_MS}ms cubic-bezier(0.2, 0.7, 0.2, 1)`
                  : "none",
                zIndex: 100 - i,
              }}
            >
              {/* 안쪽 img 를 3D 로 회전 — 컨테이너의 위치 이동과 독립적으로 동작 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/role-cards/back.svg"
                alt=""
                draggable={false}
                className={`card3d h-full w-full select-none object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.65)] ${
                  phase === "shuffle"
                    ? isLeft
                      ? "riffle-l"
                      : "riffle-r"
                    : c.moving
                    ? "is-flying"
                    : ""
                }`}
                style={
                  {
                    animationDelay:
                      phase === "shuffle" ? `${(Math.floor(i / 2) * 110) % 660}ms` : "0ms",
                    ["--flight" as string]: `${FLIGHT_MS}ms`,
                  } as CSSProperties
                }
              />
            </div>
          );
        })}

      <style jsx>{`
        .flight-card {
          position: fixed;
          top: 0;
          left: 0;
          perspective: 800px;
        }
        .card3d {
          transform-style: preserve-3d;
        }
        /* 리플 셔플: 두 더미의 카드가 번갈아 위로 튕겨 올라 다리(bridge)를 이루며 섞임 */
        .card3d.riffle-l {
          animation: riffleL 0.82s ease-in-out infinite;
        }
        .card3d.riffle-r {
          animation: riffleR 0.82s ease-in-out infinite;
        }
        @keyframes riffleL {
          0%,
          100% {
            transform: translate(0, 0) rotateZ(-3deg) rotateX(0deg);
          }
          35% {
            transform: translate(34px, -46px) rotateZ(16deg) rotateX(52deg);
          }
          70% {
            transform: translate(10px, -10px) rotateZ(6deg) rotateX(14deg);
          }
        }
        @keyframes riffleR {
          0%,
          100% {
            transform: translate(0, 0) rotateZ(3deg) rotateX(0deg);
          }
          35% {
            transform: translate(-34px, -46px) rotateZ(-16deg) rotateX(52deg);
          }
          70% {
            transform: translate(-10px, -10px) rotateZ(-6deg) rotateX(14deg);
          }
        }
        /* 3D 비행: 날아가는 동안 카드가 한 바퀴 뒤집히며 안착 */
        .card3d.is-flying {
          animation: flip3d var(--flight) cubic-bezier(0.2, 0.7, 0.2, 1) 1;
        }
        @keyframes flip3d {
          from {
            transform: rotateY(180deg) rotateZ(-12deg) scale(1.05);
          }
          60% {
            transform: rotateY(20deg) rotateZ(4deg) scale(1);
          }
          to {
            transform: rotateY(0deg) rotateZ(0deg) scale(0.72);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .card3d.riffle-l,
          .card3d.riffle-r,
          .card3d.is-flying {
            animation: none;
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
  onDealRoles,
  onClose,
}: {
  status: string;
  revealed: number;
  total: number;
  allRevealed: boolean;
  spinning: boolean;
  onReveal: () => void;
  onFinish: () => void;
  onDealRoles: () => void;
  onClose: () => void;
}) {
  // 역할 카드 분배 중/후: 닫기
  if (status === "roles") {
    return (
      <button
        onClick={onClose}
        className="w-full rounded-xl border border-border py-3 font-bold"
      >
        배정식 닫기
      </button>
    );
  }
  // 팀 공개 완료(축포 후): 역할 카드 배정 트리거
  if (status === "done") {
    return (
      <div className="space-y-2">
        <button
          onClick={onDealRoles}
          className="w-full rounded-xl bg-gold py-3.5 text-lg font-black text-black"
        >
          🎴 역할 카드 배정
        </button>
        <button
          onClick={onClose}
          className="w-full rounded-xl border border-border py-2.5 text-sm font-bold text-white/70"
        >
          배정식 닫기
        </button>
      </div>
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
