"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "대시보드", icon: "🏆" },
  { href: "/schedule", label: "일정", icon: "🗓️" },
  { href: "/games", label: "게임", icon: "🎮" },
  { href: "/gamble", label: "도박", icon: "🎰" },
  { href: "/wallet", label: "지갑", icon: "💰" },
];

export default function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const nav = isAdmin
    ? [...items, { href: "/admin", label: "관리", icon: "⚙️" }]
    : items;

  return (
    <nav className="sticky bottom-0 z-10 grid border-t border-border bg-background/95 backdrop-blur"
      style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
    >
      {nav.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${
              active ? "text-gold" : "text-white/50"
            }`}
          >
            <span className="text-lg">{it.icon}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
