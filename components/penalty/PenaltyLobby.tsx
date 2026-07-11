"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PenaltyLobbySlot } from "@/lib/types";

// 🐾 동물 달리기 대기실: 참가자가 동물을 선착순으로 선택.
// 한 동물당 한 명 — 선택되면 어두워지고 아래에 고른 사람 이름 표시.
// 선점/해제는 penalty_claim_animal RPC(행 잠금) 로만 → 동시성 안전.
export default function PenaltyLobby({
  lobby,
  myUserId,
}: {
  lobby: PenaltyLobbySlot[];
  myUserId: string;
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const iPicked = lobby.some((s) => s.user_id === myUserId);
  const cols = lobby.length <= 4 ? 2 : lobby.length <= 9 ? 3 : 4;

  async function claim(slot: number, takenByOther: boolean) {
    if (pending || takenByOther) return; // 남이 고른 건 못 고름
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("penalty_claim_animal", { p_slot: slot });
    setPending(false);
    if (error) {
      alert(error.message);
      return;
    }
    // realtime 프레임을 놓쳐도 내 선택이 즉시 화면에 반영되도록 서버 상태 재조회(폴백)
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
      >
        {lobby.map((s, i) => {
          const taken = !!s.user_id;
          const mine = s.user_id === myUserId;
          const takenByOther = taken && !mine;
          return (
            <button
              key={i}
              disabled={pending || takenByOther}
              onClick={() => claim(i, takenByOther)}
              className={`flex flex-col items-center justify-center gap-1 rounded-2xl border p-2 transition-colors ${
                mine
                  ? "border-gold bg-gold/15"
                  : taken
                  ? "border-border bg-white/[0.03]"
                  : "border-border bg-white/5 active:bg-white/10"
              } ${takenByOther ? "cursor-default" : ""}`}
              style={{ aspectRatio: "1 / 1" }}
            >
              <span
                className="leading-none"
                style={{
                  fontSize: cols === 4 ? "30px" : "38px",
                  opacity: takenByOther ? 0.4 : 1,
                  filter: takenByOther ? "grayscale(0.6)" : "none",
                }}
              >
                {s.animal}
              </span>
              <span
                className="max-w-full truncate text-[11px] font-bold leading-tight"
                style={{
                  color: mine
                    ? "#f5c542"
                    : taken
                    ? "rgba(255,255,255,0.6)"
                    : "rgba(255,255,255,0.35)",
                }}
              >
                {mine ? "나 ✓" : taken ? s.display_name : "비어있음"}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-center text-sm text-white/60">
        {iPicked
          ? "선택 완료! 사회자가 시작하면 출발해요 🏁"
          : "달릴 동물을 하나 골라주세요 🐾 (선착순!)"}
      </p>
    </div>
  );
}
