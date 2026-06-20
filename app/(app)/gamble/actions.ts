"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CoinResult = {
  ok: boolean;
  message?: string;
  outcome?: "front" | "back";
  win?: boolean;
  balance?: number;
};

export async function playCoinflip(
  bet: number,
  choice: "front" | "back"
): Promise<CoinResult> {
  if (!Number.isInteger(bet) || bet <= 0) {
    return { ok: false, message: "베팅액을 입력하세요." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gamble_coinflip", {
    p_bet: bet,
    p_choice: choice,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard");
  return { ok: true, ...(data as { outcome: "front" | "back"; win: boolean; balance: number }) };
}

export type DiceResult = {
  ok: boolean;
  message?: string;
  roll?: number;
  win?: boolean;
  balance?: number;
};

export async function playDice(bet: number, guess: number): Promise<DiceResult> {
  if (!Number.isInteger(bet) || bet <= 0) {
    return { ok: false, message: "베팅액을 입력하세요." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gamble_dice", {
    p_bet: bet,
    p_guess: guess,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard");
  return { ok: true, ...(data as { roll: number; win: boolean; balance: number }) };
}
