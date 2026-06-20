"use server";

import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

export async function changePassword(newPassword: string): Promise<ActionResult> {
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, message: "비밀번호는 6자 이상이어야 합니다." };
  }
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, message: error.message };

  const { error: rErr } = await supabase.rpc("clear_password_change_flag");
  if (rErr) return { ok: false, message: rErr.message };

  return { ok: true, message: "비밀번호가 변경되었습니다." };
}
