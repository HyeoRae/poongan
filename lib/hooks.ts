"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, DrawState, TeamTotal, PenaltyState } from "@/lib/types";

// 내 풍산토큰 잔액을 실시간 구독 (TopBar 등에서 사용)
export function useMyGold(userId: string, initial: number) {
  const [gold, setGold] = useState(initial);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`mygold-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const next = payload.new as Profile;
          setGold(next.gold_balance);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return gold;
}

// 전체 프로필을 실시간 구독 (대시보드 — 팀/멤버 풍산토큰 변동 반영)
export function useProfilesRealtime(initial: Profile[]) {
  const [profiles, setProfiles] = useState<Profile[]>(initial);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("profiles-all")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        (payload) => {
          setProfiles((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((p) => p.id !== (payload.old as Profile).id);
            }
            const row = payload.new as Profile;
            const exists = prev.some((p) => p.id === row.id);
            return exists
              ? prev.map((p) => (p.id === row.id ? row : p))
              : [...prev, row];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return profiles;
}

// 팀 합산 점수(team_totals) 실시간 구독 — 대시보드 팀 대결 바.
// (개인 잔액은 비공개라 profiles 대신 이 집계 테이블을 구독한다.)
export function useTeamTotals(initial: TeamTotal[]) {
  const [totals, setTotals] = useState<TeamTotal[]>(initial);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("team-totals")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_totals" },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const row = payload.new as TeamTotal;
          setTotals((prev) => {
            const exists = prev.some((t) => t.team_id === row.team_id);
            return exists
              ? prev.map((t) => (t.team_id === row.team_id ? row : t))
              : [...prev, row];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return totals;
}

// 내 효과카드 보유 변동 실시간 — player_effect_cards 변경 시 onChange(보통 router.refresh).
export function useMyCardsRealtime(userId: string, onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const supabase = createClient();
    const fire = () => cb.current();
    const channel = supabase
      .channel(`my-cards-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_effect_cards",
          filter: `user_id=eq.${userId}`,
        },
        fire
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_gacha",
          filter: `user_id=eq.${userId}`,
        },
        fire
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
}

// 미니게임/베팅 변동 실시간 구독 — games/bets/bet_options 변경 시 onChange 호출
// (보통 router.refresh 를 넘겨 서버 데이터를 다시 불러온다)
export function useGamesRealtime(onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const supabase = createClient();
    const fire = () => cb.current();
    const channel = supabase
      .channel("games-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "games" }, fire)
      .on("postgres_changes", { event: "*", schema: "public", table: "bets" }, fire)
      .on("postgres_changes", { event: "*", schema: "public", table: "bet_options" }, fire)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}

// 섯다 로비 — sutda_rooms 변동 시 onChange (보통 router.refresh)
export function useSutdaLobby(onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const supabase = createClient();
    const fire = () => cb.current();
    const channel = supabase
      .channel("sutda-lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "sutda_rooms" }, fire)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}

// 섯다 방 — 해당 방의 rooms/players 변동 시 onChange (보통 router.refresh)
export function useSutdaRoom(roomId: number, onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const supabase = createClient();
    const fire = () => cb.current();
    const channel = supabase
      .channel(`sutda-room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sutda_rooms", filter: `id=eq.${roomId}` },
        fire
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sutda_players", filter: `room_id=eq.${roomId}` },
        fire
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);
}

// 팀 배정식 상태(draw_state id=1) 실시간 구독 — 전원 동기화
export function useDrawState(initial: DrawState) {
  const [draw, setDraw] = useState<DrawState>(initial);

  // 더 최신(updated_at) 값만 반영해 realtime/서버refresh 간 역전 방지
  const applyIfNewer = (next: DrawState) =>
    setDraw((cur) => (next.updated_at >= cur.updated_at ? next : cur));

  // router.refresh() 등으로 서버가 새 initial 을 내려주면 즉시 반영
  // (useState 는 최초 마운트만 읽으므로 prop 변경을 별도로 동기화)
  useEffect(() => {
    applyIfNewer(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("draw-state")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "draw_state",
          filter: "id=eq.1",
        },
        (payload) => {
          if (payload.eventType !== "DELETE") {
            applyIfNewer(payload.new as DrawState);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return draw;
}

// 벌칙 뽑기 세리머니 상태(penalty_state id=1) 실시간 구독 — 전원 동기화
export function usePenaltyState(initial: PenaltyState) {
  const [penalty, setPenalty] = useState<PenaltyState>(initial);

  // 더 최신(updated_at) 값만 반영해 realtime/서버refresh 간 역전 방지
  const applyIfNewer = (next: PenaltyState) =>
    setPenalty((cur) => (next.updated_at >= cur.updated_at ? next : cur));

  // 서버가 새 initial 을 내려주면 즉시 반영 (prop 변경 동기화)
  useEffect(() => {
    applyIfNewer(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("penalty-state")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "penalty_state",
          filter: "id=eq.1",
        },
        (payload) => {
          if (payload.eventType !== "DELETE") {
            applyIfNewer(payload.new as PenaltyState);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return penalty;
}
