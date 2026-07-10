"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import type { SutdaHand } from "@/lib/types";

export type SutdaResult = { ok: boolean; message: string; data?: unknown };

function ok(message = "", data?: unknown): SutdaResult {
  return { ok: true, message, data };
}
function fail(message: string): SutdaResult {
  return { ok: false, message };
}

export async function createRoom(name: string, ante: number): Promise<SutdaResult> {
  if (!name?.trim()) return fail("방 이름을 입력하세요.");
  if (!Number.isInteger(ante) || ante <= 0) return fail("앤티는 1 이상이어야 합니다.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sutda_create_room", {
    p_name: name.trim(),
    p_ante: ante,
  });
  if (error) return fail(error.message);
  revalidatePath("/sutda");
  return ok("방을 만들었습니다.", { roomId: data as number });
}

export async function joinRoom(roomId: number): Promise<SutdaResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("sutda_join_room", { p_room: roomId });
  if (error) return fail(error.message);
  revalidatePath("/sutda");
  return ok();
}

export async function leaveRoom(roomId: number): Promise<SutdaResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("sutda_leave_room", { p_room: roomId });
  if (error) return fail(error.message);
  revalidatePath("/sutda");
  return ok();
}

export async function startHand(roomId: number): Promise<SutdaResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("sutda_start_hand", { p_room: roomId });
  if (error) return fail(error.message);
  revalidatePath("/sutda");
  return ok();
}

export async function act(
  roomId: number,
  action: "call" | "raise" | "fold",
  amount = 0,
  label = ""
): Promise<SutdaResult> {
  if (action === "raise" && (!Number.isInteger(amount) || amount < 1)) {
    return fail("레이즈 금액을 입력하세요.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sutda_action", {
    p_room: roomId,
    p_action: action,
    p_amount: action === "raise" ? amount : 0,
    p_label: label || null,
  });
  if (error) return fail(error.message);
  revalidatePath("/sutda");
  revalidatePath("/dashboard");
  return ok("", data);
}

export async function timeout(roomId: number): Promise<SutdaResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("sutda_timeout", { p_room: roomId });
  if (error) return fail(error.message);
  revalidatePath("/sutda");
  return ok();
}

export async function redeal(roomId: number): Promise<SutdaResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("sutda_redeal", { p_room: roomId });
  if (error) return fail(error.message);
  revalidatePath("/sutda");
  return ok();
}

export async function closeRoom(roomId: number): Promise<SutdaResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("sutda_close_room", { p_room: roomId });
  if (error) return fail(error.message);
  revalidatePath("/sutda");
  return ok();
}

// 내 패 조회 (현재 판). RLS상 본인 행만 반환.
export async function getMyHand(
  roomId: number,
  handNo: number
): Promise<SutdaHand | null> {
  if (!handNo) return null;
  const supabase = await createClient();
  const me = await getCurrentProfile();
  if (!me) return null;
  const { data } = await supabase
    .from("sutda_hands")
    .select("*")
    .eq("room_id", roomId)
    .eq("hand_no", handNo)
    .eq("user_id", me.id)
    .maybeSingle();
  return (data as SutdaHand) ?? null;
}

// 관리자 전용: 전체 패 조회 (현재 판). 비관리자는 빈 배열.
export async function getAllHands(
  roomId: number,
  handNo: number
): Promise<SutdaHand[]> {
  if (!handNo) return [];
  const me = await getCurrentProfile();
  if (!me || me.role !== "admin") return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("sutda_hands")
    .select("*")
    .eq("room_id", roomId)
    .eq("hand_no", handNo);
  return (data as SutdaHand[]) ?? [];
}
