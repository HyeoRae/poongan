"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEventLobby, useLobbyPresence } from "@/lib/hooks";
import {
  closeEventLobby,
  startDraw,
  setLobbyActivity,
} from "@/app/(app)/admin/actions";
import {
  startPenaltyDraw,
  openPenaltyLobby,
} from "@/app/(app)/admin/penaltyActions";
import {
  PENALTY_OUTFITS,
  PENALTY_STYLES,
  RACE_SLOTS_MIN,
  RACE_SLOTS_MAX,
} from "@/lib/constants";
import Avatar from "@/components/Avatar";
import type {
  EventLobby as EventLobbyState,
  LobbyPresence,
  PenaltyOutfit,
  PenaltyStyle,
} from "@/lib/types";

// 🛎️ 공용 이벤트 대기실 오버레이 — 레이아웃에 항상 마운트되어 있고,
// 관리자가 열면(status='open') 접속자 전원 화면에 전체화면으로 뜬다.
// 지금 접속(시청) 중인 사람들의 프로필이 Presence 로 실시간으로 채워지고,
// 다 모이면 관리자가 대기실 안에서 다음 활동(팀 배정식·퀴즈쇼·벌칙 뽑기)을 골라 시작한다.
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
  const router = useRouter();

  const [pending, setPending] = useState(false);
  const [menu, setMenu] = useState<"root" | "penalty">("root");
  const [outfit, setOutfit] = useState<PenaltyOutfit | null>(null);
  const [style, setStyle] = useState<PenaltyStyle>("plinko");
  const [slots, setSlots] = useState(4);

  // 🧠 퀴즈쇼 신호가 오면 전원(관리자 포함) /quiz 로 이동. 이동 후 오버레이는 스스로 숨는다.
  useEffect(() => {
    if (lobby.status === "open" && lobby.activity === "quiz") {
      router.push("/quiz");
    }
  }, [lobby.status, lobby.activity, router]);

  if (lobby.status !== "open") return null;
  // 퀴즈로 전환된 상태 — 위 effect 가 이동을 처리하므로 화면을 덮지 않는다.
  if (lobby.activity === "quiz") return null;

  // 사회자 먼저, 그다음 이름순
  const sorted = [...members].sort((a, b) => {
    if (a.is_admin !== b.is_admin) return a.is_admin ? -1 : 1;
    return a.display_name.localeCompare(b.display_name, "ko");
  });
  const cols = sorted.length <= 4 ? 2 : sorted.length <= 9 ? 3 : 4;

  // 공통 실행 래퍼 — 마지막 액션의 결과가 실패면 알림. 여러 단계는 fn 안에서 조합.
  async function run(fn: () => Promise<{ ok: boolean; message: string } | void>) {
    if (pending) return;
    setPending(true);
    const r = await fn();
    setPending(false);
    if (r && !r.ok && r.message) alert(r.message);
  }

  // 🎲 팀 배정식 — 배정식 오버레이가 뜨도록 시작 후 대기실을 닫는다.
  // 개시한 관리자 본인은 realtime 에코를 기다리지 않고 refresh 로 즉시 전환(낙관적).
  function launchDraw() {
    if (!confirm("팀 배정식을 시작할까요? 접속한 모두의 화면에 배정식이 뜹니다.")) return;
    run(async () => {
      const r = await startDraw();
      if (!r.ok) return r;
      const c = await closeEventLobby();
      if (c.ok) router.refresh();
      return c;
    });
  }

  // 🧠 퀴즈쇼 — 신호를 켜면 전원이 /quiz 로 이동.
  // refresh 로 레이아웃(대기실 initial)을 다시 받아 activity='quiz' 를 반영하면,
  // 위 라우팅 effect 가 관리자·참가자 모두를 /quiz 로 이동시킨다.
  // (같은 (app) 레이아웃 내 push 만으로는 initial 이 갱신되지 않아 오버레이가 남는다)
  function launchQuiz() {
    run(async () => {
      const r = await setLobbyActivity("quiz");
      if (r.ok) router.refresh();
      return r;
    });
  }

  // 🎭 벌칙 뽑기 — 옷/연출 골라 시작 후 대기실을 닫아 벌칙 오버레이로 전환.
  function launchPenalty() {
    if (!outfit) return;
    run(async () => {
      const r =
        style === "race"
          ? await openPenaltyLobby(outfit, slots)
          : await startPenaltyDraw(outfit, style);
      if (!r.ok) return r;
      const c = await closeEventLobby();
      if (c.ok) router.refresh();
      return c;
    });
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
      <div className="max-h-[52vh] overflow-y-auto px-5 pb-7 pt-3">
        {!isAdmin ? (
          <p className="text-center text-sm text-white/40">
            사회자가 곧 시작합니다 🎤
          </p>
        ) : menu === "root" ? (
          <div className="space-y-2">
            <p className="mb-1 text-center text-xs font-bold text-white/50">
              다 모였으면 무엇을 할까요?
            </p>
            <div className="grid grid-cols-3 gap-2">
              <LaunchBtn emoji="🎲" label="팀 배정식" onClick={launchDraw} disabled={pending} />
              <LaunchBtn emoji="🧠" label="퀴즈쇼" onClick={launchQuiz} disabled={pending} />
              <LaunchBtn
                emoji="🎭"
                label="벌칙 뽑기"
                onClick={() => setMenu("penalty")}
                disabled={pending}
              />
            </div>
            <button
              onClick={() =>
                run(async () => {
                  const r = await closeEventLobby();
                  if (r.ok) router.refresh();
                  return r;
                })
              }
              disabled={pending}
              className="w-full rounded-xl border border-border py-2.5 text-sm font-bold text-white/60 disabled:opacity-50"
            >
              그냥 닫기 (활동 없이)
            </button>
          </div>
        ) : (
          // 🎭 벌칙 뽑기 — 옷/연출 선택
          <div className="space-y-3">
            <p className="text-xs font-bold text-white/60">1. 이번 벌칙 옷</p>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(PENALTY_OUTFITS) as PenaltyOutfit[]).map((k) => {
                const o = PENALTY_OUTFITS[k];
                const on = outfit === k;
                return (
                  <button
                    key={k}
                    onClick={() => setOutfit(k)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl border py-2 text-xs font-bold transition-colors ${
                      on ? "border-gold bg-gold/20 text-gold" : "border-border text-white/60"
                    }`}
                  >
                    <span className="text-lg">{o.emoji}</span>
                    {o.label}
                  </button>
                );
              })}
            </div>

            <p className="text-xs font-bold text-white/60">2. 뽑기 연출</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PENALTY_STYLES) as PenaltyStyle[]).map((k) => {
                const s = PENALTY_STYLES[k];
                const on = style === k;
                return (
                  <button
                    key={k}
                    onClick={() => setStyle(k)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl border py-2 text-xs font-bold transition-colors ${
                      on ? "border-gold bg-gold/20 text-gold" : "border-border text-white/60"
                    }`}
                  >
                    <span className="text-lg">{s.emoji}</span>
                    {s.label}
                  </button>
                );
              })}
            </div>

            {style === "race" && (
              <>
                <p className="text-xs font-bold text-white/60">3. 참가 인원(동물 수)</p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSlots((s) => Math.max(RACE_SLOTS_MIN, s - 1))}
                    disabled={slots <= RACE_SLOTS_MIN}
                    className="h-10 w-10 rounded-xl border border-border text-xl font-black disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="min-w-[3.5rem] text-center text-2xl font-black tabular-nums">
                    {slots}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSlots((s) => Math.min(RACE_SLOTS_MAX, s + 1))}
                    disabled={slots >= RACE_SLOTS_MAX}
                    className="h-10 w-10 rounded-xl border border-border text-xl font-black disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setMenu("root")}
                disabled={pending}
                className="rounded-xl border border-border px-4 py-3 text-sm font-bold text-white/60 disabled:opacity-50"
              >
                뒤로
              </button>
              <button
                onClick={launchPenalty}
                disabled={pending || !outfit}
                className="flex-1 rounded-xl bg-gold py-3 font-black text-black disabled:opacity-50"
              >
                {style === "race" ? `🐾 대기실 열기 (${slots}마리)` : "🎬 벌칙 뽑기 시작"}
              </button>
            </div>
          </div>
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

// 대기실 활동 시작 버튼(큰 이모지 + 라벨)
function LaunchBtn({
  emoji,
  label,
  onClick,
  disabled,
}: {
  emoji: string;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 rounded-2xl bg-gold py-3 font-black text-black disabled:opacity-50"
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-sm">{label}</span>
    </button>
  );
}
