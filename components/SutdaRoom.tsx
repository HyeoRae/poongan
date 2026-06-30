"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSutdaRoom } from "@/lib/hooks";
import { cardImg, CARD_BACK, labelOf, isGusa } from "@/lib/sutda";
import SutdaRankGuide from "@/components/SutdaRankGuide";
import {
  act,
  startHand,
  timeout as timeoutAction,
  redeal,
  leaveRoom,
  closeRoom,
  getAllHands,
} from "@/app/(app)/sutda/actions";
import type { SutdaRoom, SutdaPlayer, SutdaHand } from "@/lib/types";

function Card({
  card,
  small,
  delayMs,
}: {
  card?: number | null;
  small?: boolean;
  delayMs?: number;
}) {
  const src = card ? cardImg(card) : CARD_BACK;
  const size = small ? "w-11 h-[66px]" : "w-16 h-24";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={card ? labelOf(card, card) : "뒷면"}
      className={`${size} rounded-md object-contain bg-black/20 ${
        delayMs !== undefined ? "sutda-deal" : ""
      }`}
      style={delayMs !== undefined ? { animationDelay: `${delayMs}ms` } : undefined}
    />
  );
}

export default function SutdaRoomView({
  me,
  room,
  players,
  seated,
  isSpectator,
  myHand,
}: {
  me: { id: string; isAdmin: boolean };
  room: SutdaRoom;
  players: (SutdaPlayer & { display_name?: string })[];
  seated: boolean;
  isSpectator: boolean;
  myHand: SutdaHand | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [revealAll, setRevealAll] = useState(false);
  const [allHands, setAllHands] = useState<Record<string, SutdaHand>>({});
  const [raiseAmt, setRaiseAmt] = useState("");

  useSutdaRoom(room.id, () => router.refresh());

  // 1초 틱
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 파생값
  const myPlayer = players.find((p) => p.user_id === me.id);
  const myCommitted = myPlayer?.committed ?? 0;
  const leavePending = !!myPlayer?.leave_pending;
  const isBetting = room.status === "betting";
  const isMyTurn = seated && isBetting && room.current_turn === me.id && !myPlayer?.folded;
  const callCost = Math.max(room.current_bet - myCommitted, 0);
  // 레이즈 프리셋(증가분)
  const potAfterCall = room.pot + callCost;
  const ppingInc = Math.max(room.ante, 1); // 삥 = 앤티
  const halfInc = Math.max(Math.floor(potAfterCall / 2), 1); // 하프 = 콜 후 팟의 절반
  const ttadangInc = Math.max(room.current_bet, 1); // 따당 = 현재 베팅의 2배
  const canRedeal =
    isMyTurn && !room.redeal_used && !!myHand && isGusa(myHand.card1, myHand.card2);

  const activeContenders = players
    .filter((p) => p.in_hand && p.is_active && !p.folded)
    .sort((a, b) => a.seat - b.seat);
  const curIdx = activeContenders.findIndex((p) => p.user_id === room.current_turn);
  const nextUser =
    activeContenders.length > 0 && curIdx >= 0
      ? activeContenders[(curIdx + 1) % activeContenders.length].user_id
      : null;
  const amNextToAct = nextUser === me.id && room.current_turn !== me.id;

  const activeCount = players.filter((p) => p.is_active).length;
  const isHost = room.created_by === me.id || me.isAdmin;
  const canStart =
    isHost && (room.status === "waiting" || room.status === "showdown") && activeCount >= 2;

  const secLeft =
    isBetting && room.turn_deadline
      ? Math.ceil((new Date(room.turn_deadline).getTime() - now) / 1000)
      : null;

  // 타임아웃 자가복구 — 다음 행동자가 우선 호출, 5초 더 지나면 아무 착석자나
  const firedRef = useRef<string>("");
  useEffect(() => {
    if (!isBetting || secLeft === null) return;
    const key = `${room.hand_no}:${room.current_turn}`;
    const shouldFire =
      secLeft <= 0 && (amNextToAct || (seated && room.current_turn !== me.id && secLeft <= -5));
    if (shouldFire && firedRef.current !== key) {
      firedRef.current = key;
      timeoutAction(room.id);
    }
  }, [secLeft, isBetting, amNextToAct, seated, room.current_turn, room.hand_no, room.id, me.id]);

  // 관리자 전체 패 보기
  useEffect(() => {
    if (!revealAll || !me.isAdmin) return;
    let alive = true;
    getAllHands(room.id, room.hand_no).then((hands) => {
      if (!alive) return;
      const map: Record<string, SutdaHand> = {};
      for (const h of hands) map[h.user_id] = h;
      setAllHands(map);
    });
    return () => {
      alive = false;
    };
  }, [revealAll, me.isAdmin, room.id, room.hand_no, room.status]);

  // 나가기 예약 → 판이 끝나면(베팅 종료) 실제로 나가고 로비로
  const leftRef = useRef(false);
  useEffect(() => {
    if (seated && leavePending && !isBetting && !leftRef.current) {
      leftRef.current = true;
      leaveRoom(room.id).finally(() => router.push("/sutda"));
    }
  }, [seated, leavePending, isBetting, room.id, router]);

  // 방 나가기: 판 중엔 예약 토글(머무름), 그 외엔 즉시 퇴장 후 로비로
  function handleLeave() {
    if (isBetting && myPlayer?.in_hand) {
      run(() => leaveRoom(room.id));
      return;
    }
    setMsg(null);
    startTransition(async () => {
      await leaveRoom(room.id);
      router.push("/sutda");
    });
  }

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setMsg(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setMsg(r.message);
    });
  }

  const winners = new Set<string>(
    room.last_result?.winners ??
      (room.last_result?.winner_id ? [room.last_result.winner_id] : [])
  );
  const isShowdown = room.status === "showdown";
  const secondDealt = isShowdown || room.betting_round >= 2;
  const myLabel =
    myHand && myHand.card2 != null ? labelOf(myHand.card1, myHand.card2) : null;

  const shown = players
    .filter((p) => p.is_active || p.in_hand)
    .sort((a, b) => a.seat - b.seat);
  const shownCount = shown.length;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-black">🃏 {room.name}</h1>
          <p className="text-xs text-white/50">
            앤티 {room.ante.toLocaleString()} · {room.hand_no > 0 ? `${room.hand_no}판째` : "대기 중"}
            {isBetting && (room.betting_round === 1 ? " · 1차 베팅" : " · 추가 베팅")}
            {isSpectator && " · 👁 참관 중"}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={() => setShowGuide(true)}
            className="rounded-xl border border-border px-3 py-2 text-sm"
          >
            📖 족보
          </button>
          <button
            onClick={() => router.push("/sutda")}
            className="rounded-xl border border-border px-3 py-2 text-sm"
          >
            목록
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {msg}
        </div>
      )}

      {/* 팟 / 상태 */}
      <div className="flex items-center justify-between rounded-2xl border border-gold/30 bg-gold/5 px-4 py-3">
        <div>
          <div className="text-[11px] text-white/50">팟</div>
          <div className="text-xl font-black text-gold">{room.pot.toLocaleString()}</div>
        </div>
        {isBetting && (
          <div className="text-right">
            <div className="text-[11px] text-white/50">현재 베팅</div>
            <div className="font-bold">{room.current_bet.toLocaleString()}</div>
          </div>
        )}
        {isBetting && secLeft !== null && (
          <div className="text-right">
            <div className="text-[11px] text-white/50">남은 시간</div>
            <div className={`font-black ${secLeft <= 5 ? "text-red-400" : ""}`}>
              {Math.max(secLeft, 0)}초
            </div>
          </div>
        )}
      </div>

      {/* 관리자 전체 패 보기 */}
      {me.isAdmin && (isBetting || isShowdown) && (
        <button
          onClick={() => setRevealAll((v) => !v)}
          className={`w-full rounded-xl border px-4 py-2 text-sm font-bold ${
            revealAll ? "border-gold bg-gold/10 text-gold" : "border-border text-white/70"
          }`}
        >
          {revealAll ? "🔓 전체 패 보는 중 (관리자)" : "🔓 전체 패 보기 (관리자)"}
        </button>
      )}

      {/* 플레이어 */}
      <div className="space-y-2">
        {shown.map((p, idx) => {
            const isMe = p.user_id === me.id;
            const isTurn = isBetting && room.current_turn === p.user_id;
            const isDealer = room.dealer === p.user_id;
            const won = isShowdown && winners.has(p.user_id);

            // 보여줄 카드 결정
            let c1: number | null = null;
            let c2: number | null = null;
            let label: string | null = null;
            let faceUp = false;
            if (isShowdown && p.revealed_card1 != null) {
              c1 = p.revealed_card1;
              c2 = p.revealed_card2;
              label = p.revealed_label;
              faceUp = true;
            } else if (isMe && myHand) {
              c1 = myHand.card1;
              c2 = myHand.card2;
              label = myLabel;
              faceUp = true;
            } else if (revealAll && allHands[p.user_id]) {
              c1 = allHands[p.user_id].card1;
              c2 = allHands[p.user_id].card2;
              label = c2 != null ? labelOf(c1, c2) : null;
              faceUp = true;
            }

            return (
              <div
                key={p.user_id}
                className={`flex items-center gap-3 rounded-2xl border p-3 ${
                  won
                    ? "border-gold bg-gold/10"
                    : isTurn
                    ? "border-gold/60 bg-gold/5"
                    : "border-border bg-card"
                } ${p.folded ? "opacity-50" : ""}`}
              >
                <div className="flex gap-1">
                  {p.in_hand ? (
                    <>
                      {/* 첫 장: 판 시작 때 깔림 */}
                      <Card
                        key={`${room.hand_no}-c0`}
                        card={faceUp ? c1 : null}
                        small
                        delayMs={(0 * shownCount + idx) * 120}
                      />
                      {/* 마지막 장: 추가 베팅(2차) 들어갈 때 한 장씩 깔림 */}
                      <div className={secondDealt ? "" : "opacity-25"}>
                        <Card
                          key={`${room.hand_no}-r${secondDealt ? 2 : 1}-c1`}
                          card={secondDealt && faceUp ? c2 : null}
                          small
                          delayMs={(1 * shownCount + idx) * 120}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex h-[66px] w-[88px] items-center justify-center rounded-md border border-dashed border-border text-[10px] text-white/30">
                      미참여
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-bold">{p.display_name}</span>
                    {isMe && <span className="text-[10px] text-gold">나</span>}
                    {isDealer && (
                      <span className="rounded bg-white/10 px-1 text-[10px] text-white/60">딜러</span>
                    )}
                    {won && <span className="text-[10px] font-bold text-gold">👑 승</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-white/50">
                    {p.folded ? (
                      <span className="text-red-300">다이</span>
                    ) : p.in_hand ? (
                      <>건 금액 {p.committed.toLocaleString()}</>
                    ) : (
                      "대기"
                    )}
                    {faceUp && label && (
                      <span className="ml-2 font-bold text-gold">{label}</span>
                    )}
                  </div>
                </div>
                {isTurn && <span className="shrink-0 text-xs font-bold text-gold">차례</span>}
              </div>
            );
          })}
      </div>

      {/* 내 컨트롤 */}
      {seated && isBetting && (
        <div className="sticky bottom-2 space-y-2">
          {isMyTurn ? (
            <div className="space-y-2 rounded-2xl border border-gold/30 bg-card p-3">
              <div className="text-center text-[11px] text-gold/80">
                {room.betting_round === 1
                  ? "🎴 첫 장 베팅 — 마지막 장은 곧 나옵니다"
                  : "🎴 마지막 장 추가 베팅"}
              </div>
              {/* 콜 / 다이 */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={pending}
                  onClick={() => run(() => act(room.id, "call"))}
                  className="rounded-xl bg-gold py-3 font-bold text-black disabled:opacity-50"
                >
                  {callCost > 0 ? `콜 (${callCost.toLocaleString()})` : "체크"}
                </button>
                <button
                  disabled={pending}
                  onClick={() => run(() => act(room.id, "fold"))}
                  className="rounded-xl border border-red-500/50 py-3 font-bold text-red-300 disabled:opacity-50"
                >
                  다이
                </button>
              </div>

              {/* 레이즈 프리셋 */}
              <div className="text-[11px] text-white/40">레이즈 (콜 + 추가 베팅)</div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  disabled={pending}
                  onClick={() => run(() => act(room.id, "raise", ppingInc))}
                  className="rounded-xl border border-gold py-2.5 text-sm font-bold text-gold disabled:opacity-50"
                >
                  삥<span className="block text-[10px] font-normal text-white/40">+{ppingInc.toLocaleString()}</span>
                </button>
                <button
                  disabled={pending}
                  onClick={() => run(() => act(room.id, "raise", halfInc))}
                  className="rounded-xl border border-gold py-2.5 text-sm font-bold text-gold disabled:opacity-50"
                >
                  하프<span className="block text-[10px] font-normal text-white/40">+{halfInc.toLocaleString()}</span>
                </button>
                <button
                  disabled={pending}
                  onClick={() => run(() => act(room.id, "raise", ttadangInc))}
                  className="rounded-xl border border-gold py-2.5 text-sm font-bold text-gold disabled:opacity-50"
                >
                  따당<span className="block text-[10px] font-normal text-white/40">+{ttadangInc.toLocaleString()}</span>
                </button>
              </div>

              {/* 직접 입력 */}
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="직접 입력"
                  value={raiseAmt}
                  onChange={(e) => setRaiseAmt(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
                />
                <button
                  disabled={pending || !raiseAmt || Number(raiseAmt) < 1}
                  onClick={() => {
                    run(() => act(room.id, "raise", Math.floor(Number(raiseAmt))));
                    setRaiseAmt("");
                  }}
                  className="shrink-0 rounded-xl border border-gold px-4 py-2.5 text-sm font-bold text-gold disabled:opacity-50"
                >
                  레이즈
                </button>
              </div>

              {canRedeal && (
                <button
                  disabled={pending}
                  onClick={() => run(() => redeal(room.id))}
                  className="w-full rounded-xl border border-blue-400/50 py-2.5 text-sm font-bold text-blue-300 disabled:opacity-50"
                >
                  🔄 멍텅구리구사 — 패 다시 받기
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card py-3 text-center text-sm text-white/50">
              상대 차례를 기다리는 중…
            </div>
          )}
        </div>
      )}

      {/* 대기 / 다음 판 시작 */}
      {(room.status === "waiting" || isShowdown) && (
        <div className="space-y-2">
          {isShowdown && (
            <div className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-center text-sm">
              {room.last_result?.reason === "fold"
                ? "모두 다이! 마지막 한 명이 팟을 가져갑니다."
                : "쇼다운 결과"}
            </div>
          )}
          {canStart ? (
            <button
              disabled={pending}
              onClick={() => run(() => startHand(room.id))}
              className="w-full rounded-xl bg-gold py-3 font-bold text-black disabled:opacity-50"
            >
              {room.hand_no > 0 ? "다음 판 시작" : "판 시작"}
            </button>
          ) : (
            <div className="rounded-xl border border-border bg-card py-3 text-center text-sm text-white/50">
              {activeCount < 2
                ? "2명 이상 모이면 시작할 수 있어요."
                : "방장이 시작하기를 기다리는 중…"}
            </div>
          )}
        </div>
      )}

      {/* 나가기 예약 안내 */}
      {seated && leavePending && isBetting && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-center text-sm text-amber-200">
          🚪 이 판이 끝나면 로비로 나갑니다 (아래 버튼으로 취소)
        </div>
      )}

      {/* 하단 액션 */}
      <div className="flex gap-2 pt-2">
        {seated && (
          <button
            disabled={pending}
            onClick={handleLeave}
            className={`flex-1 rounded-xl border py-2.5 text-sm disabled:opacity-50 ${
              leavePending
                ? "border-amber-400/50 text-amber-200"
                : "border-border text-white/60"
            }`}
          >
            {leavePending
              ? "나가기 예약됨 · 취소"
              : isBetting && myPlayer?.in_hand
              ? "방 나가기 (판 끝나면)"
              : "방 나가기"}
          </button>
        )}
        {isHost && (
          <button
            disabled={pending}
            onClick={() => {
              if (confirm("방을 종료할까요?")) run(() => closeRoom(room.id));
            }}
            className="flex-1 rounded-xl border border-red-500/40 py-2.5 text-sm text-red-300 disabled:opacity-50"
          >
            방 종료
          </button>
        )}
      </div>

      {showGuide && <SutdaRankGuide myLabel={myLabel} onClose={() => setShowGuide(false)} />}
    </div>
  );
}
