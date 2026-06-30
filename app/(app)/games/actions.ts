"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type BetResult = { ok: boolean; message: string; balance?: number };

export async function placeBet(
  gameId: number,
  optionId: number,
  amount: number
): Promise<BetResult> {
  if (!gameId || !optionId || !Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: "선택지와 1 이상의 금액을 입력하세요." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_bet", {
    p_game: gameId,
    p_option: optionId,
    p_amount: amount,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/games");
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `${amount.toLocaleString()} 풍산토큰 베팅 완료!`,
    balance: (data as { balance: number })?.balance,
  };
}
