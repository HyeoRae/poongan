"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import CoinStage from "./CoinStage";
import DiceStage from "./DiceStage";
import WheelStage from "./WheelStage";

// 서버가 이미 정한 결과를 향해 감속 착지하는 도박 리빌 오버레이.
// 게임 로직/RPC 변경 없이 프레젠테이션만 담당한다. (SlotReel/DrawCeremony 패턴 재사용)

export type RevealData = {
  game: "coin" | "dice" | "roulette";
  bet: number;
  choice: string;
  label: string; // "앞면" / "3" / "1-5" / "홀" ...
  result: {
    win: boolean;
    balance: number;
    outcome?: "front" | "back";
    roll?: number;
    mult: number;
    text: string; // 커밋 히스토리 라인(현행 그대로)
  } | null; // null = RPC 진행 중
};

const MIN_SPIN_MS = 900; // 즉답 RPC 라도 최소 이만큼은 돌린다
const SPIN_DUR_MS = 12000; // 등속 프리스핀 런웨이(결과는 보통 훨씬 먼저 옴)
const SPIN_TURNS = 24; // 프리스핀이 향하는 총 회전수 → 등속(≈720°/s)
const DICE_X_TURNS = 18; // 주사위 X축은 다른 속도로(불규칙한 텀블)
const LAND_MS = 1500; // 감속 착지 시간
const SETTLE_MS = 220; // 정지 후 리빌까지
const AUTO_CLOSE_MS = 2600; // 결과 노출 후 자동 닫힘
const EXTRA_TURNS = 4; // 착지 시 추가 회전(드라마)
const REDUCE = 0.45; // 동작 줄이기 배속

const ceilTurns = (x: number) => Math.ceil(x / 360) * 360;

// 눈(roll)을 정면으로 가져오는 최종 오프셋 (해당 면 배치의 역회전)
const DICE_Y: Record<number, number> = { 1: 0, 3: -90, 4: 90, 6: 180 };
const DICE_X: Record<number, number> = { 2: -90, 5: 90 };

export default function GambleReveal({
  data,
  muted,
  onToggleMute,
  onDone,
}: {
  data: RevealData;
  muted: boolean;
  onToggleMute: () => void;
  onDone: () => void;
}) {
  const [reduce] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  const spinMs = Math.round(SPIN_DUR_MS * (reduce ? REDUCE : 1));
  const landMs = Math.round(LAND_MS * (reduce ? REDUCE : 1));
  const minSpin = reduce ? 400 : MIN_SPIN_MS;
  const extraTurns = reduce ? 1 : EXTRA_TURNS;

  const [phase, setPhase] = useState<"spinning" | "landing" | "result">("spinning");
  const [rx, setRx] = useState(0);
  const [ry, setRy] = useState(0);
  const [rot, setRot] = useState(0);
  const [landing, setLanding] = useState(false);

  const t0 = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const firedRef = useRef(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (interval.current) clearInterval(interval.current);
    interval.current = null;
  }, []);

  const finish = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    clearTimers();
    doneRef.current();
  }, [clearTimers]);

  // 마운트: 오디오 언락 + 등속 프리스핀 + 스핀 틱 + 세이프티
  useEffect(() => {
    t0.current = performance.now();
    primeAudio();
    const game = data.game;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (game === "coin") setRx(SPIN_TURNS * 360);
        else if (game === "dice") {
          setRx(DICE_X_TURNS * 360);
          setRy(SPIN_TURNS * 360);
        } else setRot(SPIN_TURNS * 360);
      });
    });
    interval.current = setInterval(() => beep(220, 0.03, mutedRef.current), 110);
    timers.current.push(setTimeout(finish, SPIN_DUR_MS)); // 결과가 영영 안 오면 닫기
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 결과 도착 → 최소 스핀 채운 뒤 감속 착지
  useEffect(() => {
    if (!data.result || phase !== "spinning") return;
    const wait = Math.max(0, minSpin - (performance.now() - t0.current));
    timers.current.push(setTimeout(startLanding, wait));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.result]);

  function startLanding() {
    const res = data.result;
    if (!res) return;
    if (interval.current) {
      clearInterval(interval.current);
      interval.current = null;
    }
    const elapsed = performance.now() - t0.current;
    const v = (SPIN_TURNS * 360) / spinMs; // 주 축 각속도(deg/ms)
    const vx = (DICE_X_TURNS * 360) / spinMs;
    const cur = Math.min(SPIN_TURNS * 360, v * elapsed);
    const curX = Math.min(DICE_X_TURNS * 360, vx * elapsed);

    if (data.game === "coin") {
      const offset = res.outcome === "back" ? 180 : 0; // 앞=짝수 반바퀴, 뒤=홀수
      setRx(ceilTurns(cur + extraTurns * 360) + offset);
    } else if (data.game === "dice") {
      const roll = res.roll ?? 1;
      if (roll in DICE_Y) {
        setRy(ceilTurns(cur + extraTurns * 360) + DICE_Y[roll]);
        setRx(ceilTurns(curX)); // 다른 축은 평평하게
      } else {
        setRx(ceilTurns(curX + extraTurns * 360) + DICE_X[roll]);
        setRy(ceilTurns(cur));
      }
    } else {
      const roll = res.roll ?? 1;
      setRot(ceilTurns(cur + extraTurns * 360) - (roll - 1) * 36);
    }

    setLanding(true);
    setPhase("landing");
    beep(300, 0.06, mutedRef.current); // 감속 시작 whoosh
    timers.current.push(setTimeout(onStopped, landMs + SETTLE_MS));
  }

  function onStopped() {
    const res = data.result;
    if (!res) return;
    setPhase("result");

    const highMult = res.mult >= 6; // 주사위 6배 · 룰렛 숫자 10배
    beep(140, 0.2, mutedRef.current);
    timers.current.push(setTimeout(() => beep(180, 0.12, mutedRef.current), 90));

    if (res.win) {
      [523, 659, 784, 1047].forEach((f, i) =>
        timers.current.push(setTimeout(() => beep(f, 0.15, mutedRef.current), 120 + i * 90))
      );
      if (highMult)
        timers.current.push(setTimeout(() => beep(1319, 0.25, mutedRef.current), 120 + 4 * 90));
      vibrate(highMult ? [0, 80, 40, 160] : [0, 60, 40, 120], mutedRef.current);
      goldBurst();
      if (highMult) finaleConfetti();
    } else {
      timers.current.push(setTimeout(() => beep(200, 0.18, mutedRef.current), 40));
      timers.current.push(setTimeout(() => beep(150, 0.22, mutedRef.current), 240));
      vibrate(120, mutedRef.current);
    }

    timers.current.push(setTimeout(finish, AUTO_CLOSE_MS));
  }

  useEffect(() => () => clearTimers(), [clearTimers]);

  const res = data.result;
  const showResult = phase === "result" && !!res;
  const shake = showResult && !res!.win && !reduce;
  const transition = landing
    ? `transform ${landMs}ms cubic-bezier(0.12,0.7,0.15,1)`
    : `transform ${spinMs}ms linear`;

  const title =
    data.game === "coin" ? "🪙 동전던지기" : data.game === "dice" ? "🎲 주사위" : "🎡 룰렛";
  const spinCaption =
    data.game === "coin" ? "동전이 돈다…" : data.game === "dice" ? "주사위가 구른다…" : "룰렛이 돈다…";
  const netGain = res ? data.bet * (res.mult - 1) : 0; // 순증가액 = 잔액 변동과 일치

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#08080d]/98 backdrop-blur-sm"
      onClick={() => {
        if (phase !== "spinning") finish();
      }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 pt-5">
        <h1 className="text-lg font-black text-gold">{title}</h1>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute();
          }}
          className="rounded-full bg-white/10 px-3 py-1 text-sm"
          aria-label={muted ? "소리 켜기" : "소리 끄기"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </div>

      {/* 무대 */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-5">
        <div className="text-sm text-white/50">
          베팅 {data.bet.toLocaleString()} · {data.label}
        </div>

        <div className={`flex min-h-[248px] items-center ${shake ? "gamble-shake" : ""}`}>
          {data.game === "coin" && (
            <CoinStage rx={rx} transition={transition} stopped={showResult} win={!!res?.win} />
          )}
          {data.game === "dice" && (
            <DiceStage rx={rx} ry={ry} transition={transition} stopped={showResult} win={!!res?.win} />
          )}
          {data.game === "roulette" && (
            <WheelStage
              rot={rot}
              transition={transition}
              roll={res?.roll}
              choice={data.choice}
              stopped={showResult}
              win={!!res?.win}
            />
          )}
        </div>

        {showResult ? (
          <div
            className={`animate-[pop_0.4s_ease] rounded-xl px-5 py-3 text-center text-base font-bold ${
              res!.win
                ? "border border-green-500/40 bg-green-500/10 text-green-300"
                : "border border-red-500/40 bg-red-500/10 text-red-300"
            }`}
          >
            <div>
              {res!.win
                ? `🎉 ${res!.mult}배 당첨! +${netGain.toLocaleString()} 풍산토큰`
                : `💸 꽝  −${data.bet.toLocaleString()} 풍산토큰`}
            </div>
            <div className="mt-1 text-xs font-normal text-white/50">
              잔액 {res!.balance.toLocaleString()}
            </div>
          </div>
        ) : (
          <div className="text-lg font-bold text-white/70">{spinCaption}</div>
        )}
      </div>

      {/* 하단 안내 */}
      <div className="px-5 pb-7 pt-3 text-center text-xs text-white/30">
        {phase === "spinning" ? "결과를 기다리는 중…" : "화면을 탭하면 닫힙니다"}
      </div>

      <style jsx>{`
        .gamble-shake {
          animation: gamble-shake 0.4s ease;
        }
        @keyframes gamble-shake {
          0%,
          100% {
            transform: translateX(0);
          }
          20% {
            transform: translateX(-8px);
          }
          40% {
            transform: translateX(7px);
          }
          60% {
            transform: translateX(-5px);
          }
          80% {
            transform: translateX(3px);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .gamble-shake {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

// ---------- 헬퍼 (DrawCeremony 패턴 재사용) ----------
function goldBurst() {
  confetti({
    particleCount: 70,
    spread: 72,
    origin: { y: 0.42 },
    colors: ["#f5c542", "#ffffff", "#22c55e"],
  });
}

function finaleConfetti() {
  const end = Date.now() + 1200;
  (function frame() {
    confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0 }, colors: ["#f5c542", "#ffffff"] });
    confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1 }, colors: ["#f5c542", "#ffffff"] });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

function vibrate(pattern: number | number[], muted: boolean) {
  if (muted) return;
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* 미지원 — 무시 */
  }
}

// Web Audio 비프음 (음소거/자동재생 제약 시 무시)
let audioCtx: AudioContext | null = null;
function primeAudio() {
  try {
    audioCtx =
      audioCtx ??
      new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {
    /* 무시 */
  }
}
function beep(freq: number, dur: number, muted: boolean) {
  if (muted) return;
  try {
    audioCtx =
      audioCtx ??
      new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
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
