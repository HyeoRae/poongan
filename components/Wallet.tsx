"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  transferGold,
  adminGetTransactions,
} from "@/app/(app)/wallet/actions";
import type { PublicProfile, Profile, Transaction } from "@/lib/types";
import Spinner from "@/components/Spinner";

const TX_LABEL: Record<string, string> = {
  admin_grant: "관리자 지급",
  game: "게임",
  gamble: "도박",
  transfer: "송금",
  steal: "강탈",
  shop: "상점",
  fee: "송금 수수료",
  gacha: "효과카드 뽑기",
};

// 거래내역 리스트 (내 지갑 / 관리자 타임라인 공용)
// nameMap 을 주면 각 항목에 대상 참가자 이름을 표시(관리자 타임라인용).
function TxList({
  transactions,
  nameMap,
}: {
  transactions: Transaction[];
  nameMap?: Record<string, string>;
}) {
  if (transactions.length === 0) {
    return <p className="text-sm text-white/40">아직 내역이 없습니다.</p>;
  }
  return (
    <ul className="space-y-2">
      {transactions.map((t) => (
        <li
          key={t.id}
          className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5"
        >
          <div>
            {nameMap && (
              <p className="text-xs font-bold text-gold">
                {(t.user_id && nameMap[t.user_id]) || "알 수 없음"}
              </p>
            )}
            <p className="text-sm font-medium">{TX_LABEL[t.type] ?? t.type}</p>
            {t.reason && <p className="text-xs text-white/50">{t.reason}</p>}
            <p className="text-[10px] text-white/30">
              {new Date(t.created_at).toLocaleString("ko-KR", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <span
            className={`font-bold tabular-nums ${
              t.amount >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {t.amount >= 0 ? "+" : ""}
            {t.amount.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

// 관리자 전용: 전체 참가자 거래 타임라인 + 참가자 필터
function AdminLedger({
  others,
  initialTxs,
  nameMap,
}: {
  others: PublicProfile[];
  initialTxs: Transaction[];
  nameMap: Record<string, string>;
}) {
  const [target, setTarget] = useState("");
  const [txs, setTxs] = useState<Transaction[]>(initialTxs);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const players = others.filter((o) => o.role !== "admin" && !o.is_bot);

  function onSelect(id: string) {
    setTarget(id);
    setErr(null);
    startTransition(async () => {
      const res = await adminGetTransactions(id || undefined);
      if (res.ok) setTxs(res.transactions);
      else setErr(res.message);
    });
  }

  return (
    <section className="rounded-2xl border border-gold/40 bg-gold/5 p-4">
      <h2 className="mb-1 font-bold">🛡️ 참가자 거래 타임라인 (관리자)</h2>
      <p className="mb-3 text-[11px] text-white/40">
        전체 참가자의 송금·획득 등 토큰 내역입니다. 참가자를 골라 필터링할 수
        있습니다.
      </p>
      <select
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
        value={target}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">전체 참가자</option>
        {players.map((o) => (
          <option key={o.id} value={o.id}>
            {o.display_name}
          </option>
        ))}
      </select>

      <div className="mt-3">
        {pending ? (
          <div className="flex items-center gap-2 text-sm text-white/50">
            <Spinner /> 불러오는 중...
          </div>
        ) : err ? (
          <p className="text-sm text-red-400">{err}</p>
        ) : (
          <TxList transactions={txs} nameMap={target ? undefined : nameMap} />
        )}
      </div>
    </section>
  );
}

export default function Wallet({
  me,
  others,
  transactions,
  adminTxs = [],
  nameMap = {},
}: {
  me: Profile;
  others: PublicProfile[];
  transactions: Transaction[];
  adminTxs?: Transaction[];
  nameMap?: Record<string, string>;
}) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onTransfer(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await transferGold(to, Number(amount), reason);
      setMsg(res.message);
      if (res.ok) {
        setAmount("");
        setReason("");
        setTo("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black">💰 내 지갑</h1>

      <div className="rounded-2xl border border-gold/40 bg-gold/10 p-5 text-center">
        <p className="text-xs text-white/60">보유 풍산토큰</p>
        <p className="mt-1 text-3xl font-black text-gold tabular-nums">
          🪙 {me.gold_balance.toLocaleString()}
        </p>
      </div>

      {/* 송금 / 배신 */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-bold">🤝 풍산토큰 보내기</h2>
        <form onSubmit={onTransfer} className="space-y-2">
          <select
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          >
            <option value="">받는 사람 선택</option>
            {others
              .filter((o) => o.role !== "admin" && !o.is_bot)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.display_name}
                </option>
              ))}
          </select>
          <input
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            type="number"
            min={1}
            placeholder="금액"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            placeholder="메모 (선택)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="text-[11px] text-white/40">
            ⚠️ 송금 수수료 20%가 차감됩니다. (받는 사람은 80% 수령 · 효과카드로 면제 가능)
          </p>
          {msg && <p className="text-sm text-gold">{msg}</p>}
          <button
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold py-2.5 font-bold text-black disabled:opacity-50"
          >
            {pending && <Spinner />}
            {pending ? "전송 중..." : "보내기"}
          </button>
        </form>
      </section>

      {/* 관리자 전용: 전체 참가자 거래 타임라인 + 필터 */}
      {me.role === "admin" && (
        <AdminLedger others={others} initialTxs={adminTxs} nameMap={nameMap} />
      )}

      {/* 풍산토큰 내역 */}
      <section>
        <h2 className="mb-3 font-bold">📜 풍산토큰 내역</h2>
        <TxList transactions={transactions} />
      </section>
    </div>
  );
}
