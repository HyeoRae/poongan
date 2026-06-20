"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DrawAssignment, Profile, Team } from "@/lib/types";

export type ActionResult = { ok: boolean; message: string };

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

  // 2) 배정 결과 + 팀 정보 읽기
  const [{ data: players }, { data: teams }] = await Promise.all([
    supabase.from("profiles").select("*").eq("role", "player"),
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
