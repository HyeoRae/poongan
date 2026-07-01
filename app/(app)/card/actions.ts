"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { GachaResult, PlayerStats } from "@/lib/types";

export type DrawResult =
  | { ok: true; result: GachaResult }
  | { ok: false; message: string };

// 효과카드 뽑기 (무료 3연차 → 이후 유료, 꽝 포함)
export async function drawEffectCard(): Promise<DrawResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("draw_effect_card");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/card");
  return { ok: true, result: data as GachaResult };
}

// 재도전: 방금 진 도박 무르기
export async function useMulligan(): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("use_mulligan");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/card");
  const refund = (data as { refund?: number })?.refund ?? 0;
  return { ok: true, message: `재도전! ${refund.toLocaleString()} 토큰을 돌려받았어요.` };
}

// 관심법: 대상 1명의 역할 엿보기
export async function peekRole(
  targetId: string
): Promise<{ ok: boolean; message: string; role?: string }> {
  if (!targetId) return { ok: false, message: "대상을 선택하세요." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("peek_role", { p_target: targetId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/card");
  const role = (data as { role?: string })?.role ?? "member";
  const label = role === "spy" ? "스파이 🕵️" : role === "jester" ? "광대 🃏" : "충성 팀원";
  return { ok: true, message: `엿본 결과: ${label}`, role };
}

// 흥신소: 대상의 누적 전적 열람
export async function ledgerPeek(
  targetId: string
): Promise<{ ok: boolean; message: string; stats?: PlayerStats }> {
  if (!targetId) return { ok: false, message: "대상을 선택하세요." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ledger_peek", { p_target: targetId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/card");
  const stats = ((data as PlayerStats[]) ?? [])[0];
  return { ok: true, message: "전적 열람 완료", stats };
}
