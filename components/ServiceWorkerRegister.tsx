"use client";

import { useEffect } from "react";

// 앱 진입 시 서비스워커를 등록한다(오프라인 캐싱이 모든 사용자에게 적용되도록).
// 등록 자체는 알림 권한을 요청하지 않으므로 안전하다 — 푸시 구독은 EnableNotifications에서 별도 처리.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* 등록 실패는 조용히 무시 — 오프라인 캐싱만 영향, 핵심 기능엔 무관 */
    });
  }, []);

  return null;
}
