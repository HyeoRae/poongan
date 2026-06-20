"use client";

import { useMyGold } from "@/lib/hooks";
import { signOut } from "@/app/actions";

export default function TopBar({
  userId,
  displayName,
  initialGold,
  isAdmin,
}: {
  userId: string;
  displayName: string;
  initialGold: number;
  isAdmin: boolean;
}) {
  const gold = useMyGold(userId, initialGold);

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{displayName}</span>
        {isAdmin && (
          <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-gold">
            관리자
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-full bg-card px-3 py-1">
          <span className="text-gold">🪙</span>
          <span className="font-bold tabular-nums">{gold.toLocaleString()}</span>
        </div>
        <form action={signOut}>
          <button className="text-xs text-white/50">로그아웃</button>
        </form>
      </div>
    </header>
  );
}
