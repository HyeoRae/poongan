"use client";

import { useProfilesRealtime } from "@/lib/hooks";
import Avatar from "@/components/Avatar";
import type { Profile, Team } from "@/lib/types";

export default function Dashboard({
  initialProfiles,
  teams,
}: {
  initialProfiles: Profile[];
  teams: Team[];
}) {
  const profiles = useProfilesRealtime(initialProfiles);
  const players = profiles.filter((p) => p.role === "player");

  const teamData = teams.map((t) => {
    const members = players
      .filter((p) => p.team_id === t.id)
      .sort((a, b) => b.gold_balance - a.gold_balance);
    const total = members.reduce((s, m) => s + m.gold_balance, 0);
    return { team: t, members, total };
  });

  const unassigned = players.filter((p) => p.team_id === null);
  const maxTotal = Math.max(1, ...teamData.map((t) => t.total));
  const leader = [...players].sort((a, b) => b.gold_balance - a.gold_balance)[0];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-black">🏆 실시간 풍산토큰 현황</h1>

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

      {/* MVP 배지 */}
      {leader && leader.gold_balance > 0 && (
        <div className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
          👑 현재 1위 <b>{leader.display_name}</b> · 🪙{" "}
          {leader.gold_balance.toLocaleString()}
        </div>
      )}

      {/* 팀별 멤버 풍산토큰 */}
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
            </div>
            {members.length === 0 ? (
              <p className="text-sm text-white/40">아직 멤버가 없습니다</p>
            ) : (
              <ul className="space-y-2">
                {members.map((m, i) => (
                  <li key={m.id} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      <span className="w-5 text-center text-white/40">{i + 1}</span>
                      <Avatar
                        url={m.avatar_url}
                        name={m.display_name}
                        color={team.color}
                        size={28}
                      />
                      {m.display_name}
                    </span>
                    <span className="font-bold tabular-nums text-gold">
                      {m.gold_balance.toLocaleString()}
                    </span>
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
