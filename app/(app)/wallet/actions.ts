"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Transaction } from "@/lib/types";

export type ActionResult = { ok: boolean; message: string };

// 관리자: 특정 참가자의 거래내역(송금·획득 등) 조회.
// transactions RLS(read_tx)가 관리자에게 전체 열람을 허용하므로 직접 조회 가능.
export async function adminGetUserTransactions(
  userId: string
): Promise<
  { ok: true; transactions: Transaction[] } | { ok: false; message: string }
> {
  if (!userId) return { ok: false, message: "참가자를 선택하세요." };
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin")
    return { ok: false, message: "관리자만 조회할 수 있습니다." };

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { ok: false, message: error.message };
  return { ok: true, transactions: (data as Transaction[]) ?? [] };
}

export async function transferGold(
  toUserId: string,
  amount: number,
  reason: string
): Promise<ActionResult> {
  if (!toUserId || !Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: "받는 사람과 1 이상의 금액을 입력하세요." };
  }
  const supabase = await createClient();

  // 관리자·봇/테스트 계정에게는 보낼 수 없음
  const { data: recipient } = await supabase
    .from("profiles")
    .select("role, is_bot")
    .eq("id", toUserId)
    .single();
  if (recipient && (recipient.role === "admin" || recipient.is_bot)) {
    return { ok: false, message: "보낼 수 없는 상대입니다." };
  }

  const { error } = await supabase.rpc("transfer_gold", {
    p_to: toUserId,
    p_amount: amount,
    p_reason: reason || "송금",
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/wallet");
  revalidatePath("/dashboard");
  return { ok: true, message: `${amount.toLocaleString()} 풍산토큰을 보냈습니다.` };
}
