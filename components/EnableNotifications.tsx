"use client";

import { useEffect, useState } from "react";
import { savePushSubscription, deletePushSubscription } from "@/app/(app)/push/actions";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// base64url → Uint8Array (applicationServerKey 용)
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type State = "loading" | "unsupported" | "ios-needs-install" | "default" | "granted" | "denied";

export default function EnableNotifications() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const isIOS = /ipad|iphone|ipod/i.test(navigator.userAgent);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari 전용 플래그
      (navigator as unknown as { standalone?: boolean }).standalone === true;

    const supported =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

    // iOS는 홈 화면에 추가(PWA 설치) 후에만 푸시가 됨
    if (isIOS && !isStandalone) {
      setState("ios-needs-install");
      return;
    }
    if (!supported || !PUBLIC_KEY) {
      setState("unsupported");
      return;
    }

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const existing = await reg.pushManager.getSubscription();
        if (Notification.permission === "denied") setState("denied");
        else if (existing && Notification.permission === "granted") setState("granted");
        else setState("default");
      } catch {
        setState("unsupported");
      }
    })();
  }, []);

  async function enable() {
    if (!PUBLIC_KEY) return;
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "default");
        setBusy(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
        });
      }
      const res = await savePushSubscription(
        sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } },
        navigator.userAgent
      );
      setMsg(res.message);
      if (res.ok) setState("granted");
    } catch (e) {
      setMsg("알림 설정에 실패했습니다. 잠시 후 다시 시도해주세요.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("default");
      setMsg("알림을 껐습니다.");
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-1 font-bold">🔔 푸시 알림</h2>

      {state === "ios-needs-install" && (
        <p className="text-xs text-white/60">
          아이폰은 <b className="text-gold">공유 → &apos;홈 화면에 추가&apos;</b> 후, 홈 화면의
          아이콘으로 앱을 열면 알림을 켤 수 있어요.
        </p>
      )}

      {state === "unsupported" && (
        <p className="text-xs text-white/60">이 브라우저에서는 푸시 알림을 지원하지 않습니다.</p>
      )}

      {state === "denied" && (
        <p className="text-xs text-white/60">
          알림이 <b>차단</b>되어 있어요. 브라우저(또는 폰) 설정에서 이 사이트의 알림을 허용으로
          바꿔주세요.
        </p>
      )}

      {state === "default" && (
        <>
          <p className="mb-3 text-xs text-white/60">
            여행 공지·이벤트 알림을 폰으로 받아보세요.
          </p>
          <button
            disabled={busy}
            onClick={enable}
            className="w-full rounded-xl bg-gold py-2.5 font-bold text-black disabled:opacity-50"
          >
            {busy ? "설정 중..." : "알림 켜기"}
          </button>
        </>
      )}

      {state === "granted" && (
        <>
          <p className="mb-3 text-xs text-green-300">✅ 알림이 켜져 있습니다.</p>
          <button
            disabled={busy}
            onClick={disable}
            className="w-full rounded-xl border border-border py-2.5 text-sm font-bold text-white/70 disabled:opacity-50"
          >
            {busy ? "처리 중..." : "알림 끄기"}
          </button>
        </>
      )}

      {msg && <p className="mt-2 text-sm text-gold">{msg}</p>}
    </section>
  );
}
