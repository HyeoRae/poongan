"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type Bal = { uid: string; name: string; balance: number };

// 도둑: 대상 지갑 10%를 50% 확률로 훔치기 (대상 1명당 1회)
export async function stealGold(
  targetId: string
): Promise<{ ok: boolean; message: string; success?: boolean; amount?: number }> {
  if (!targetId) return { ok: false, message: "대상을 선택하세요." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("steal_gold", { p_target: targetId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard");
  const r = (data as { success: boolean; amount: number }) ?? { success: false, amount: 0 };
  return r.success
    ? {
        ok: true,
        message: `훔치기 성공! ${r.amount.toLocaleString()} 토큰을 챙겼습니다.`,
        success: true,
        amount: r.amount,
      }
    : { ok: true, message: "훔치기 실패… 이 대상은 이제 못 노립니다.", success: false, amount: 0 };
}

// 해커: 100토큰 소모, 전원 잔액 + 창 만료시각 반환 (창 안에서는 무료 재조회)
export async function hackerScan(): Promise<{
  ok: boolean;
  message: string;
  balances?: Bal[];
  expiresAt?: string;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hacker_scan");
  if (error) return { ok: false, message: error.message };
  const rows =
    (data as { uid: string; name: string; balance: number; expires_at: string }[]) ?? [];
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: "해킹 완료",
    balances: rows.map((r) => ({ uid: r.uid, name: r.name, balance: r.balance })),
    expiresAt: rows[0]?.expires_at,
  };
}

// 팀장: 팀원 잔고 조회 (상시)
export async function leaderBalances(): Promise<{
  ok: boolean;
  message: string;
  balances?: Bal[];
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leader_team_balances");
  if (error) return { ok: false, message: error.message };
  const rows = (data as { uid: string; name: string; balance: number }[]) ?? [];
  return {
    ok: true,
    message: "조회 완료",
    balances: rows.map((r) => ({ uid: r.uid, name: r.name, balance: r.balance })),
  };
}

// 팀장: 팀명 변경
export async function leaderRenameTeam(
  name: string
): Promise<{ ok: boolean; message: string }> {
  if (!name || !name.trim()) return { ok: false, message: "팀명을 입력하세요." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_team", { p_name: name });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard");
  return { ok: true, message: "팀명을 변경했습니다." };
}
