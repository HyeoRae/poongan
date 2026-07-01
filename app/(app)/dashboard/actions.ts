"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

// 본인 아바타 URL 저장 (파일 업로드는 클라이언트에서 스토리지로, 여기선 URL만 기록)
export async function updateMyAvatar(url: string): Promise<ActionResult> {
  if (!url) return { ok: false, message: "이미지가 없습니다." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_avatar", { p_url: url });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard");
  return { ok: true, message: "프로필 사진을 저장했습니다." };
}
