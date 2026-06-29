"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { transferGold } from "@/app/(app)/wallet/actions";
import type { Profile, Transaction } from "@/lib/types";

const TX_LABEL: Record<string, string> = {
  admin_grant: "관리자 지급",
  game: "게임",
  gamble: "도박",
  transfer: "송금",
  steal: "강탈",
  shop: "상점",
};

export default function Wallet({
  me,
  others,
  transactions,
}: {
  me: Profile;
  others: Profile[];
  transactions: Transaction[];
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
        <h2 className="mb-3 font-bold">🤝 풍산토큰 보내기 (선물·뇌물·배신)</h2>
        <form onSubmit={onTransfer} className="space-y-2">
          <select
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-gold"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          >
            <option value="">받는 사람 선택</option>
            {others.map((o) => (
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
          {msg && <p className="text-sm text-gold">{msg}</p>}
          <button
            disabled={pending}
            className="w-full rounded-xl bg-gold py-2.5 font-bold text-black disabled:opacity-50"
          >
            {pending ? "전송 중..." : "보내기"}
          </button>
        </form>
      </section>

      {/* 풍산토큰 내역 */}
      <section>
        <h2 className="mb-3 font-bold">📜 풍산토큰 내역</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-white/40">아직 내역이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {transactions.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">
                    {TX_LABEL[t.type] ?? t.type}
                  </p>
                  {t.reason && (
                    <p className="text-xs text-white/50">{t.reason}</p>
                  )}
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
        )}
      </section>
    </div>
  );
}
