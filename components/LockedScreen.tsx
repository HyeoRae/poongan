"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/app/actions";
import type { AppSettings } from "@/lib/types";

export default function LockedScreen({ displayName }: { displayName: string }) {
  const router = useRouter();

  // 관리자가 공개로 전환하면 자동 입장
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("app-settings-lock")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_settings",
          filter: "id=eq.1",
        },
        (payload) => {
          if ((payload.new as AppSettings).is_public) {
            router.push("/dashboard");
            router.refresh();
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="w-full max-w-sm">
        <div className="text-6xl">🔒</div>
        <h1 className="mt-5 text-2xl font-black text-gold">
          {displayName}야 반가워!
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          비밀번호 설정이 끝났어요.
          <br />
          앱 내용은 <b className="text-gold">아직 공개 전</b>입니다 
          <br />
          공개 후에는 <b>자동으로 입장</b>됩니다!
        </p>

        <div className="mt-8 rounded-2xl border border-border bg-card p-4 text-xs text-white/50">
           풍계모 제 4회 여름여행 : 통영-거제편
        </div>

        <form action={signOut} className="mt-6">
          <button className="text-xs text-white/40">로그아웃</button>
        </form>
      </div>
    </main>
  );
}
