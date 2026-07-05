"use client";

import Avatar from "@/components/Avatar";
import { PENALTY_OUTFITS } from "@/lib/constants";
import type { PenaltyOutfit, PenaltyParticipant } from "@/lib/types";

// 당첨 공개 카드: 당첨자 + 이번 벌칙 옷 사진.
export default function PenaltyReveal({
  winner,
  outfit,
}: {
  winner: PenaltyParticipant;
  outfit: PenaltyOutfit;
}) {
  const meta = PENALTY_OUTFITS[outfit];
  return (
    <div className="mx-auto flex w-full max-w-sm animate-[pop_0.5s_ease] flex-col items-center text-center">
      <div className="flex items-center gap-3">
        <Avatar
          url={winner.avatar_url}
          name={winner.display_name}
          color="#f5c542"
          size={56}
        />
        <div className="text-left">
          <p className="text-sm text-white/60">벌칙 당첨</p>
          <p className="text-3xl font-black">{winner.display_name}</p>
        </div>
      </div>

      <p className="mt-4 text-lg font-bold text-gold">
        → {meta.emoji} {meta.label} 옷!
      </p>

      <div className="mt-3 overflow-hidden rounded-2xl border-2 border-gold/60 bg-black/40 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={meta.img}
          alt={`${meta.label} 벌칙 옷`}
          draggable={false}
          className="max-h-[38vh] w-auto select-none object-contain"
        />
      </div>

      <p className="mt-3 text-sm text-white/50">
        여행 내내 이 옷을 입어야 합니다 😈
      </p>

      <style jsx>{`
        @keyframes pop {
          0% {
            transform: scale(0.7);
            opacity: 0;
          }
          60% {
            transform: scale(1.05);
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
