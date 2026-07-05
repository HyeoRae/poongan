"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mulberry32 } from "@/lib/rng";
import type { PenaltyParticipant } from "@/lib/types";

// 🏁 동물 달리기: 참가자별 동물이 각자 레인에서 오른쪽으로 질주.
// 매 프레임(rAF) 위치를 시드 기반 속도곡선으로 계산 → 레이스 내내 순위가 마구 엎치락뒤치락.
// 당첨자 포함 "전원"이 동일한 무작위 속도곡선을 받으므로 매 판 전개가 달라진다(고정 패턴 없음):
// 어떤 판은 당첨자가 초반부터 선두, 어떤 판은 중반 처졌다 막판 역전 — 그때그때 다르다.
// 승자는 서버가 강제(당첨자 최종 위치=1.0 → 항상 1위), 나머지 순위·흔들림·간식은 seed 로 결정(전원 동일 재생).
const ANIMALS = [
  "🐢", "🐇", "🐷", "🐅", "🐛", "🐎", "🦆", "🐥",
  "🐸", "🐒", "🐔", "🐄", "🦖", "🦔", "🐈", "🐕",
];
const TREATS = ["💸", "🪙", "🍫", "🍭", "🍩", "☕", "🍪", "🍬", "💵", "🧃"];

// 속도곡선 성분(시뮬레이션으로 튜닝) — [주파수 범위, 진폭 범위].
// 저주파(긴 치고나감/처짐 파도) + 고주파(잔떨림) 혼합으로 리더가 자주 뒤바뀐다.
const SPEED_COMPS = [
  { f: [0.6, 1.1], a: [0.6, 0.9] },
  { f: [1.6, 2.4], a: [0.5, 0.75] },
  { f: [3.0, 4.2], a: [0.42, 0.62] },
  { f: [4.8, 6.4], a: [0.28, 0.45] },
  { f: [7.2, 9.0], a: [0.18, 0.3] },
];
const SAMPLES = 240; // 속도 적분 테이블 해상도
const F_HI = 0.93; // 비당첨자 최종 위치 상한
const F_LO = 0.8; // 비당첨자 최종 위치 하한 (꼴찌)
const SPEED_FLOOR = 0.05; // 최소 속도(뒤로 안 감)

const READY_MS = 700; // 출발선 대기
const RACE_MS = 9000; // 본 레이스(≈9초)
const RACE_MS_REDUCED = 2600; // 감속모션 시 짧게
const RANK_HOLD_MS = 1700; // 순위 공개 후 유지
const START_PAD = 8; // 출발선 px
const RIGHT_PAD = 12; // 결승선 px

type Runner = { cum: Float64Array; total: number; F: number };

export default function RaceTrack({
  participants,
  winnerIndex,
  seed,
  onDone,
}: {
  participants: PenaltyParticipant[];
  winnerIndex: number;
  seed: number;
  onDone?: () => void;
}) {
  const n = Math.max(1, participants.length);
  const [started, setStarted] = useState(false); // 출발(콘페티 렌더)
  const [ranked, setRanked] = useState(false); // 순위 공개
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const trackRef = useRef<HTMLDivElement>(null);
  const runnerRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 동물 크기: 참가자 많으면 자동 축소 (이름표까지 레인 안에 들어오도록 보수적으로)
  const size = Math.max(20, Math.min(44, Math.floor(270 / n)));

  // seed 결정론: 동물 배정 · 속도곡선 · 순위 · 간식 콘페티
  const { animals, runners, ranks, lastRank, treats } = useMemo(() => {
    const rand = mulberry32(seed >>> 0);

    // 동물 셔플(중복 없이)
    const pool = [...ANIMALS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // 대기실에서 각자 고른 동물 사용(없으면 셔플 폴백)
    const animals = participants.map((p, i) => p.animal ?? pool[i % pool.length]);

    // 비당첨자 최종 위치(선형 분포 후 셔플) — 당첨자는 1.0(결승선)
    const others: number[] = [];
    for (let k = 0; k < n - 1; k++) {
      others.push(F_LO + (n > 2 ? ((F_HI - F_LO) * k) / (n - 2) : 0));
    }
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }

    let oi = 0;
    const runners: Runner[] = participants.map((_, i) => {
      // 전원 동일한 무작위 속도곡선 — 당첨자 특혜(역전 봉투) 없음.
      const comps = SPEED_COMPS.map((c) => ({
        freq: c.f[0] + rand() * (c.f[1] - c.f[0]),
        amp: c.a[0] + rand() * (c.a[1] - c.a[0]),
        phase: rand() * Math.PI * 2,
      }));

      // 속도 적분 → 누적거리 테이블
      const cum = new Float64Array(SAMPLES + 1);
      let acc = 0;
      for (let k = 1; k <= SAMPLES; k++) {
        const u = (k - 0.5) / SAMPLES;
        let sp = 1;
        for (const c of comps) sp += c.amp * Math.sin(2 * Math.PI * c.freq * u + c.phase);
        if (sp < SPEED_FLOOR) sp = SPEED_FLOOR;
        acc += sp / SAMPLES;
        cum[k] = acc;
      }
      // 당첨자 최종 위치=1.0(결승선) → 항상 1위. 나머지는 seed 로 흩뿌린 위치.
      const F = i === winnerIndex ? 1.0 : others[oi++];
      return { cum, total: cum[SAMPLES], F };
    });

    // 최종 위치로 순위 결정(당첨자 F=1.0 → 1등, 최소 F → 꼴찌)
    const Fs = runners.map((r) => r.F);
    const ranks = Fs.map(
      (f, i) => 1 + Fs.filter((o, j) => o > f || (o === f && j < i)).length
    );
    const lastRank = n;

    const count = Math.min(16, 8 + n);
    const treats = Array.from({ length: count }, () => ({
      emoji: TREATS[Math.floor(rand() * TREATS.length)],
      left: 4 + rand() * 84, // %
      delay: rand() * 7, // s (레이스 전체에 흩뿌림)
      dur: 2.4 + rand() * 1.8, // s
      drift: (rand() - 0.5) * 70, // px
      size: 20 + rand() * 14, // px
    }));

    return { animals, runners, ranks, lastRank, treats };
  }, [participants, winnerIndex, seed, n]);

  // 위치 계산: 누적거리 테이블 보간 → 진행률 g(u) ∈ [0,1]
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const width = track.clientWidth || 320;
    const maxX = Math.max(START_PAD + 40, width - size - RIGHT_PAD);

    // 출발선에 정렬
    runnerRefs.current.forEach((el) => {
      if (el) el.style.left = `${START_PAD}px`;
    });

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const race = reduce ? RACE_MS_REDUCED : RACE_MS;

    let raf = 0;
    let doneTimer = 0;
    let t0 = 0;
    let cancelled = false;

    const gAt = (r: Runner, u: number) => {
      if (u <= 0) return 0;
      if (u >= 1) return 1;
      const kf = u * SAMPLES;
      const k0 = kf | 0;
      const fr = kf - k0;
      return (r.cum[k0] + (r.cum[k0 + 1] - r.cum[k0]) * fr) / r.total;
    };

    const startTimer = window.setTimeout(() => {
      if (cancelled) return;
      setStarted(true);
      t0 = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const u = Math.min(1, (now - t0) / race);
        for (let i = 0; i < runners.length; i++) {
          const el = runnerRefs.current[i];
          if (!el) continue;
          const x = START_PAD + runners[i].F * gAt(runners[i], u) * (maxX - START_PAD);
          el.style.left = `${x}px`;
        }
        if (u < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          setRanked(true);
          doneTimer = window.setTimeout(() => doneRef.current?.(), RANK_HOLD_MS);
        }
      };
      raf = requestAnimationFrame(tick);
    }, READY_MS);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      clearTimeout(doneTimer);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runners, size]);

  return (
    <div className="mx-auto w-full max-w-md">
      <div
        ref={trackRef}
        style={{ height: `min(66vh, ${Math.max(360, n * 48)}px)` }}
        className="relative w-full overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-white/[0.04] to-black/30"
      >
        {/* 출발선 */}
        <div className="absolute left-2 top-0 h-full w-px bg-white/15" />
        {/* 결승선 (체크무늬) */}
        <div
          className="absolute right-3 top-0 h-full w-1"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg,#f5c542 0 8px,#0b0b12 8px 16px)",
            opacity: 0.55,
          }}
        />

        {/* 간식·돈 콘페티 */}
        {started &&
          treats.map((t, i) => (
            <span
              key={i}
              className="treat pointer-events-none absolute select-none"
              style={{
                left: `${t.left}%`,
                top: "-8%",
                fontSize: `${t.size}px`,
                // @ts-expect-error CSS 변수
                "--drift": `${t.drift}px`,
                animationDelay: `${t.delay}s`,
                animationDuration: `${t.dur}s`,
              }}
            >
              {t.emoji}
            </span>
          ))}

        {/* 레인(동일 높이 행). 주자 그룹(동물+이름)을 레인 세로 중앙에 배치 →
            맨 아래 레인도 이름표가 트랙 밖으로 잘리지 않음. left 는 rAF 로 직접 제어. */}
        <div className="absolute inset-0 flex flex-col">
          {participants.map((p, i) => {
            const isWinner = i === winnerIndex;
            const isLast = ranks[i] === lastRank && n > 1;
            return (
              <div key={p.user_id} className="relative flex-1">
                <div
                  ref={(el) => {
                    runnerRefs.current[i] = el;
                  }}
                  className="runner absolute flex flex-col items-center"
                  style={{
                    top: "50%",
                    left: `${START_PAD}px`,
                    width: `${size}px`,
                    transform: "translateY(-50%)",
                    zIndex: isWinner ? 20 : 10,
                  }}
                >
                  <div className="relative flex items-center justify-center">
                    {/* 순위 배지 (동물 왼쪽) */}
                    <span
                      className="absolute right-full mr-1 font-black tabular-nums"
                      style={{
                        fontSize: `${Math.round(size * 0.42)}px`,
                        opacity: ranked ? 1 : 0,
                        transform: ranked ? "scale(1)" : "scale(0.5)",
                        transition: "opacity 0.35s ease, transform 0.35s ease",
                        color: isWinner ? "#f5c542" : isLast ? "#ff5a5a" : "#ffffff",
                        textShadow: isWinner ? "0 0 12px rgba(245,197,66,0.9)" : "none",
                      }}
                    >
                      {ranks[i]}
                    </span>
                    {/* 동물 (스케일/발광은 래퍼, 통통 튀는 bob 은 안쪽 span) */}
                    <span
                      className="block"
                      style={{
                        transform: ranked && isWinner ? "scale(1.18)" : "scale(1)",
                        transition: "transform 0.4s ease",
                        filter:
                          ranked && isWinner
                            ? "drop-shadow(0 0 10px #f5c542) drop-shadow(0 0 20px rgba(245,197,66,0.6))"
                            : ranked && isLast
                            ? "grayscale(0.4)"
                            : "none",
                      }}
                    >
                      <span
                        className="animal block leading-none"
                        style={{ fontSize: `${size}px` }}
                      >
                        {animals[i]}
                      </span>
                    </span>
                  </div>
                  {/* 이름표 (레인 안, 동물 아래 흐름 배치 → 잘림 없음) */}
                  <span
                    className="mt-0.5 max-w-[5rem] truncate text-center text-[10px] leading-tight"
                    style={{
                      color: isWinner && ranked ? "#f5c542" : "rgba(255,255,255,0.5)",
                      fontWeight: isWinner && ranked ? 800 : 500,
                    }}
                  >
                    {p.display_name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-center text-sm text-white/50">
        {ranked
          ? "결승선 통과! 1등의 주인공은…! 🏆"
          : "엎치락뒤치락… 누가 1등으로 골인할까? 🏁"}
      </p>

      <style jsx>{`
        .animal {
          animation: bob 0.4s ease-in-out infinite;
        }
        @keyframes bob {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-3px);
          }
        }
        .treat {
          animation-name: treatfall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform, opacity;
        }
        @keyframes treatfall {
          0% {
            transform: translate(0, 0) rotate(0deg);
            opacity: 0;
          }
          12% {
            opacity: 0.9;
          }
          85% {
            opacity: 0.9;
          }
          100% {
            transform: translate(var(--drift), 62vh) rotate(220deg);
            opacity: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .animal {
            animation: none;
          }
          .treat {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
