"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  useMulligan,
  peekRole,
  ledgerPeek,
  useTaxAudit,
} from "@/app/(app)/card/actions";
import type { PlayerEffectCard, PlayerStats } from "@/lib/types";
import Spinner from "@/components/Spinner";

type Target = { id: string; name: string };

// 자동 적용(도박/송금 시 자동 소모)되는 효과키 — 버튼 없이 안내만.
const AUTO_KEYS: Record<string, string> = {
  double_next: "다음 도박 당첨 시 자동 적용",
  bailout: "다음 도박 패배 시 자동 적용",
  fee_free: "다음 송금 시 자동 적용",
};

export default function MyEffectCards({
  cards,
  targets,
}: {
  userId: string;
  cards: PlayerEffectCard[];
  targets: Target[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [peekTarget, setPeekTarget] = useState("");
  const [ledgerTarget, setLedgerTarget] = useState("");
  const [auditTarget, setAuditTarget] = useState("");
  const [stats, setStats] = useState<PlayerStats | null>(null);

  const passives = cards.filter((c) => c.preset?.grade === "passive" && !c.used_at);
  const consumables = cards.filter(
    (c) => c.preset?.grade === "consumable" && !c.used_at
  );
  // 소모템은 종류별로 묶어 개수 표시
  const byKey = new Map<string, { card: PlayerEffectCard; count: number }>();
  for (const c of consumables) {
    const k = c.preset!.effect_key;
    const cur = byKey.get(k);
    if (cur) cur.count += 1;
    else byKey.set(k, { card: c, count: 1 });
  }

  function run(fn: () => Promise<{ ok: boolean; message: string; stats?: PlayerStats }>) {
    if (pending) return;
    setMsg(null);
    setStats(null);
    startTransition(async () => {
      const res = await fn();
      setMsg(res.message);
      if (res.stats) setStats(res.stats);
      if (res.ok) router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-3 font-bold">🎒 내 효과카드</h2>

      {/* 상시 패시브 */}
      {passives.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-bold text-white/50">상시 (항상 적용)</p>
          <div className="flex flex-wrap gap-2">
            {passives.map((c) => (
              <span
                key={c.id}
                className="flex items-center gap-1.5 rounded-full border border-[#7aa7ff]/40 bg-[#7aa7ff]/10 px-3 py-1 text-sm"
              >
                <span>{c.preset?.icon}</span>
                {c.preset?.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 1회용 소모템 */}
      <p className="mb-2 text-xs font-bold text-white/50">1회용</p>
      {byKey.size === 0 ? (
        <p className="text-sm text-white/40">보유한 1회용 카드가 없습니다. 뽑아보세요!</p>
      ) : (
        <ul className="space-y-2">
          {[...byKey.values()].map(({ card, count }) => {
            const key = card.preset!.effect_key;
            const auto = AUTO_KEYS[key];
            return (
              <li
                key={key}
                className="rounded-xl border border-[#f5c542]/30 bg-[#f5c542]/5 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className="text-base">{card.preset?.icon}</span>
                    {card.preset?.name}
                    {count > 1 && (
                      <span className="text-xs text-gold">×{count}</span>
                    )}
                  </span>
                  {auto && (
                    <span className="text-[10px] text-white/40">{auto}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-white/50">{card.preset?.description}</p>

                {/* 발동 UI */}
                {key === "mulligan" && (
                  <button
                    disabled={pending}
                    onClick={() => run(useMulligan)}
                    className="mt-2 rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50"
                  >
                    재도전 사용
                  </button>
                )}
                {key === "peek" && (
                  <div className="mt-2 flex gap-2">
                    <select
                      value={peekTarget}
                      onChange={(e) => setPeekTarget(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none"
                    >
                      <option value="">대상 선택</option>
                      {targets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={pending || !peekTarget}
                      onClick={() => run(() => peekRole(peekTarget))}
                      className="rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50"
                    >
                      엿보기
                    </button>
                  </div>
                )}
                {key === "ledger" && (
                  <div className="mt-2 flex gap-2">
                    <select
                      value={ledgerTarget}
                      onChange={(e) => setLedgerTarget(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none"
                    >
                      <option value="">대상 선택</option>
                      {targets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={pending || !ledgerTarget}
                      onClick={() => run(() => ledgerPeek(ledgerTarget))}
                      className="rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50"
                    >
                      열람
                    </button>
                  </div>
                )}
                {key === "tax_audit" && (
                  <div className="mt-2 flex gap-2">
                    <select
                      value={auditTarget}
                      onChange={(e) => setAuditTarget(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none"
                    >
                      <option value="">대상 선택</option>
                      {targets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={pending || !auditTarget}
                      onClick={() => run(() => useTaxAudit(auditTarget))}
                      className="rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50"
                    >
                      징수
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pending && (
        <p className="mt-3 flex items-center gap-2 text-sm text-white/60">
          <Spinner /> 처리 중...
        </p>
      )}
      {msg && <p className="mt-3 text-sm text-gold">{msg}</p>}
      {stats && (
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-border bg-background/50 p-3 text-xs">
          <span>💰 총 획득: {stats.earned.toLocaleString()}</span>
          <span>💸 총 사용: {stats.spent.toLocaleString()}</span>
          <span>📤 보낸 송금: {stats.sent.toLocaleString()}</span>
          <span>📥 받은 송금: {stats.received.toLocaleString()}</span>
          <span>🧾 낸 수수료: {stats.fee_paid.toLocaleString()}</span>
          <span>🎲 도박 손익: {stats.gamble_net.toLocaleString()}</span>
        </div>
      )}
    </section>
  );
}
