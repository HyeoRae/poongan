"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  match?: string[]; // 이 경로들에 있을 때도 활성화
};

const items: NavItem[] = [
  { href: "/dashboard", label: "대시보드", icon: "🏆" },
  { href: "/schedule", label: "일정", icon: "🗓️" },
  {
    href: "/play",
    label: "컨텐츠",
    icon: "🎲",
    match: ["/play", "/games", "/quiz", "/sutda", "/gamble"],
  },
  { href: "/wallet", label: "지갑", icon: "💰" },
];

export default function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const nav: NavItem[] = isAdmin
    ? [...items, { href: "/admin", label: "관리", icon: "⚙️" }]
    : items;

  return (
    <nav className="sticky bottom-0 z-10 grid border-t border-border bg-background/95 backdrop-blur"
      style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
    >
      {nav.map((it) => {
        const paths = it.match ?? [it.href];
        const active = paths.some(
          (p) => pathname === p || pathname.startsWith(p + "/")
        );
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
