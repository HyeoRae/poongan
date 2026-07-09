"use client";

import { useState } from "react";
import type { PlayerRoleKind } from "@/lib/types";
import RoleAbilityPanel from "@/components/RoleAbilityPanel";

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

type Target = { id: string; name: string };

const ROLE_META: Record<PlayerRoleKind, { art: string; label: string; accent: string }> = {
  member: { art: "member", label: "충성 팀원", accent: "#f5c542" },
  spy: { art: "spy", label: "스파이", accent: "#e11d2e" },
  jester: { art: "jester", label: "광대", accent: "#a855f7" },
  thief: { art: "thief", label: "도둑", accent: "#f59e0b" },
  hacker: { art: "hacker", label: "해커", accent: "#22d3ee" },
  leader: { art: "leader", label: "팀장", accent: "#84cc16" },
};

const ABILITY_ROLES: PlayerRoleKind[] = ["thief", "hacker", "leader"];

function RoleDesc({
  role,
  teamName,
  accent,
}: {
  role: PlayerRoleKind;
  teamName?: string | null;
  accent: string;
}) {
  const hi = { color: accent };
  switch (role) {
    case "spy":
      return (
        <p className="font-semibold text-white/90">
          당신은 <span style={hi}>스파이</span>입니다. 들키지 않고 우리 팀 토큰을
          깎거나 상대에게 흘려, <b>상대팀이 이기게</b> 만드세요.
        </p>
      );
    case "jester":
      return (
        <p className="font-semibold text-white/90">
          당신은 <span style={hi}>광대</span>입니다. 조용히 가장 가난하게 —{" "}
          <b>{teamName ?? "우리 팀"}이 우승</b>하고 그 안에서 <b>당신이 개인 꼴찌</b>면
          혼자 승리합니다. 단, 팀이 지면 꽝!
        </p>
      );
    case "thief":
      return (
        <p className="font-semibold text-white/90">
          당신은 <span style={hi}>도둑</span>입니다. 아무나 골라 지갑의 <b>10%</b>를
          노리세요 — <b>50% 확률</b>로 성공. 단, <b>한 사람당 한 번</b>뿐!
        </p>
      );
    case "hacker":
      return (
        <p className="font-semibold text-white/90">
          당신은 <span style={hi}>해커</span>입니다. <b>100토큰</b>으로 전원의 지갑을{" "}
          <b>10분간</b> 훔쳐봅니다. 누가 부자인지 파악해 판을 읽으세요.
        </p>
      );
    case "leader":
      return (
        <p className="font-semibold text-white/90">
          당신은 <span style={hi}>팀장</span>입니다. <b>팀명</b>을 바꾸고 팀원들의{" "}
          <b>잔고</b>를 언제든 들여다볼 수 있습니다.
        </p>
      );
    default:
      return (
        <p className="font-semibold text-white/90">
          당신은 <span style={hi}>충성 팀원</span>입니다. 우리 팀에 숨어있는{" "}
          <b>스파이 1명</b>을 색출하고 팀 토큰을 지키세요.
        </p>
      );
  }
}

export default function MyRoleCard({
  role,
  teamColor,
  teamName,
  targets = [],
}: {
  role: PlayerRoleKind;
  teamColor?: string | null;
  teamName?: string | null;
  targets?: Target[];
}) {
  const [flipped, setFlipped] = useState(false);
  const meta = ROLE_META[role] ?? ROLE_META.member;
  const accent = role === "member" ? teamColor || meta.accent : meta.accent;
  const hasAbility = ABILITY_ROLES.includes(role);

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
              <CardArt name={meta.art} alt={meta.label} />
            </div>
          </div>
        </button>

        {flipped && (
          <div
            className="w-full rounded-xl border px-3 py-2.5 text-center text-sm"
            style={{ borderColor: accent + "66" }}
          >
            <RoleDesc role={role} teamName={teamName} accent={accent} />
          </div>
        )}

        {flipped && hasAbility && (
          <RoleAbilityPanel
            role={role}
            targets={targets}
            teamName={teamName ?? null}
            accent={accent}
          />
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
