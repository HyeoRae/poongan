"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  stealGold,
  hackerScan,
  leaderBalances,
  leaderRenameTeam,
  type Bal,
} from "@/app/(app)/dashboard/roleActions";
import type { PlayerRoleKind } from "@/lib/types";
import Spinner from "@/components/Spinner";

type Target = { id: string; name: string };

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function BalanceList({ rows }: { rows: Bal[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {rows.map((r, i) => (
        <li
          key={r.uid}
          className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-1.5 text-sm"
        >
          <span className="flex items-center gap-2">
            <span className="w-4 text-right text-xs text-white/40">{i + 1}</span>
            {r.name}
          </span>
          <span className="font-bold text-gold">{r.balance.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

export default function RoleAbilityPanel({
  role,
  targets,
  accent,
}: {
  role: PlayerRoleKind;
  targets: Target[];
  teamName: string | null;
  accent: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // 도둑
  const [stealTarget, setStealTarget] = useState("");
  const [tried, setTried] = useState<Set<string>>(new Set());

  // 해커
  const [balances, setBalances] = useState<Bal[] | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // 팀장
  const [newName, setNewName] = useState("");
  const [teamBalances, setTeamBalances] = useState<Bal[] | null>(null);

  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const remainMs = expiresAt ? Date.parse(expiresAt) - nowMs : 0;
  const hackerActive = remainMs > 0;

  function doSteal() {
    if (pending || !stealTarget) return;
    setMsg(null);
    const t = stealTarget;
    startTransition(async () => {
      const res = await stealGold(t);
      setMsg(res.message);
      if (res.ok) {
        setTried((prev) => new Set(prev).add(t));
        setStealTarget("");
        router.refresh();
      }
    });
  }

  function doHack() {
    if (pending) return;
    setMsg(null);
    startTransition(async () => {
      const res = await hackerScan();
      if (res.ok) {
        setBalances(res.balances ?? []);
        setExpiresAt(res.expiresAt ?? null);
        setNowMs(Date.now());
        router.refresh();
      } else {
        setMsg(res.message);
      }
    });
  }

  function doRename() {
    if (pending || !newName.trim()) return;
    setMsg(null);
    startTransition(async () => {
      const res = await leaderRenameTeam(newName);
      setMsg(res.message);
      if (res.ok) {
        setNewName("");
        router.refresh();
      }
    });
  }

  function doTeamBalances() {
    if (pending) return;
    setMsg(null);
    startTransition(async () => {
      const res = await leaderBalances();
      if (res.ok) setTeamBalances(res.balances ?? []);
      else setMsg(res.message);
    });
  }

  const availTargets = targets.filter((t) => !tried.has(t.id));

  return (
    <div
      className="w-full rounded-xl border p-3 text-sm"
      style={{ borderColor: accent + "66", background: accent + "0d" }}
    >
      {role === "thief" && (
        <div>
          <p className="mb-2 text-xs font-bold text-white/60">🗡️ 훔치기 (대상당 1회)</p>
          <div className="flex gap-2">
            <select
              value={stealTarget}
              onChange={(e) => setStealTarget(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none"
            >
              <option value="">대상 선택</option>
              {availTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending || !stealTarget}
              onClick={doSteal}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50"
              style={{ background: accent }}
            >
              훔치기
            </button>
          </div>
          {availTargets.length === 0 && (
            <p className="mt-2 text-xs text-white/40">더 노릴 대상이 없습니다.</p>
          )}
        </div>
      )}

      {role === "hacker" && (
        <div>
          <p className="mb-2 text-xs font-bold text-white/60">🖥️ 전원 잔액 해킹</p>
          {hackerActive ? (
            <>
              <div className="flex items-center justify-between text-xs text-white/60">
                <span>조회 창 열림</span>
                <span className="font-mono font-bold" style={{ color: accent }}>
                  {fmt(remainMs)}
                </span>
              </div>
              {balances && <BalanceList rows={balances} />}
            </>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={doHack}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50"
              style={{ background: accent }}
            >
              해킹 (100토큰 · 10분)
            </button>
          )}
        </div>
      )}

      {role === "leader" && (
        <div className="space-y-3">
          <div>
            <p className="mb-2 text-xs font-bold text-white/60">✏️ 팀명 변경</p>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={20}
                placeholder="새 팀명"
                className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none"
              />
              <button
                type="button"
                disabled={pending || !newName.trim()}
                onClick={doRename}
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50"
                style={{ background: accent }}
              >
                저장
              </button>
            </div>
          </div>
          <div>
            <button
              type="button"
              disabled={pending}
              onClick={doTeamBalances}
              className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50"
              style={{ borderColor: accent + "88", color: accent }}
            >
              팀원 잔고 보기
            </button>
            {teamBalances && <BalanceList rows={teamBalances} />}
          </div>
        </div>
      )}

      {pending && (
        <p className="mt-2 flex items-center gap-2 text-xs text-white/60">
          <Spinner /> 처리 중...
        </p>
      )}
      {msg && (
        <p className="mt-2 text-xs font-semibold" style={{ color: accent }}>
          {msg}
        </p>
      )}
    </div>
  );
}
