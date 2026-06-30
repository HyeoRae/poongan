"use client";

import { useState } from "react";
import type { PlayerRoleKind } from "@/lib/types";

// PNG 우선 → 없으면 SVG 폴백 (public/role-cards/<name>.png|svg)
function CardArt({ name, alt }: { name: string; alt: string }) {
  const [src, setSrc] = useState(`/role-cards/${name}.png`);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      draggable={false}
      onError={() => {
        if (src.endsWith(".png")) setSrc(`/role-cards/${name}.svg`);
      }}
      className="h-full w-full select-none object-contain"
    />
  );
}

export default function MyRoleCard({
  role,
  teamColor,
}: {
  role: PlayerRoleKind;
  teamColor?: string | null;
}) {
  const [flipped, setFlipped] = useState(false);
  const isSpy = role === "spy";
  const accent = isSpy ? "#e11d2e" : teamColor || "#f5c542";

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-1 font-bold">🎭 내 비밀 역할</h2>
      <p className="mb-3 text-xs text-white/50">
        {flipped
          ? "이 정체는 비밀입니다. 주변 시선을 조심하세요."
          : "카드를 탭하면 내 역할이 공개됩니다. (나만 볼 수 있어요)"}
      </p>

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? "역할 카드 뒤집기" : "역할 카드 확인하기"}
          className="card3d block w-44 outline-none"
        >
          <div className={`card3d-inner ${flipped ? "is-flipped" : ""}`}>
            <div
              className="card3d-face overflow-hidden rounded-2xl"
              style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}
            >
              <CardArt name="back" alt="역할 카드 뒷면" />
            </div>
            <div
              className="card3d-face card3d-back overflow-hidden rounded-2xl"
              style={{ boxShadow: `0 8px 36px ${accent}55` }}
            >
              <CardArt name={isSpy ? "spy" : "member"} alt={isSpy ? "스파이" : "충성 팀원"} />
            </div>
          </div>
        </button>

        {flipped && (
          <div className="w-full rounded-xl border px-3 py-2.5 text-center text-sm" style={{ borderColor: accent + "66" }}>
            {isSpy ? (
              <p className="font-semibold text-white/90">
                당신은 <span style={{ color: accent }}>스파이</span>입니다. 들키지 않고
                우리 팀 토큰을 깎거나 상대에게 흘려, <b>상대팀이 이기게</b> 만드세요.
              </p>
            ) : (
              <p className="font-semibold text-white/90">
                당신은 <span style={{ color: accent }}>충성 팀원</span>입니다. 우리 팀에
                숨어있는 <b>스파이 1명</b>을 색출하고 팀 토큰을 지키세요.
              </p>
            )}
          </div>
        )}

        {!flipped && (
          <button
            type="button"
            onClick={() => setFlipped(true)}
            className="rounded-xl bg-gold px-5 py-2 text-sm font-bold text-black"
          >
            탭해서 확인
          </button>
        )}
      </div>

      <style jsx>{`
        .card3d {
          perspective: 1200px;
        }
        .card3d-inner {
          position: relative;
          width: 100%;
          aspect-ratio: 300 / 420;
          transform-style: preserve-3d;
          transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .card3d-inner.is-flipped {
          transform: rotateY(180deg);
        }
        .card3d-face {
          position: absolute;
          inset: 0;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .card3d-back {
          transform: rotateY(180deg);
        }
        @media (prefers-reduced-motion: reduce) {
          .card3d-inner {
            transition: none;
          }
        }
      `}</style>
    </section>
  );
}
