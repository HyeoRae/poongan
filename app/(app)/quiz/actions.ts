"use server";

import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

// 정답 제출(참가자) — 서버가 clock_timestamp() 로 제출 시각을 찍어 속도 순위를 정한다.
// 전파는 quiz_reveal 시 realtime 이 담당하므로 revalidate 불필요.
export async function submitAnswer(choice: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("quiz_submit", { p_choice: choice });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "제출 완료!" };
}

// ── 관리자 진행 제어 (권한은 각 RPC 가 is_admin 으로 재검증) ──

// 라운드 시작 — 본게임 100문제 중 count 개를 서버가 무작위로 뽑아 순서 고정 + 첫 문제 오픈.
export async function quizBegin(count = 10): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("quiz_begin", { p_count: count });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "" };
}

export async function quizStartQuestion(seq: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("quiz_start_question", { p_seq: seq });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "" };
}

export async function quizReveal(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("quiz_reveal");
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "" };
}

// 서든데스 시작/다음 문제 — 서버가 '아직 안 나온' 본게임 문제를 무작위로 뽑으므로 seq 인자 없음.
export async function quizStartTiebreak(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("quiz_start_tiebreak");
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "" };
}

export async function quizFinish(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quiz_finish");
  if (error) return { ok: false, message: error.message };
  // 동점이면 서든데스 안내
  const res = data as { needs_tiebreak?: boolean } | null;
  if (res?.needs_tiebreak)
    return { ok: true, message: "최저점 동점! 서든데스를 시작하세요." };
  return { ok: true, message: "" };
}

export async function quizReset(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("quiz_reset");
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "퀴즈를 초기화했습니다." };
}
