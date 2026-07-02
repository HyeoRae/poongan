import Link from "next/link";
import { requireProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

const cards = [
  {
    href: "/games",
    icon: "🎮",
    title: "미니게임",
    desc: "일정마다 열리는 예측 배팅 — 적중하면 팟을 나눠 갖기",
  },
  {
    href: "/sutda",
    icon: "🎴",
    title: "섯다",
    desc: "친구들과 실시간으로 한 판 붙는 멀티플레이 섯다",
  },
  {
    href: "/gamble",
    icon: "🎰",
    title: "도박장",
    desc: "동전·주사위·룰렛으로 혼자 한탕",
  },
  {
    href: "/card",
    icon: "🃏",
    title: "효과카드 뽑기",
    desc: "풍산토큰으로 뽑는 버프 카드 — 상시/1회용, 꽝도 있음",
  },
];

export default async function PlayPage() {
  await requireProfile();
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-black">🎲 컨텐츠</h1>
      <p className="text-xs text-white/50">
        풍산토큰으로 즐기는 게임 모음. 원하는 걸 골라 입장하세요.
      </p>
      <div className="space-y-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-transform active:scale-[0.99]"
          >
            <span className="text-3xl">{c.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{c.title}</p>
              <p className="text-xs text-white/50">{c.desc}</p>
            </div>
            <span className="text-lg text-white/30">›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
