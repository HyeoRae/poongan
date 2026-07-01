"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { broadcastNotification } from "@/app/(app)/push/actions";
import type { DrawAssignment, Profile, Team } from "@/lib/types";

export type ActionResult = { ok: boolean; message: string };

// 호출자가 관리자인지 확인 (공통)
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

// 참가자 비밀번호 초기화 — 임시비번(=아이디)으로 되돌리고 재변경 요구
export async function resetUserPassword(userId: string): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const { data: target } = await guard.supabase
    .from("profiles")
    .select("username, role, display_name")
    .eq("id", userId)
    .single();
  if (!target) return { ok: false, message: "대상을 찾을 수 없습니다." };
  if (target.role === "admin")
    return { ok: false, message: "관리자 계정은 초기화할 수 없습니다." };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return {
      ok: false,
      message:
        "서버에 SUPABASE_SERVICE_ROLE_KEY가 없습니다. Vercel 환경변수에 추가해주세요.",
    };
  }

  const temp = target.username; // 임시비번 = 아이디
  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error: pErr } = await adminClient.auth.admin.updateUserById(userId, {
    password: temp,
  });
  if (pErr) return { ok: false, message: pErr.message };

  const { error: fErr } = await adminClient
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", userId);
  if (fErr) return { ok: false, message: fErr.message };

  revalidatePath("/admin");
  return {
    ok: true,
    message: `${target.display_name} 초기화 완료! 임시비번 = 아이디(${temp}). 그 친구는 다음 로그인 때 새 비번을 정하게 됩니다.`,
  };
}

export async function adminGrantGold(
  userId: string,
  amount: number,
  reason: string
): Promise<ActionResult> {
  if (!userId || !Number.isInteger(amount) || amount === 0) {
    return { ok: false, message: "대상과 0이 아닌 금액을 입력하세요." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_grant_gold", {
    p_user: userId,
    p_amount: amount,
    p_reason: reason || "관리자 지급",
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `${amount > 0 ? "+" : ""}${amount.toLocaleString()} 처리 완료`,
  };
}

export async function adminGrantTeamGold(
  teamId: number,
  amount: number,
  reason: string
): Promise<ActionResult> {
  if (!teamId || !Number.isInteger(amount) || amount === 0) {
    return { ok: false, message: "팀과 0이 아닌 금액을 입력하세요." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_grant_team_gold", {
    p_team: teamId,
    p_amount: amount,
    p_reason: reason || "팀 지급",
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard");
  return { ok: true, message: "팀 전원에게 처리 완료" };
}

// 참가자를 배정식·송금 대상에서 제외(봇/테스트)하거나 다시 포함
export async function setBotExcluded(
  userId: string,
  excluded: boolean
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_bot", {
    p_user: userId,
    p_is_bot: excluded,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: excluded ? "배정식에서 제외했습니다." : "배정식에 포함했습니다.",
  };
}

export async function buildTeams(force: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("build_teams", { p_force: force });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { ok: true, message: "팀 배정 완료!" };
}

// 앱 공개/비공개 전환
export async function setAppPublic(isPublic: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ is_public: isPublic, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin");
  return {
    ok: true,
    message: isPublic ? "앱이 공개되었습니다! 🎉" : "앱을 비공개로 전환했습니다.",
  };
}

// ---------- 미니게임 (팟배팅) 운영 ----------

// 팟배팅 게임 생성 (draft 상태). option_source='custom'이면 옵션을 함께 넣는다.
export async function createPoolGame(
  title: string,
  scheduleId: number | null,
  optionSource: "players" | "custom",
  description: string,
  customOptions: string[]
): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  if (!title.trim()) return { ok: false, message: "게임 제목을 입력하세요." };

  const opts = customOptions.map((s) => s.trim()).filter(Boolean);
  if (optionSource === "custom" && opts.length < 2) {
    return { ok: false, message: "선택지를 2개 이상 입력하세요." };
  }

  const { data: game, error } = await guard.supabase
    .from("games")
    .insert({
      type: "pool",
      title: title.trim(),
      schedule_id: scheduleId,
      status: "draft",
      option_source: optionSource,
      config: description.trim() ? { description: description.trim() } : {},
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };

  if (optionSource === "custom") {
    const rows = opts.map((label, i) => ({
      game_id: game.id,
      label,
      sort_order: i,
    }));
    const { error: oErr } = await guard.supabase
      .from("bet_options")
      .insert(rows);
    if (oErr) return { ok: false, message: oErr.message };
  }

  revalidatePath("/admin");
  revalidatePath("/games");
  return { ok: true, message: "게임을 만들었습니다 (대기 중)." };
}

// 게임 오픈: 참가자 옵션이면 현재 player 명단으로 선택지를 채운 뒤 베팅을 연다.
export async function openGame(gameId: number): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  const { data: game } = await guard.supabase
    .from("games")
    .select("id, title, status, option_source")
    .eq("id", gameId)
    .single();
  if (!game) return { ok: false, message: "게임을 찾을 수 없습니다." };
  if (game.status !== "draft" && game.status !== "locked") {
    return { ok: false, message: "지금 열 수 없는 상태입니다." };
  }

  // 참가자 옵션인데 아직 선택지가 없으면 현재 명단으로 생성
  if (game.option_source === "players") {
    const { data: existing } = await guard.supabase
      .from("bet_options")
      .select("id")
      .eq("game_id", gameId);
    if (!existing || existing.length === 0) {
      const { data: players } = await guard.supabase
        .from("profiles")
        .select("id, display_name")
        .eq("role", "player")
        .order("display_name");
      const rows = ((players as Pick<Profile, "id" | "display_name">[]) ?? []).map(
        (p, i) => ({
          game_id: gameId,
          label: p.display_name,
          ref_user_id: p.id,
          sort_order: i,
        })
      );
      if (rows.length < 2) {
        return { ok: false, message: "참가자가 2명 이상 있어야 합니다." };
      }
      const { error: oErr } = await guard.supabase
        .from("bet_options")
        .insert(rows);
      if (oErr) return { ok: false, message: oErr.message };
    }
  }

  const { error } = await guard.supabase
    .from("games")
    .update({ status: "open" })
    .eq("id", gameId);
  if (error) return { ok: false, message: error.message };

  // 베스트에포트 푸시 (VAPID 미설정 등 실패는 무시)
  try {
    await broadcastNotification(
      `🎮 ${game.title}`,
      "배팅이 열렸어요! 지금 참여하세요.",
      "/games"
    );
  } catch {
    /* 알림 실패는 게임 오픈에 영향 없음 */
  }

  revalidatePath("/admin");
  revalidatePath("/games");
  revalidatePath("/schedule");
  return { ok: true, message: "베팅을 열었습니다!" };
}

// 베팅 마감 (정산 전 잠금)
export async function lockGame(gameId: number): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const { error } = await guard.supabase
    .from("games")
    .update({ status: "locked" })
    .eq("id", gameId)
    .eq("status", "open");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin");
  revalidatePath("/games");
  revalidatePath("/schedule");
  return { ok: true, message: "베팅을 마감했습니다." };
}

// 정산: 우승 선택지 지정 → 팟 자동 분배
export async function settleGame(
  gameId: number,
  winningOptionId: number
): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  if (!winningOptionId) {
    return { ok: false, message: "우승 선택지를 골라주세요." };
  }
  const { data, error } = await guard.supabase.rpc("settle_pool_game", {
    p_game: gameId,
    p_winning_option: winningOptionId,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin");
  revalidatePath("/games");
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  const r = data as { pot: number; refunded: boolean };
  return {
    ok: true,
    message: r?.refunded
      ? "우승 베팅이 없어 전원 환불했습니다."
      : `정산 완료! 팟 🪙${r?.pot?.toLocaleString() ?? 0} 분배.`,
  };
}

// 취소: 전 베팅 환불
export async function cancelGame(gameId: number): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const { error } = await guard.supabase.rpc("cancel_pool_game", {
    p_game: gameId,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin");
  revalidatePath("/games");
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return { ok: true, message: "게임을 취소하고 전원 환불했습니다." };
}

// ---------- 팀 배정식 (실시간 드로우 쇼) ----------

// Fisher-Yates 셔플
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 배정식 시작: 팀 랜덤 배정 + 공개순서 셔플 + 상태 intro
export async function startDraw(): Promise<ActionResult> {
  const supabase = await createClient();

  // 1) 팀 랜덤 배정 (기존 RPC 재사용, 강제)
  const { error: bErr } = await supabase.rpc("build_teams", { p_force: true });
  if (bErr) return { ok: false, message: bErr.message };

  // 1-2) 역할(스파이) 랜덤 배정 — 팀이 섞이는 동시에 새로 배정 (정체는 비밀)
  const { error: rErr } = await supabase.rpc("assign_roles", { p_force: true });
  if (rErr) return { ok: false, message: rErr.message };

  // 2) 배정 결과 + 팀 정보 읽기 (봇/테스트 제외)
  const [{ data: players }, { data: teams }] = await Promise.all([
    supabase.from("profiles").select("*").eq("role", "player").eq("is_bot", false),
    supabase.from("teams").select("*"),
  ]);
  const teamMap = new Map<number, Team>(
    ((teams as Team[]) ?? []).map((t) => [t.id, t])
  );

  // 3) 공개 순서 셔플 → assignments 구성
  const assignments: DrawAssignment[] = shuffle((players as Profile[]) ?? [])
    .filter((p) => p.team_id !== null)
    .map((p) => {
      const t = teamMap.get(p.team_id as number);
      return {
        user_id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        team_id: p.team_id as number,
        team_name: t?.name ?? "",
        team_color: t?.color ?? "#888888",
      };
    });

  if (assignments.length === 0) {
    return { ok: false, message: "배정할 참가자가 없습니다." };
  }

  // 4) 상태 intro 로 전환
  const { error: dErr } = await supabase
    .from("draw_state")
    .update({
      status: "intro",
      assignments,
      revealed_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (dErr) return { ok: false, message: dErr.message };

  revalidatePath("/dashboard");
  return { ok: true, message: "배정식을 시작했습니다." };
}

// 다음 한 명 공개
export async function revealNext(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("draw_state")
    .select("assignments, revealed_count")
    .eq("id", 1)
    .single();
  if (error) return { ok: false, message: error.message };

  const total = (data.assignments as DrawAssignment[]).length;
  const next = Math.min((data.revealed_count ?? 0) + 1, total);

  const { error: uErr } = await supabase
    .from("draw_state")
    .update({
      status: "revealing",
      revealed_count: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (uErr) return { ok: false, message: uErr.message };
  return { ok: true, message: "" };
}

// 역할 카드 배정 시작 (팀 공개 완료 후, 관리자가 버튼으로 트리거 → 전원 분배 연출)
export async function startRoleDeal(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("draw_state")
    .update({ status: "roles", updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "" };
}

// 결과 확정 (전원 공개 후 피날레)
export async function finishDraw(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("draw_state")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard");
  return { ok: true, message: "" };
}

// 배정식 닫기 (오버레이 종료)
export async function closeDraw(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("draw_state")
    .update({ status: "idle", updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard");
  return { ok: true, message: "" };
}
