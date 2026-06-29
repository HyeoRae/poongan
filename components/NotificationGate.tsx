"use client";

import { useEffect, useState } from "react";
import { savePushSubscription } from "@/app/(app)/push/actions";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
// 세션 단위 건너뛰기 — 새 로그인/세션마다 미설정이면 다시 권유한다.
const SKIP_KEY = "push-onboard-skipped";

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

type State =
  | "loading"
  | "hidden" // 이미 켰거나 / 건너뛴 사용자 → 게이트 미표시
  | "unsupported"
  | "ios-needs-install"
  | "default"
  | "denied";

export default function NotificationGate() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    // 이번 세션에 이미 건너뛴 사람은 다시 막지 않음 (다음 로그인 때는 또 권유)
    if (sessionStorage.getItem(SKIP_KEY) === "1") {
      setState("hidden");
      return;
    }

    const isIOS = /ipad|iphone|ipod/i.test(navigator.userAgent);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari 전용 플래그
      (navigator as unknown as { standalone?: boolean }).standalone === true;

    const supported =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

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
        else if (existing && Notification.permission === "granted") setState("hidden");
        else setState("default");
      } catch {
        setState("unsupported");
      }
    })();
  }, []);

  function skip() {
    sessionStorage.setItem(SKIP_KEY, "1");
    setState("hidden");
  }

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
      if (res.ok) {
        // 켰으면 건너뛰기 플래그도 정리하고 게이트 닫기
        sessionStorage.removeItem(SKIP_KEY);
        setState("hidden");
      } else {
        setMsg(res.message);
      }
    } catch (e) {
      setMsg("알림 설정에 실패했습니다. 잠시 후 다시 시도해주세요.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "hidden") return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 px-6 backdrop-blur">
      <div className="mx-auto w-full max-w-sm text-center">
        <div className="mb-5 text-6xl">🔔</div>
        <h1 className="mb-2 text-2xl font-bold text-white">알림을 켜주세요</h1>

        {state === "default" && (
          <>
            <p className="mb-8 text-sm leading-relaxed text-white/60">
              여행 공지·이벤트·팀 배정 결과를 폰으로 바로 받아보세요.
              <br />
              놓치면 아쉬운 소식이 많아요!
            </p>
            <button
              disabled={busy}
              onClick={enable}
              className="mb-3 w-full rounded-xl bg-gold py-3.5 font-bold text-black disabled:opacity-50"
            >
              {busy ? "설정 중..." : "알림 켜기"}
            </button>
            <button
              disabled={busy}
              onClick={skip}
              className="w-full py-2 text-sm text-white/50 disabled:opacity-50"
            >
              나중에 하기
            </button>
          </>
        )}

        {state === "ios-needs-install" && (
          <>
            <p className="mb-8 text-sm leading-relaxed text-white/60">
              아이폰은 <b className="text-gold">공유 → &apos;홈 화면에 추가&apos;</b> 후, 홈
              화면의 아이콘으로 앱을 열면 알림을 켤 수 있어요.
            </p>
            <button
              onClick={skip}
              className="w-full rounded-xl border border-border py-3.5 font-bold text-white/80"
            >
              건너뛰고 시작하기
            </button>
          </>
        )}

        {state === "denied" && (
          <>
            <p className="mb-8 text-sm leading-relaxed text-white/60">
              알림이 <b>차단</b>되어 있어요. 브라우저(또는 폰) 설정에서 이 사이트의 알림을
              허용으로 바꾼 뒤 새로고침해주세요.
            </p>
            <button
              onClick={skip}
              className="w-full rounded-xl border border-border py-3.5 font-bold text-white/80"
            >
              건너뛰고 시작하기
            </button>
          </>
        )}

        {state === "unsupported" && (
          <>
            <p className="mb-8 text-sm leading-relaxed text-white/60">
              이 브라우저에서는 푸시 알림을 지원하지 않아요. 그냥 시작할 수 있어요.
            </p>
            <button
              onClick={skip}
              className="w-full rounded-xl border border-border py-3.5 font-bold text-white/80"
            >
              건너뛰고 시작하기
            </button>
          </>
        )}

        {msg && <p className="mt-4 text-sm text-gold">{msg}</p>}
      </div>
    </div>
  );
}
