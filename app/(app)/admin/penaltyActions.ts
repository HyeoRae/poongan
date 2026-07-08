"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  RACE_ANIMALS,
  RACE_SLOTS_MIN,
  RACE_SLOTS_MAX,
  PENALTY_OUTFITS,
  PENALTY_STYLES,
} from "@/lib/constants";
import { runWinner } from "@/lib/penalty/marbleSim";
import type {
  PenaltyLobbySlot,
  PenaltyOutfit,
  PenaltyParticipant,
  PenaltyState,
  PenaltyStyle,
  Profile,
} from "@/lib/types";

export type ActionResult = { ok: boolean; message: string };

// 키셋은 constants.ts 의 메타 상수에서 파생 — 옷/연출 추가 시 constants 만 고치면 여기도 따라온다.
const OUTFITS = Object.keys(PENALTY_OUTFITS) as PenaltyOutfit[];
const STYLES = Object.keys(PENALTY_STYLES) as PenaltyStyle[];

// 호출자가 관리자인지 확인 (penalty_state/picks 는 RLS 로도 막히지만, 깔끔한 메시지용)
async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, message: "로그인이 필요합니다." };
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin")
    return { ok: false as const, message: "관리자만 가능합니다." };
  return { ok: true as const, supabase };
}

// Fisher-Yates 셔플
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 32비트 양수 시드
function newSeed() {
  return Math.floor(Math.random() * 0x7fffffff);
}

// 벌칙 뽑기 시작: 옷/연출 지정 → 후보 풀(플레이어·봇제외·이미뽑힌사람제외) → 당첨자 확정 → running
export async function startPenaltyDraw(
  outfit: PenaltyOutfit,
  style: PenaltyStyle
): Promise<ActionResult> {
  if (!OUTFITS.includes(outfit)) return { ok: false, message: "옷을 선택하세요." };
  if (!STYLES.includes(style)) return { ok: false, message: "연출을 선택하세요." };

  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const supabase = guard.supabase;

  // 1) 참가자(플레이어, 봇 제외) + 이미 뽑힌 사람
  const [{ data: players }, { data: picks }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("role", "player")
      .eq("is_bot", false),
    supabase.from("penalty_picks").select("user_id"),
  ]);

  const pickedIds = new Set(
    ((picks as { user_id: string }[]) ?? []).map((p) => p.user_id)
  );
  const pool = ((players as Pick<Profile, "id" | "display_name" | "avatar_url">[]) ?? [])
    .filter((p) => !pickedIds.has(p.id));

  if (pool.length === 0)
    return { ok: false, message: "남은 후보가 없습니다. 벌칙 현황을 초기화하세요." };

  // 2) 표시 순서 셔플 + 당첨자/시드 확정 (서버에서 결정)
  const participants: PenaltyParticipant[] = shuffle(pool).map((p) => ({
    user_id: p.id,
    display_name: p.display_name,
    avatar_url: p.avatar_url,
  }));
  // 구슬 레이스(plinko)는 당첨자를 "미리 뽑지 않고" 물리 시뮬로 먼저 결승선 통과한 구슬로 정한다.
  // 시뮬은 결정론이라 서버가 정한 winner_index 를 클라가 같은 seed 로 재생하면 화면 우승자와 일치한다.
  // (후보 pool 은 이미 미당첨자만이라 물리 우승자도 자동으로 자격 충족)
  const seed = newSeed();
  const winner_index =
    style === "plinko"
      ? runWinner(seed, participants.length)
      : Math.floor(Math.random() * participants.length);

  // 3) 상태 running 으로 전환 → realtime 으로 전원 오버레이 등장
  const { error } = await supabase
    .from("penalty_state")
    .update({
      status: "running",
      style,
      outfit,
      participants,
      winner_index,
      seed,
      mode: "person",
      target_user: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin");
  return { ok: true, message: "" };
}

// 🎭 벌칙 옷 파칭코 (사람 고정 + 옷 랜덤): 퀴즈 최저점자에게 남은 옷 중 하나를 파칭코로.
// participants 를 사람이 아닌 "남은 옷 레인"으로 채워 기존 Plinko 연출을 그대로 재사용한다.
export async function startOutfitPachinko(userId: string): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const supabase = guard.supabase;

  // 대상자 공개 정보(이름/아바타)
  const { data: profs } = await supabase.rpc("list_public_profiles");
  const target = ((profs as { id: string; display_name: string; avatar_url: string | null }[]) ?? [])
    .find((p) => p.id === userId);
  if (!target) return { ok: false, message: "대상자를 찾을 수 없습니다." };

  // 남은 옷 = 전체 - 이미 뽑힌 옷 (4게임 중복 없음)
  const { data: picks } = await supabase.from("penalty_picks").select("outfit");
  const usedOutfits = new Set(
    ((picks as { outfit: PenaltyOutfit }[]) ?? []).map((p) => p.outfit)
  );
  const remaining = OUTFITS.filter((o) => !usedOutfits.has(o));
  if (remaining.length === 0)
    return { ok: false, message: "남은 벌칙 옷이 없습니다. 벌칙 현황을 초기화하세요." };

  // 옷 레인(표시 순서 셔플) — user_id 칸에 옷 키를 담아 재사용
  const lanes: PenaltyParticipant[] = shuffle(remaining).map((o) => ({
    user_id: o, // 옷 키
    display_name: PENALTY_OUTFITS[o].label,
    avatar_url: PENALTY_OUTFITS[o].img,
  }));
  const seed = newSeed();
  const winner_index =
    lanes.length === 1 ? 0 : runWinner(seed, lanes.length);

  const { error } = await supabase
    .from("penalty_state")
    .update({
      status: "running",
      style: "plinko" satisfies PenaltyStyle,
      outfit: null, // 아직 미확정 — 파칭코로 뽑는 중
      participants: lanes,
      winner_index,
      seed,
      mode: "outfit",
      target_user: {
        user_id: target.id,
        display_name: target.display_name,
        avatar_url: target.avatar_url,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin");
  return { ok: true, message: `${target.display_name}님 벌칙 옷 뽑기 시작!` };
}

// 동물 달리기 대기실 열기: 옷/동물수 지정 → 빈 슬롯 N개로 status='lobby'.
// 참가자들이 이후 penalty_claim_animal 로 선착순 선택.
export async function openPenaltyLobby(
  outfit: PenaltyOutfit,
  slots: number
): Promise<ActionResult> {
  if (!OUTFITS.includes(outfit)) return { ok: false, message: "옷을 선택하세요." };
  const n = Math.floor(slots);
  if (!Number.isFinite(n) || n < RACE_SLOTS_MIN || n > RACE_SLOTS_MAX)
    return {
      ok: false,
      message: `동물 수는 ${RACE_SLOTS_MIN}~${RACE_SLOTS_MAX} 사이여야 해요.`,
    };

  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const supabase = guard.supabase;

  // 풀에서 N마리 무작위 추출 → 빈 슬롯
  const animals = shuffle([...RACE_ANIMALS]).slice(0, n);
  const lobby: PenaltyLobbySlot[] = animals.map((animal) => ({
    animal,
    user_id: null,
    display_name: null,
    avatar_url: null,
  }));

  const { error } = await supabase
    .from("penalty_state")
    .update({
      status: "lobby",
      style: "race" satisfies PenaltyStyle,
      outfit,
      slots: n,
      lobby,
      participants: [],
      winner_index: 0,
      seed: 0,
      mode: "person",
      target_user: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin");
  return { ok: true, message: "" };
}

// 레이스 시작: 대기실에서 동물을 고른 참가자만 출전 → 당첨자/시드 확정 → running.
// 당첨자는 아직 벌칙 안 받은 참가자 중에서 우선 추첨(전원 이미 받았으면 전체에서).
export async function startPenaltyRace(): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const supabase = guard.supabase;

  const { data, error } = await supabase
    .from("penalty_state")
    .select("status, lobby")
    .eq("id", 1)
    .single();
  if (error) return { ok: false, message: error.message };
  if (data.status !== "lobby")
    return { ok: false, message: "대기실 상태가 아닙니다." };

  const lobby = (data.lobby as PenaltyLobbySlot[]) ?? [];
  const claimed = lobby.filter((s) => s.user_id);
  if (claimed.length < 2)
    return { ok: false, message: "동물을 고른 참가자가 2명 이상이어야 해요." };

  // 표시 순서는 선택 순서(슬롯 순서) 유지 — 각자 고른 동물로 출전
  const participants: PenaltyParticipant[] = claimed.map((s) => ({
    user_id: s.user_id as string,
    display_name: s.display_name ?? "익명",
    avatar_url: s.avatar_url,
    animal: s.animal,
  }));

  // 당첨자 후보: 이미 벌칙 받은 사람 제외 (전원 받았으면 전체)
  const { data: picks } = await supabase.from("penalty_picks").select("user_id");
  const pickedIds = new Set(
    ((picks as { user_id: string }[]) ?? []).map((p) => p.user_id)
  );
  const eligible = participants
    .map((p, i) => i)
    .filter((i) => !pickedIds.has(participants[i].user_id));
  const candidates = eligible.length > 0 ? eligible : participants.map((_, i) => i);
  const winner_index = candidates[Math.floor(Math.random() * candidates.length)];

  const { error: uErr } = await supabase
    .from("penalty_state")
    .update({
      status: "running",
      participants,
      winner_index,
      seed: newSeed(),
      mode: "person",
      target_user: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (uErr) return { ok: false, message: uErr.message };

  revalidatePath("/admin");
  return { ok: true, message: "" };
}

// 다시 뽑기: 같은 후보/옷/연출 유지, 당첨자+시드만 새로
export async function rerollPenalty(): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const supabase = guard.supabase;

  const { data, error } = await supabase
    .from("penalty_state")
    .select("participants, style")
    .eq("id", 1)
    .single();
  if (error) return { ok: false, message: error.message };

  const participants = (data.participants as PenaltyParticipant[]) ?? [];
  if (participants.length === 0)
    return { ok: false, message: "진행 중인 뽑기가 없습니다." };

  // 구슬 레이스는 새 seed 로 물리 재시뮬 → 새 물리 우승자. 그 외는 무작위.
  const seed = newSeed();
  const winner_index =
    data.style === "plinko"
      ? runWinner(seed, participants.length)
      : Math.floor(Math.random() * participants.length);

  const { error: uErr } = await supabase
    .from("penalty_state")
    .update({
      status: "running",
      winner_index,
      seed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (uErr) return { ok: false, message: uErr.message };
  revalidatePath("/admin");
  return { ok: true, message: "" };
}

// 착용 시간(당첨 후 이 시간 동안 벌칙 옷 착용). "하루종일은 가혹" → 3시간으로 변경됨.
const PENALTY_WEAR_HOURS = 3;

// 확정: 현재 당첨자를 이력에 기록(다음 풀에서 제외) → revealed. 착용 만료(+3시간)도 기록.
// outfit 모드면 "옷 입을 사람=target_user, 당첨 옷=winner 레인"으로 뒤집어 기록한다.
export async function confirmPenaltyPick(): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const supabase = guard.supabase;

  const { data, error } = await supabase
    .from("penalty_state")
    .select("participants, winner_index, outfit, style, status, mode, target_user")
    .eq("id", 1)
    .single();
  if (error) return { ok: false, message: error.message };

  const state = data as Pick<
    PenaltyState,
    | "participants"
    | "winner_index"
    | "outfit"
    | "style"
    | "status"
    | "mode"
    | "target_user"
  >;
  const winner = state.participants?.[state.winner_index];
  if (!winner) return { ok: false, message: "당첨자가 없습니다." };

  // 모드별로 "누가(wearerId)" + "무슨 옷(wonOutfit)" 을 결정
  let wearerId: string;
  let wearerName: string;
  let wonOutfit: PenaltyOutfit;
  if (state.mode === "outfit") {
    if (!state.target_user) return { ok: false, message: "대상자 정보가 없습니다." };
    wearerId = state.target_user.user_id;
    wearerName = state.target_user.display_name;
    wonOutfit = winner.user_id as PenaltyOutfit; // 레인의 user_id 칸에 옷 키가 담겨 있음
  } else {
    if (!state.outfit) return { ok: false, message: "옷 정보가 없습니다." };
    wearerId = winner.user_id;
    wearerName = winner.display_name;
    wonOutfit = state.outfit;
  }

  const expiresAt = new Date(
    Date.now() + PENALTY_WEAR_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { error: iErr } = await supabase.from("penalty_picks").insert({
    user_id: wearerId,
    outfit: wonOutfit,
    style: state.style,
    expires_at: expiresAt,
  });
  if (iErr) return { ok: false, message: iErr.message };

  // outfit 모드는 확정된 옷을 state.outfit 에도 채워 넣어 reveal 카드가 옷을 표시
  const { error: uErr } = await supabase
    .from("penalty_state")
    .update({
      status: "revealed",
      outfit: wonOutfit,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (uErr) return { ok: false, message: uErr.message };

  revalidatePath("/admin");
  return {
    ok: true,
    message: `${wearerName}님 → ${PENALTY_OUTFITS[wonOutfit].label} 옷 (3시간) 확정!`,
  };
}

// 벌칙 조기 해제(관리자): 만료 시각을 지금으로 당겨 착용 종료.
export async function endPenaltyEarly(pickId: number): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const { error } = await guard.supabase
    .from("penalty_picks")
    .update({ expires_at: new Date().toISOString() })
    .eq("id", pickId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin");
  return { ok: true, message: "벌칙을 조기 해제했습니다." };
}

// 세리머니 닫기
export async function closePenalty(): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const { error } = await guard.supabase
    .from("penalty_state")
    .update({ status: "idle", updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin");
  return { ok: true, message: "" };
}

// 벌칙 현황 전체 초기화 (여행 새로 시작 시 전원 다시 후보)
export async function resetPenaltyPicks(): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const { error } = await guard.supabase
    .from("penalty_picks")
    .delete()
    .gte("id", 0);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin");
  return { ok: true, message: "벌칙 현황을 초기화했습니다." };
}
