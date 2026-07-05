"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import type { PenaltyParticipant } from "@/lib/types";

// 🎰 룰렛 회전 (러시안 룰렛 풍): 참가자 아바타가 3D 실린더로 둘러서고,
// 빠르게 돌다 감속하며 당첨자를 정면(총구 앞)에 정지시킨다.
const FACE = 60; // 아바타 지름(px)
const SPIN_MS = 4200;

export default function SlotReel({
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
  const step = 360 / n;
  const radius = useMemo(() => {
    if (n < 2) return 0;
    const r = FACE / 2 / Math.tan(Math.PI / n);
    return Math.max(96, Math.round(r));
  }, [n, step]);

  // 정면(0°)에 당첨자가 오도록: R = 360*k - winnerIndex*step
  const finalRot = 360 * 4 - winnerIndex * step;
  const [rot, setRot] = useState(0);
  const [stopped, setStopped] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // 동작 줄이기(reduce)여도 회전을 통째로 스킵하지 않고 짧게(0.45배) 돌린다.
  const [reduce] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  const spinMs = Math.round(SPIN_MS * (reduce ? 0.45 : 1));

  useEffect(() => {
    // 회전 트리거: 초기 각(0°)이 먼저 페인트된 뒤 최종 각으로 트랜지션이 걸리도록 더블 rAF 사용.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setRot(finalRot));
    });
    const stop = setTimeout(() => setStopped(true), spinMs + 80);
    const end = setTimeout(() => doneRef.current?.(), spinMs + 600);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(stop);
      clearTimeout(end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center">
      <div
        className="relative flex items-center justify-center"
        style={{ height: radius * 2 + FACE + 40, perspective: 800 }}
      >
        {/* 총구/조준 레티클 (정면 고정) */}
        <div className="pointer-events-none absolute z-30 text-5xl" style={{ top: 4 }}>
          🎯
        </div>

        <div
          className="relative"
          style={{
            width: FACE,
            height: FACE,
            transformStyle: "preserve-3d",
            transform: `rotateX(-10deg) rotateY(${rot}deg)`,
            transition: stopped
              ? "none"
              : `transform ${spinMs}ms cubic-bezier(0.12,0.7,0.15,1)`,
          }}
        >
          {participants.map((p, i) => {
            const isWinner = i === winnerIndex;
            return (
              <div
                key={p.user_id}
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `rotateY(${i * step}deg) translateZ(${radius}px)`,
                }}
              >
                <div
                  className={`rounded-full ${
                    stopped && isWinner ? "ring-4 ring-gold" : ""
                  }`}
                  style={{
                    boxShadow:
                      stopped && isWinner ? "0 0 34px #f5c542" : "none",
                    transform: stopped && isWinner ? "scale(1.25)" : "scale(1)",
                    transition: "transform 0.4s ease, box-shadow 0.4s ease",
                  }}
                >
                  <Avatar
                    url={p.avatar_url}
                    name={p.display_name}
                    color="#f5c542"
                    size={FACE}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-center text-sm text-white/50">
        {stopped ? "총구가 겨눈 사람은…! 🔫" : "실린더가 돈다… 🎰"}
      </p>
    </div>
  );
}
