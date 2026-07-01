"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 컨텐츠(게임/섯다/도박) 페이지 상단 전환 탭
const tabs = [
  { href: "/games", label: "🎮 미니게임" },
  { href: "/sutda", label: "🃏 섯다" },
  { href: "/gamble", label: "🎰 도박장" },
];

export default function ContentTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-2">
      {tabs.map((t) => {
        const active =
          pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex-1 rounded-xl px-2 py-2 text-center text-sm font-bold transition-colors ${
              active
                ? "bg-gold text-black"
                : "border border-border text-white/60"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
