"use client";

import { useEffect } from "react";
import { useStealAlerts } from "@/lib/hooks";

// 도둑에게 당하면 화면 상단에 경고 토스트를 띄운다(6초 후 자동 사라짐 · 탭하면 닫힘).
export default function StealAlert({ userId }: { userId: string }) {
  const { alert, clear } = useStealAlerts(userId);

  useEffect(() => {
    if (!alert) return;
    const t = setTimeout(clear, 6000);
    return () => clearTimeout(t);
  }, [alert, clear]);

  if (!alert) return null;

  return (
    <button
      type="button"
      onClick={clear}
      className="fixed inset-x-0 top-16 z-[60] mx-auto flex max-w-md justify-center px-4"
      aria-label="알림 닫기"
    >
      <div className="w-full animate-[stealpop_0.3s_ease-out] rounded-xl border border-red-500/50 bg-red-950/90 px-4 py-3 text-center shadow-lg backdrop-blur">
        <p className="text-sm font-bold text-red-200">
          🗡️ 지갑에서 {alert.amount.toLocaleString()} 토큰을 도둑맞았습니다!
        </p>
      </div>
      <style jsx>{`
        @keyframes stealpop {
          from {
            opacity: 0;
            transform: translateY(-12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </button>
  );
}
