"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminGrantGold,
  adminGrantTeamGold,
  setAppPublic,
  resetUserPassword,
  setBotExcluded,
  resetTeams,
  openEventLobby,
  distributeJackpot,
  setHouseTax,
  fundCasinoBank,
} from "@/app/(app)/admin/actions";
import { broadcastNotification } from "@/app/(app)/push/actions";
import { resetPenaltyPicks } from "@/app/(app)/admin/penaltyActions";
import AdminGames from "@/components/AdminGames";
import PenaltyTracker from "@/components/PenaltyTracker";
import { PENALTY_OUTFITS } from "@/lib/constants";
import type { Profile, Team, AdminGameView, PenaltyPick } from "@/lib/types";

export default function AdminPanel({
  players,
  grantTargets,
  teams,
  isPublic,
  games,
  schedule,
  penaltyPicks,
  jackpot,
  casinoBank,
  houseTaxOn,
  houseTaxBase,
  houseTaxRich,
}: {
  players: Profile[];
  grantTargets: Profile[];
  teams: Team[];
  isPublic: boolean;
  games: AdminGameView[];
  schedule: { id: number; day: number; title: string }[];
  penaltyPicks: PenaltyPick[];
  jackpot: number;
  casinoBank: number;
  houseTaxOn: boolean;
  houseTaxBase: number;
  houseTaxRich: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // 서브탭
  const TABS = [
    { id: "event", label: "🎲 이벤트" },
    { id: "game", label: "🎮 게임" },
    { id: "token", label: "🪙 토큰" },
    { id: "notify", label: "🔔 알림" },
    { id: "member", label: "🔑 참가자" },
  ] as const;
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("event");

  // 개인 지급
  const [user, setUser] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  // 팀 지급
  const [team, setTeam] = useState("");
  const [teamAmount, setTeamAmount] = useState("");
  const [teamReason, setTeamReason] = useState("");

  // 비번 초기화
  const [resetUser, setResetUser] = useState("");

  // 전체 알림
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");

  // 공용 이벤트 대기실 안내 문구
  const [lobbyTitle, setLobbyTitle] = useState("");

  // 도박 하우스세 세율(%) 입력 — 서버 값(소수)을 % 로 표시
  const [taxBase, setTaxBase] = useState(String(Math.round(houseTaxBase * 100)));
  const [taxRich, setTaxRich] = useState(String(Math.round(houseTaxRich * 100)));

  // 카지노 뱅크 투입/회수 금액
  const [bankFund, setBankFund] = useState("");

  const assigned = players.filter((p) => p.team_id !== null).length;
  const pickedIds = new Set(penaltyPicks.map((p) => p.user_id));
  const penaltyPool = players.filter(
    (p) => !p.is_bot && !pickedIds.has(p.id)
  ).length;

  function run(
    fn: () => Promise<{ ok: boolean; message: string }>,
    opts?: { skipRefresh?: boolean }
  ) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      setMsg(res.message);
      // 배정식처럼 realtime 으로 화면이 갱신되는 동작은 무거운 refresh 생략
      if (res.ok && !opts?.skipRefresh) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black">⚙️ 관리자</h1>
      {msg && (
        <div className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">
          {msg}
        </div>
      )}

      {/* 서브탭 네비 */}
      <div className="flex gap-1 rounded-2xl border border-border bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition-colors ${
              tab === t.id
                ? "bg-gold text-black"
                : "text-white/60 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "event" && (
        <>
      {/* 🛎️ 공용 이벤트 대기실 */}
      <section className="rounded-2xl border border-gold/40 bg-gold/5 p-4">
        <h2 className="mb-1 font-bold">🛎️ 이벤트 대기실</h2>
        <p className="mb-3 text-xs text-white/50">
          열면 접속한 모두의 화면에 대기실이 뜨고, <b>지금 접속 중인 사람들</b>이
          실시간으로 모입니다. 다 모이면 <b>대기실 화면에서</b> 팀 배정식·퀴즈쇼·벌칙
          뽑기 중 골라 시작하세요.
        </p>
        <input
          value={lobbyTitle}
          onChange={(e) => setLobbyTitle(e.target.value)}
          placeholder="안내 문구 (예: 곧 팀 배정식 시작!) — 선택"
          className="mb-2 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-gold"
        />
        <button
          disabled={pending}
          onClick={() => run(() => openEventLobby(lobbyTitle))}
          className="w-full rounded-xl bg-gold py-3 font-black text-black disabled:opacity-50"
        >
          🛎️ 대기실 열기
        </button>
      </section>

      {/* 앱 공개 상태 */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-bold">👁️ 앱 공개 상태</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              isPublic
                ? "bg-green-500/20 text-green-300"
                : "bg-white/10 text-white/60"
            }`}
          >
            {isPublic ? "공개됨" : "🔒 비공개"}
          </span>
        </div>
        <p className="mb-3 text-xs text-white/50">
          비공개면 참가자는 비번 변경 후 &apos;곧 공개&apos; 화면만 봅니다. 공개로
          바꾸면 잠금화면에 있던 참가자들이 <b>자동 입장</b>합니다.
        </p>
        <button
          disabled={pending}
          onClick={() => {
            const next = !isPublic;
            if (
              confirm(
                next
                  ? "앱을 모두에게 공개할까요? 참가자들이 바로 입장합니다."
                  : "앱을 다시 비공개로 전환할까요?"
              )
            )
              run(() => setAppPublic(next));
          }}
          className={`w-full rounded-xl py-3 font-black disabled:opacity-50 ${
            isPublic
              ? "border border-border text-white"
              : "bg-gold text-black"
          }`}
        >
          {isPublic ? "비공개로 전환" : "🎉 앱 공개하기"}
        </button>
      </section>

      {/* 🩲 벌칙 옷 현황판 (누가 무슨 옷, 남은시간) */}
      <PenaltyTracker picks={penaltyPicks} />

      {/* 🧹 정리 · 초기화 — 실제 쇼 시작은 🛎️ 대기실 화면에서 골라 진행 */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-1 font-bold">🧹 정리 · 초기화</h2>
        <p className="mb-3 text-xs text-white/50">
          팀 배정식·퀴즈쇼·벌칙 뽑기 <b>시작</b>은 위에서 대기실을 연 뒤 <b>대기실
          화면</b>에서 골라 진행합니다. 여기서는 배정·벌칙 현황만 정리해요.
        </p>
        <p className="mb-3 text-xs text-white/40">
          참가자 {players.length}명 · 팀 배정됨 {assigned}명 · 벌칙 후보 {penaltyPool}
          명
        </p>

        {assigned > 0 && (
          <button
            disabled={pending}
            onClick={() => {
              if (
                confirm(
                  "팀 배정을 초기화할까요? 전원 팀·역할이 해제되고 배정 전 상태로 돌아갑니다. (모두의 화면에 '팀 미배정'으로 표시됨)"
                )
              )
                run(resetTeams);
            }}
            className="mb-2 w-full rounded-xl border border-border py-2.5 text-sm font-bold text-white/70 disabled:opacity-50"
          >
            ↩️ 팀 배정 초기화 (배정 전으로)
          </button>
        )}

        {penaltyPicks.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-white/60">이번 여행 벌칙 현황</p>
            <ul className="space-y-1">
              {penaltyPicks.map((pk) => (
                <li
                  key={pk.id}
                  className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm"
                >
                  <span className="font-semibold">{pk.display_name}</span>
                  <span className="text-white/70">
                    {PENALTY_OUTFITS[pk.outfit].emoji}{" "}
                    {PENALTY_OUTFITS[pk.outfit].label}
                  </span>
                </li>
              ))}
            </ul>
            <button
              disabled={pending}
              onClick={() => {
                if (confirm("벌칙 현황을 초기화할까요? 전원 다시 후보가 됩니다."))
                  run(resetPenaltyPicks);
              }}
              className="mt-1 w-full rounded-xl border border-border py-2.5 text-sm font-bold text-white/70 disabled:opacity-50"
            >
              🔄 벌칙 현황 초기화
            </button>
          </div>
        )}
      </section>
        </>
      )}

      {tab === "game" && <AdminGames games={games} schedule={schedule} />}

      {tab === "token" && (
        <>
      {/* 🎰 경제 균형 — 도박 하우스세 · 잭팟 재분배 (빈부격차 완화) */}
      <section className="rounded-2xl border border-gold/40 bg-gold/5 p-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-bold">🎰 경제 균형</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              houseTaxOn
                ? "bg-green-500/20 text-green-300"
                : "bg-white/10 text-white/60"
            }`}
          >
            {houseTaxOn ? "하우스세 ON" : "하우스세 OFF"}
          </span>
        </div>
        <p className="mb-3 text-xs text-white/50">
          도박 당첨금의 순이익에서 세금을 떼 <b>공동 잭팟풀</b>에 쌓고, 하위 절반에게
          돌려줘 빈부격차를 완화합니다. (부자=상위 1/3 은 가산 세율)
        </p>

        {/* 잭팟풀 현황 + 분배 */}
        <div className="mb-3 rounded-xl border border-border bg-background/50 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">현재 잭팟풀</span>
            <span className="font-black tabular-nums text-gold">
              🪙 {jackpot.toLocaleString()}
            </span>
          </div>
          <button
            disabled={pending || jackpot <= 0}
            onClick={() => {
              if (
                confirm(
                  `잭팟풀 🪙${jackpot.toLocaleString()}을 하위 절반에게 분배할까요?`
                )
              )
                run(distributeJackpot);
            }}
            className="mt-2 w-full rounded-xl bg-gold py-2.5 text-sm font-black text-black disabled:opacity-50"
          >
            💸 로빈훗 분배 (하위 절반에게)
          </button>
        </div>

        {/* 🏦 카지노 뱅크 — 도박 배당 재원(잔고 상한). 인플레 구조적 차단 */}
        <div className="mb-3 rounded-xl border border-border bg-background/50 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">🏦 카지노 뱅크</span>
            <span className="font-black tabular-nums text-gold">
              🪙 {casinoBank.toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-white/40">
            베팅이 쌓이고 당첨금이 여기서 나갑니다. 잔고가 배당 상한이라 도박이
            토큰을 새로 찍어낼 수 없어요. 초반엔 여유 자금을 넣어두면 큰 배당도 매끄럽게
            지급됩니다. (뱅크는 개인 잔액이 아니라 인플레와 무관)
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              value={bankFund}
              onChange={(e) => setBankFund(e.target.value)}
              placeholder="투입(+)/회수(-) 금액"
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold"
            />
            <button
              disabled={pending || !bankFund}
              onClick={() =>
                run(async () => {
                  const r = await fundCasinoBank(Number(bankFund));
                  if (r.ok) setBankFund("");
                  return r;
                })
              }
              className="rounded-xl bg-gold px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
            >
              적용
            </button>
          </div>
        </div>

        {/* 하우스세 세율 조정 */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <label className="flex-1 text-xs text-white/60">
              기본 세율(%)
              <input
                type="number"
                value={taxBase}
                onChange={(e) => setTaxBase(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold"
              />
            </label>
            <label className="flex-1 text-xs text-white/60">
              부자 가산(%)
              <input
                type="number"
                value={taxRich}
                onChange={(e) => setTaxRich(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              disabled={pending}
              onClick={() =>
                run(() =>
                  setHouseTax(true, Number(taxBase) / 100, Number(taxRich) / 100)
                )
              }
              className="flex-1 rounded-xl bg-gold py-2.5 text-sm font-bold text-black disabled:opacity-50"
            >
              세율 적용 · ON
            </button>
            <button
              disabled={pending}
              onClick={() =>
                run(() =>
                  setHouseTax(false, Number(taxBase) / 100, Number(taxRich) / 100)
                )
              }
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-white/70 disabled:opacity-50"
            >
              하우스세 OFF
            </button>
          </div>
        </div>
      </section>

      {/* 개인 풍산토큰 지급/차감 */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-bold">🪙 개인 풍산토큰 지급/차감</h2>
        <div className="space-y-2">
          <select
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            value={user}
            onChange={(e) => setUser(e.target.value)}
          >
            <option value="">참가자 선택</option>
            {grantTargets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
                {p.role === "admin" ? " (관리자)" : ""} (🪙
                {p.gold_balance.toLocaleString()})
              </option>
            ))}
          </select>
          <input
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            type="number"
            placeholder="금액 (차감은 음수, 예: -100)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            placeholder="사유 (예: 퀴즈 정답)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            disabled={pending}
            onClick={() => run(() => adminGrantGold(user, Number(amount), reason))}
            className="w-full rounded-xl bg-gold py-2.5 font-bold text-black disabled:opacity-50"
          >
            적용
          </button>
        </div>
      </section>

      {/* 팀 풍산토큰 지급/차감 */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-1 font-bold">👥 팀 전원 풍산토큰 지급/차감</h2>
        <p className="mb-3 text-xs text-white/50">선택한 팀 전원에게 같은 금액 적용</p>
        <div className="space-y-2">
          <select
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          >
            <option value="">팀 선택</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            type="number"
            placeholder="금액 (1인당, 차감은 음수)"
            value={teamAmount}
            onChange={(e) => setTeamAmount(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            placeholder="사유"
            value={teamReason}
            onChange={(e) => setTeamReason(e.target.value)}
          />
          <button
            disabled={pending}
            onClick={() =>
              run(() => adminGrantTeamGold(Number(team), Number(teamAmount), teamReason))
            }
            className="w-full rounded-xl bg-gold py-2.5 font-bold text-black disabled:opacity-50"
          >
            팀 전원 적용
          </button>
        </div>
      </section>
        </>
      )}

      {tab === "notify" && (
        <>
      {/* 전체 푸시 알림 */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-1 font-bold">🔔 전체 알림 보내기</h2>
        <p className="mb-3 text-xs text-white/50">
          &apos;알림 켜기&apos;를 한 참가자 전원의 폰으로 푸시가 전송됩니다.
        </p>
        <div className="space-y-2">
          <input
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            placeholder="알림 제목 (예: 집합 5분 전!)"
            value={pushTitle}
            onChange={(e) => setPushTitle(e.target.value)}
          />
          <textarea
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            placeholder="내용 (선택)"
            rows={2}
            value={pushBody}
            onChange={(e) => setPushBody(e.target.value)}
          />
          <button
            disabled={pending || !pushTitle.trim()}
            onClick={() => {
              if (confirm("전원에게 알림을 보낼까요?"))
                run(async () => {
                  const r = await broadcastNotification(pushTitle, pushBody);
                  if (r.ok) {
                    setPushTitle("");
                    setPushBody("");
                  }
                  return r;
                });
            }}
            className="w-full rounded-xl bg-gold py-2.5 font-bold text-black disabled:opacity-50"
          >
            전체 발송
          </button>
        </div>
      </section>
        </>
      )}

      {tab === "member" && (
        <>
      {/* 배정식 참여 / 제외 (봇·테스트) */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-1 font-bold">🤖 배정식 참여 관리</h2>
        <p className="mb-3 text-xs text-white/50">
          테스트·봇 계정은 제외하세요. 제외하면 팀 배정식·송금 대상에서 빠집니다.
          현재 참여 {players.filter((p) => !p.is_bot).length}명 · 제외{" "}
          {players.filter((p) => p.is_bot).length}명.
        </p>
        <ul className="space-y-1.5">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
            >
              <span className={p.is_bot ? "text-white/40" : ""}>
                {p.display_name}{" "}
                <span className="text-white/40">({p.username})</span>
              </span>
              <button
                disabled={pending}
                onClick={() => run(() => setBotExcluded(p.id, !p.is_bot))}
                className={`shrink-0 rounded-lg px-3 py-1 text-xs font-bold disabled:opacity-50 ${
                  p.is_bot
                    ? "bg-white/10 text-white/60"
                    : "border border-gold/50 text-gold"
                }`}
              >
                {p.is_bot ? "제외됨 · 포함" : "참여중 · 제외"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* 참가자 비번 초기화 */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-1 font-bold">🔑 참가자 비번 초기화</h2>
        <p className="mb-3 text-xs text-white/50">
          비번을 잊은 친구용. 임시비번(=아이디)으로 되돌리고, 그 친구는 다음 로그인
          때 새 비번을 다시 정합니다.
        </p>
        <div className="space-y-2">
          <select
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            value={resetUser}
            onChange={(e) => setResetUser(e.target.value)}
          >
            <option value="">참가자 선택</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name} ({p.username})
              </option>
            ))}
          </select>
          <button
            disabled={pending || !resetUser}
            onClick={() => {
              const p = players.find((x) => x.id === resetUser);
              if (
                p &&
                confirm(
                  `${p.display_name}의 비번을 임시비번(아이디 '${p.username}')으로 초기화할까요?`
                )
              )
                run(() => resetUserPassword(resetUser));
            }}
            className="w-full rounded-xl border border-border py-2.5 font-bold disabled:opacity-50"
          >
            비번 초기화
          </button>
        </div>
      </section>
        </>
      )}
    </div>
  );
}
