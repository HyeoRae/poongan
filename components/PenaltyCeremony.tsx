"use client";

import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { usePenaltyState } from "@/lib/hooks";
import {
  closePenalty,
  confirmPenaltyPick,
  rerollPenalty,
  startPenaltyRace,
} from "@/app/(app)/admin/penaltyActions";
import { PENALTY_OUTFITS, PENALTY_STYLES } from "@/lib/constants";
import RaceTrack from "@/components/penalty/RaceTrack";
import Plinko from "@/components/penalty/Plinko";
import SlotReel from "@/components/penalty/SlotReel";
import PenaltyLobby from "@/components/penalty/PenaltyLobby";
import PenaltyReveal from "@/components/penalty/PenaltyReveal";
import type { PenaltyState } from "@/lib/types";

export default function PenaltyCeremony({
  isAdmin,
  myUserId,
  initial,
}: {
  isAdmin: boolean;
  myUserId: string;
  initial: PenaltyState;
}) {
  const penalty = usePenaltyState(initial);
  const { status, style, outfit, participants, seed, lobby } = penalty;
  const total = participants?.length ?? 0;
  const winnerIndex = Math.min(Math.max(0, penalty.winner_index), Math.max(0, total - 1));

  const [phase, setPhase] = useState<"anim" | "reveal">(
    status === "revealed" ? "reveal" : "anim"
  );
  const [pending, setPending] = useState(false);

  async function act(fn: () => Promise<{ ok: boolean; message: string }>) {
    if (pending) return;
    setPending(true);
    const r = await fn();
    setPending(false);
    if (!r.ok && r.message) alert(r.message);
  }

  // 새 라운드/다시뽑기(seed 변경) → 애니메이션 재생. 안전망 타이머로 reveal 강제.
  // (idle/lobby 에는 연출/타이머 없음)
  useEffect(() => {
    if (status === "idle" || status === "lobby") return;
    setPhase(status === "revealed" ? "reveal" : "anim");
    // 구슬 레이스(≈최대 20초)·동물 달리기(≈11초) 총 연출보다 넉넉히 긴 안전망(연출이 끊기면 안 됨).
    const safety = setTimeout(() => setPhase("reveal"), 22000);
    return () => clearTimeout(safety);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  // 관리자가 확정하면 전원 reveal 로
  useEffect(() => {
    if (status === "revealed") setPhase("reveal");
  }, [status]);

  // reveal 진입 시 축포 (실제 결과 공개 때만 — 대기실/idle 제외)
  useEffect(() => {
    if (phase === "reveal" && (status === "running" || status === "revealed"))
      burst();
  }, [phase, status]);

  // 대기실: 참가자 동물 선택 화면 (동물 달리기 전용)
  if (status === "lobby") {
    const meta = outfit ? PENALTY_OUTFITS[outfit] : null;
    const claimed = lobby.filter((s) => s.user_id).length;
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#08080d]/98 backdrop-blur-sm">
        <div className="flex items-center justify-between px-5 pt-5">
          <h1 className="text-lg font-black text-gold">🐾 동물 달리기 대기실</h1>
          {meta && (
            <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-sm font-bold text-gold">
              {meta.emoji} {meta.label}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col justify-center overflow-y-auto px-4 py-3">
          <p className="mb-3 text-center text-sm text-white/50">
            달릴 동물을 고르면 레이스에 참가 · 선택 {claimed}/{lobby.length}
          </p>
          <PenaltyLobby lobby={lobby} myUserId={myUserId} />
        </div>
        <div className="px-5 pb-7 pt-3">
          {isAdmin ? (
            <div className="space-y-2">
              <button
                onClick={() => act(startPenaltyRace)}
                disabled={pending || claimed < 2}
                className="w-full rounded-xl bg-gold py-3.5 text-lg font-black text-black disabled:opacity-50"
              >
                🏁 레이스 시작 {claimed < 2 ? "(2명 이상 필요)" : `· ${claimed}명`}
              </button>
              <button
                onClick={() => act(closePenalty)}
                disabled={pending}
                className="w-full rounded-xl border border-border py-2.5 text-sm font-bold text-white/70 disabled:opacity-50"
              >
                닫기
              </button>
            </div>
          ) : (
            <p className="text-center text-sm text-white/40">
              사회자가 곧 레이스를 시작합니다 🎤
            </p>
          )}
        </div>
      </div>
    );
  }

  if (status === "idle" || !style || !outfit || total === 0) return null;

  const winner = participants[winnerIndex];
  const outfitMeta = PENALTY_OUTFITS[outfit];
  const styleMeta = PENALTY_STYLES[style];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#08080d]/98 backdrop-blur-sm">
      {/* 헤더 — 이번 벌칙 옷 */}
      <div className="flex items-center justify-between px-5 pt-5">
        <h1 className="text-lg font-black text-gold">🎭 벌칙 뽑기</h1>
        <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-sm font-bold text-gold">
          {outfitMeta.emoji} {outfitMeta.label}
        </span>
      </div>

      {/* 본문 */}
      <div className="flex flex-1 flex-col justify-center overflow-hidden px-4">
        {phase === "reveal" && winner ? (
          <PenaltyReveal winner={winner} outfit={outfit} />
        ) : (
          <>
            <p className="mb-3 text-center text-sm text-white/50">
              {styleMeta.emoji} {styleMeta.label} · 후보 {total}명
            </p>
            {style === "race" && (
              <RaceTrack
                key={seed}
                participants={participants}
                winnerIndex={winnerIndex}
                seed={seed}
                onDone={() => setPhase("reveal")}
              />
            )}
            {style === "plinko" && (
              <Plinko
                key={seed}
                participants={participants}
                winnerIndex={winnerIndex}
                seed={seed}
                onDone={() => setPhase("reveal")}
              />
            )}
            {style === "slot" && (
              <SlotReel
                key={seed}
                participants={participants}
                winnerIndex={winnerIndex}
                seed={seed}
                onDone={() => setPhase("reveal")}
              />
            )}
          </>
        )}
      </div>

      {/* 관리자 제어 / 참가자 안내 */}
      <div className="px-5 pb-7 pt-3">
        {isAdmin ? (
          status === "revealed" ? (
            <button
              onClick={() => act(closePenalty)}
              disabled={pending}
              className="w-full rounded-xl bg-gold py-3.5 text-lg font-black text-black disabled:opacity-50"
            >
              닫기
            </button>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => act(confirmPenaltyPick)}
                disabled={pending}
                className="w-full rounded-xl bg-gold py-3.5 text-lg font-black text-black disabled:opacity-50"
              >
                ✅ 이 사람으로 확정
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => act(rerollPenalty)}
                  disabled={pending}
                  className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold disabled:opacity-50"
                >
                  🔁 다시 뽑기
                </button>
                <button
                  onClick={() => act(closePenalty)}
                  disabled={pending}
                  className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-white/70 disabled:opacity-50"
                >
                  닫기
                </button>
              </div>
            </div>
          )
        ) : (
          <p className="text-center text-sm text-white/40">
            {phase === "reveal"
              ? "결과가 나왔습니다! 🎉"
              : "사회자가 벌칙을 뽑는 중… 🎤"}
          </p>
        )}
      </div>
    </div>
  );
}

function burst() {
  confetti({
    particleCount: 80,
    spread: 75,
    origin: { y: 0.4 },
    colors: ["#f5c542", "#ffffff", "#ff5a5a"],
  });
}
