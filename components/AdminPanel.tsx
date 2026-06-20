"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminGrantGold,
  adminGrantTeamGold,
  startDraw,
} from "@/app/(app)/admin/actions";
import type { Profile, Team } from "@/lib/types";

export default function AdminPanel({
  players,
  teams,
}: {
  players: Profile[];
  teams: Team[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // 개인 지급
  const [user, setUser] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  // 팀 지급
  const [team, setTeam] = useState("");
  const [teamAmount, setTeamAmount] = useState("");
  const [teamReason, setTeamReason] = useState("");

  const assigned = players.filter((p) => p.team_id !== null).length;

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      setMsg(res.message);
      if (res.ok) router.refresh();
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

      {/* 팀 배정식 */}
      <section className="rounded-2xl border border-gold/40 bg-gold/5 p-4">
        <h2 className="mb-1 font-bold">🎲 팀 배정식 (실시간 쇼)</h2>
        <p className="mb-3 text-xs text-white/50">
          참가자 {players.length}명 · 배정됨 {assigned}명 · 시작하면 모두의 화면에
          전체화면으로 뜨고, 아래에서 한 명씩 공개합니다.
        </p>
        <button
          disabled={pending}
          onClick={() => {
            if (
              confirm(
                "팀 배정식을 시작할까요? 접속한 모두의 화면에 배정식이 뜹니다."
              )
            )
              run(startDraw);
          }}
          className="w-full rounded-xl bg-gold py-3 font-black text-black disabled:opacity-50"
        >
          🎬 팀 배정식 시작
        </button>
      </section>

      {/* 개인 골드 지급/차감 */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-bold">🪙 개인 골드 지급/차감</h2>
        <div className="space-y-2">
          <select
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            value={user}
            onChange={(e) => setUser(e.target.value)}
          >
            <option value="">참가자 선택</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name} (🪙{p.gold_balance.toLocaleString()})
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

      {/* 팀 골드 지급/차감 */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-1 font-bold">👥 팀 전원 골드 지급/차감</h2>
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
    </div>
  );
}
