import { PENALTY_OUTFITS, PENALTY_STYLES } from "@/lib/constants";
import type { PenaltyPick } from "@/lib/types";

// 벌칙 이력 — 누가 어떤 벌칙 옷에 걸렸는지 전원에게 공개(대시보드).
// penalty_picks 는 RLS 로 로그인 사용자 전체 읽기 허용이라 관리자/참가자 모두 표시된다.
function fmtWhen(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

export default function PenaltyHistoryCard({ picks }: { picks: PenaltyPick[] }) {
  if (picks.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">🎭 벌칙 이력</h2>
        <span className="text-xs text-white/50">지금까지 {picks.length}명</span>
      </div>
      <ul className="space-y-1.5">
        {picks.map((pk) => {
          const outfit = PENALTY_OUTFITS[pk.outfit];
          const style = pk.style ? PENALTY_STYLES[pk.style] : null;
          return (
            <li
              key={pk.id}
              className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-semibold">
                  {pk.display_name ?? "?"}
                </span>
                {style && (
                  <span className="shrink-0 text-[11px] text-white/40">
                    {style.emoji} {style.label}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-white/70">
                  {outfit.emoji} {outfit.label}
                </span>
                <span className="text-[11px] text-white/35">
                  {fmtWhen(pk.created_at)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
