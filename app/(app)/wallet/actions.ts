"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

export async function transferGold(
  toUserId: string,
  amount: number,
  reason: string
): Promise<ActionResult> {
  if (!toUserId || !Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: "받는 사람과 1 이상의 금액을 입력하세요." };
  }
  const supabase = await createClient();
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
