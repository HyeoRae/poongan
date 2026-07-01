"use client";

import { useTeamTotals } from "@/lib/hooks";
import Avatar from "@/components/Avatar";
import type { PublicProfile, Team, TeamTotal } from "@/lib/types";

export default function Dashboard({
  initialProfiles,
  teams,
  initialTotals,
}: {
  initialProfiles: PublicProfile[];
  teams: Team[];
  initialTotals: TeamTotal[];
}) {
  // 개인 잔액은 비공개 — 팀 합산 점수만 실시간 구독.
  const totals = useTeamTotals(initialTotals);
  const players = initialProfiles.filter((p) => p.role === "player" && !p.is_bot);
  const totalOf = (teamId: number) =>
    totals.find((t) => t.team_id === teamId)?.total ?? 0;

  const teamData = teams.map((t) => ({
    team: t,
    members: players.filter((p) => p.team_id === t.id),
    total: totalOf(t.id),
  }));

  const unassigned = players.filter((p) => p.team_id === null);
  const maxTotal = Math.max(1, ...teamData.map((t) => t.total));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-black">🏆 팀 대항전 현황</h1>
      <p className="text-xs text-white/50">
        개인 보유 토큰은 비밀입니다. 공개되는 건 <b>팀 합산 점수</b>뿐이에요.
      </p>

      {/* 팀 합산 비교 바 */}
      <div className="space-y-3">
        {teamData.map(({ team, total }) => (
          <div key={team.id}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-bold" style={{ color: team.color }}>
                {team.name}
              </span>
              <span className="font-black tabular-nums text-gold">
                🪙 {total.toLocaleString()}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-card">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${(total / maxTotal) * 100}%`,
                  backgroundColor: team.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* 팀별 멤버 (잔액 비공개 — 명단만) */}
      <div className="grid grid-cols-1 gap-4">
        {teamData.map(({ team, members }) => (
          <div
            key={team.id}
            className="rounded-2xl border border-border bg-card p-4"
            style={{ borderColor: team.color + "55" }}
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: team.color }}
              />
              <span className="font-bold">{team.name}</span>
              <span className="text-xs text-white/40">· {members.length}명</span>
            </div>
            {members.length === 0 ? (
              <p className="text-sm text-white/40">아직 멤버가 없습니다</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1 text-sm"
                  >
                    <Avatar
                      url={m.avatar_url}
                      name={m.display_name}
                      color={team.color}
                      size={24}
                    />
                    {m.display_name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {unassigned.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-white/60">
          ⏳ 팀 미배정 {unassigned.length}명 — 관리자가 팀 빌딩을 실행하세요
        </div>
      )}
    </div>
  );
}
