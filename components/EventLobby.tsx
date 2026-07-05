"use client";

import { useState } from "react";
import { useEventLobby, useLobbyPresence } from "@/lib/hooks";
import { closeEventLobby } from "@/app/(app)/admin/actions";
import Avatar from "@/components/Avatar";
import type { EventLobby as EventLobbyState, LobbyPresence } from "@/lib/types";

// 🛎️ 공용 이벤트 대기실 오버레이 — 레이아웃에 항상 마운트되어 있고,
// 관리자가 열면(status='open') 접속자 전원 화면에 전체화면으로 뜬다.
// 지금 접속(시청) 중인 사람들의 프로필이 Presence 로 실시간으로 채워진다.
export default function EventLobby({
  isAdmin,
  me,
  initial,
}: {
  isAdmin: boolean;
  me: LobbyPresence;
  initial: EventLobbyState;
}) {
  const lobby = useEventLobby(initial);
  const members = useLobbyPresence(me); // 닫혀 있어도 항상 추적 → 열리는 즉시 로스터 채워짐
  const [pending, setPending] = useState(false);

  if (lobby.status !== "open") return null;

  // 사회자 먼저, 그다음 이름순
  const sorted = [...members].sort((a, b) => {
    if (a.is_admin !== b.is_admin) return a.is_admin ? -1 : 1;
    return a.display_name.localeCompare(b.display_name, "ko");
  });
  const cols = sorted.length <= 4 ? 2 : sorted.length <= 9 ? 3 : 4;

  async function close() {
    if (pending) return;
    setPending(true);
    const r = await closeEventLobby();
    setPending(false);
    if (!r.ok && r.message) alert(r.message);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#08080d]/98 backdrop-blur-sm">
      {/* 헤더 */}
      <div className="px-5 pt-6 text-center">
        <h1 className="text-xl font-black text-gold">🛎️ 대기실</h1>
        <p className="mt-1 text-sm text-white/60">
          {lobby.title?.trim()
            ? lobby.title
            : "잠시 후 시작합니다 — 다들 모여주세요!"}
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-sm font-bold text-gold">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
          </span>
          {sorted.length}명 접속 중
        </p>
      </div>

      {/* 접속자 로스터 */}
      <div className="flex flex-1 items-center overflow-y-auto px-4 py-4">
        <div
          className="mx-auto grid w-full max-w-md gap-3"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
        >
          {sorted.map((m) => {
            const mine = m.user_id === me.user_id;
            return (
              <div
                key={m.user_id}
                className={`flex animate-[lobbyPop_0.4s_ease] flex-col items-center gap-1.5 rounded-2xl border p-3 ${
                  mine ? "border-gold bg-gold/10" : "border-border bg-white/5"
                }`}
              >
                <Avatar
                  url={m.avatar_url}
                  name={m.display_name}
                  color={m.is_admin ? "#f5c542" : null}
                  size={cols === 4 ? 44 : 56}
                />
                <span className="max-w-full truncate text-xs font-bold">
                  {mine ? "나" : m.display_name}
                </span>
                {m.is_admin && (
                  <span className="text-[10px] font-bold text-gold">사회자</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 관리자 제어 / 참가자 안내 */}
      <div className="px-5 pb-7 pt-3">
        {isAdmin ? (
          <button
            onClick={close}
            disabled={pending}
            className="w-full rounded-xl bg-gold py-3.5 text-lg font-black text-black disabled:opacity-50"
          >
            대기실 닫고 시작하기
          </button>
        ) : (
          <p className="text-center text-sm text-white/40">
            사회자가 곧 시작합니다 🎤
          </p>
        )}
      </div>

      <style jsx global>{`
        @keyframes lobbyPop {
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
