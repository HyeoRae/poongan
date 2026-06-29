"use server";

import webpush from "web-push";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

// 브라우저 PushSubscription.toJSON() 형태
type SubJSON = {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
};

let vapidReady = false;
function ensureVapid(): boolean {
  if (vapidReady) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  vapidReady = true;
  return true;
}

// 호출자가 관리자인지 확인 (admin/actions.ts 와 동일 패턴)
async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, message: "로그인이 필요합니다." };
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin")
    return { ok: false as const, message: "관리자만 가능합니다." };
  return { ok: true as const };
}

// 내 푸시 구독 저장 (기기/브라우저별 endpoint 기준 upsert)
export async function savePushSubscription(
  sub: SubJSON,
  userAgent?: string
): Promise<ActionResult> {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { ok: false, message: "구독 정보가 올바르지 않습니다." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent ?? null,
    },
    { onConflict: "endpoint" }
  );
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "알림이 켜졌습니다 🔔" };
}

// 내 푸시 구독 해제
export async function deletePushSubscription(endpoint: string): Promise<ActionResult> {
  if (!endpoint) return { ok: false, message: "endpoint가 없습니다." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "알림을 껐습니다." };
}

// 관리자: 전체에게 푸시 발송
export async function broadcastNotification(
  title: string,
  body: string,
  url?: string
): Promise<ActionResult> {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;

  if (!title.trim()) return { ok: false, message: "알림 제목을 입력하세요." };
  if (!ensureVapid()) {
    return {
      ok: false,
      message:
        "서버에 VAPID 키(NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)가 없습니다. 환경변수를 설정하세요.",
    };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return { ok: false, message: "서버에 SUPABASE_SERVICE_ROLE_KEY가 없습니다." };
  }
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");
  if (error) return { ok: false, message: error.message };
  if (!subs || subs.length === 0) {
    return { ok: false, message: "구독자가 없습니다. 친구들이 먼저 '알림 켜기'를 해야 합니다." };
  }

  const payload = JSON.stringify({
    title: title.trim(),
    body: body.trim(),
    url: url?.trim() || "/dashboard",
  });

  const dead: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        sent++;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode;
        // 만료/해지된 구독은 정리
        if (code === 404 || code === 410) dead.push(s.endpoint);
      }
    })
  );

  if (dead.length > 0) {
    await admin.from("push_subscriptions").delete().in("endpoint", dead);
  }

  return {
    ok: true,
    message: `${sent}명에게 알림을 보냈습니다.${dead.length ? ` (만료 ${dead.length}건 정리)` : ""}`,
  };
}
