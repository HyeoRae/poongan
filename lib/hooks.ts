"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  DrawState,
  TeamTotal,
  PenaltyState,
  EventLobby,
  LobbyPresence,
  QuizState,
  QuizScore,
} from "@/lib/types";

// 내 풍산토큰 잔액을 실시간 구독 (TopBar 등에서 사용)
export function useMyGold(userId: string, initial: number) {
  const [gold, setGold] = useState(initial);

  // 서버가 새 initial 을 내려주면(router.refresh 등) 즉시 반영 —
  // 실시간 이벤트가 늦거나 누락돼도 셀프 액션(송금·도박·정산 등) 직후
  // 상단바 잔액이 바로 갱신된다. (useState 는 최초 마운트만 읽으므로 별도 동기화)
  useEffect(() => {
    setGold(initial);
  }, [initial]);

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

// 🛎️ 공용 이벤트 대기실 상태(event_lobby id=1) 실시간 구독 — 전원 동기화
export function useEventLobby(initial: EventLobby) {
  const [lobby, setLobby] = useState<EventLobby>(initial);

  // 더 최신(updated_at) 값만 반영해 realtime/서버refresh 간 역전 방지
  const applyIfNewer = (next: EventLobby) =>
    setLobby((cur) => (next.updated_at >= cur.updated_at ? next : cur));

  // 서버가 새 initial 을 내려주면 즉시 반영 (prop 변경 동기화)
  useEffect(() => {
    applyIfNewer(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("event-lobby-state")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_lobby", filter: "id=eq.1" },
        (payload) => {
          if (payload.eventType !== "DELETE") {
            applyIfNewer(payload.new as EventLobby);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return lobby;
}

// 🛎️ 대기실 Presence — 내 접속을 track 하고, 지금 접속 중인 전원 목록을 반환.
// 로그인해 앱을 열고 있는 동안 항상 추적하므로(대기실이 닫혀 있어도),
// 관리자가 대기실을 여는 즉시 로스터가 이미 채워져 있다.
export function useLobbyPresence(me: LobbyPresence) {
  const [members, setMembers] = useState<LobbyPresence[]>([me]);
  const meRef = useRef(me);
  meRef.current = me;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("event-lobby-presence", {
      config: { presence: { key: meRef.current.user_id } },
    });

    const sync = () => {
      const state = channel.presenceState<LobbyPresence>();
      // 같은 user_id 로 여러 탭이 접속해도 1명으로 병합
      const byUser = new Map<string, LobbyPresence>();
      for (const key of Object.keys(state)) {
        for (const p of state[key]) byUser.set(p.user_id, p);
      }
      setMembers([...byUser.values()]);
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track(meRef.current);
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // user_id 가 바뀔 때만 재구독(로그인 사용자 변경). 표시값은 meRef 로 최신 반영.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.user_id]);

  return members;
}

// 🧠 퀴즈쇼 진행 상태(quiz_state id=1) 실시간 구독 — 전원 동기화(3·2·1·문제·공개)
export function useQuizState(initial: QuizState) {
  const [quiz, setQuiz] = useState<QuizState>(initial);

  // 더 최신(updated_at) 값만 반영해 realtime/서버refresh 간 역전 방지
  const applyIfNewer = (next: QuizState) =>
    setQuiz((cur) => (next.updated_at >= cur.updated_at ? next : cur));

  // 서버가 새 initial 을 내려주면 즉시 반영 (prop 변경 동기화)
  useEffect(() => {
    applyIfNewer(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("quiz-state")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quiz_state", filter: "id=eq.1" },
        (payload) => {
          if (payload.eventType !== "DELETE") {
            applyIfNewer(payload.new as QuizState);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return quiz;
}

// 🧠 퀴즈 누적 점수표(quiz_scores) 실시간 구독 — 공개 순간 전원 점수 동시 갱신
export function useQuizScores(initial: QuizScore[]) {
  const [scores, setScores] = useState<QuizScore[]>(initial);

  useEffect(() => {
    setScores(initial);
  }, [initial]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("quiz-scores")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quiz_scores" },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const row = payload.new as QuizScore;
          setScores((prev) => {
            const exists = prev.some((s) => s.user_id === row.user_id);
            return exists
              ? prev.map((s) => (s.user_id === row.user_id ? row : s))
              : [...prev, row];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return scores;
}

// 🧠 현재 문제 제출 인원 실시간 카운트 (관리자 전용 — RLS 로 관리자만 전체 답안을 봄).
// seq 가 바뀌면 0 으로 리셋하고, 새 제출(INSERT)마다 +1.
export function useQuizAnswerCount(seq: number | null) {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIds(new Set());
  }, [seq]);

  useEffect(() => {
    if (seq == null) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`quiz-answers-${seq}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "quiz_answers",
          filter: `seq=eq.${seq}`,
        },
        (payload) => {
          const row = payload.new as { user_id: string };
          setIds((prev) => {
            if (prev.has(row.user_id)) return prev;
            const next = new Set(prev);
            next.add(row.user_id);
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [seq]);

  return ids.size;
}

// 🎭 벌칙 당첨 이력(penalty_picks) 변동 시 onChange (보통 router.refresh — 조인된 이름 재로드)
export function usePenaltyPicksRealtime(onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const supabase = createClient();
    const fire = () => cb.current();
    const channel = supabase
      .channel("penalty-picks")
      .on("postgres_changes", { event: "*", schema: "public", table: "penalty_picks" }, fire)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
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
