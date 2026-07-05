"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/app/actions";
import type { AppSettings, ScheduleItem } from "@/lib/types";
import ScheduleTimeline from "@/components/ScheduleTimeline";
import MyProfileCard from "@/components/MyProfileCard";
import NotificationGate from "@/components/NotificationGate";

// 참가자가 스스로 챙길 준비물
const PREP_ITEMS = [
  { id: "underwear", emoji: "🩲", label: "속옷 · 양말 3벌" },
  { id: "clothes", emoji: "👕", label: "편한 옷 · 신발" },
  { id: "toiletry", emoji: "🧴", label: "선크림 · 세면도구" },
  { id: "id", emoji: "🪪", label: "신분증" },
  { id: "charger", emoji: "🔌", label: "충전기" },
  { id: "swimsuit", emoji: "🩱", label: "수영복" },
];

const STORAGE_KEY = "prep-checklist-v1";

type Tab = "prep" | "schedule";

export default function LockedScreen({
  userId,
  displayName,
  avatarUrl,
  teamColor,
  schedule,
}: {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  teamColor: string | null;
  schedule: ScheduleItem[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("prep");
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // 체크 상태를 기기에 저장/복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setChecked(JSON.parse(saved));
    } catch {
      /* 무시 */
    }
  }, []);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* 무시 */
      }
      return next;
    });
  }

  const doneCount = PREP_ITEMS.filter((i) => checked[i.id]).length;
  const allDone = doneCount === PREP_ITEMS.length;

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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      {/* 인사 */}
      <div className="text-center">
        <div className="text-5xl">🎒</div>
        <h1 className="mt-3 text-2xl font-black text-gold">
          {displayName}야 반가워!
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          앱 내용은 <b className="text-gold">아직 공개 전</b>이에요.
          <br />
          출발 전에 준비물부터 챙겨볼까요? (공개되면 <b>자동 입장</b>)
        </p>
      </div>

      {/* 탭 */}
      <div className="mt-6 flex gap-2 rounded-2xl border border-border bg-card p-1">
        <button
          onClick={() => setTab("prep")}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
            tab === "prep" ? "bg-gold text-black" : "text-white/60"
          }`}
        >
          🎒 준비물
        </button>
        <button
          onClick={() => setTab("schedule")}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
            tab === "schedule" ? "bg-gold text-black" : "text-white/60"
          }`}
        >
          🗓️ 일정
        </button>
      </div>

      <div className="mt-5 flex-1">
        {tab === "prep" ? (
          <div className="space-y-4">
            {/* 프로필 사진 미리 등록 */}
            <MyProfileCard
              userId={userId}
              displayName={displayName}
              avatarUrl={avatarUrl}
              teamColor={teamColor}
            />

            {/* 진행 상황 */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold">
                  {allDone ? "🎉 준비 완료!" : "준비물 챙기기"}
                </span>
                <span className="text-white/50">
                  {doneCount} / {PREP_ITEMS.length}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gold transition-all duration-300"
                  style={{
                    width: `${(doneCount / PREP_ITEMS.length) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* 체크리스트 */}
            <ul className="space-y-2">
              {PREP_ITEMS.map((item) => {
                const on = !!checked[item.id];
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => toggle(item.id)}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
                        on
                          ? "border-gold/40 bg-gold/10"
                          : "border-border bg-card"
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs transition-colors ${
                          on
                            ? "border-gold bg-gold text-black"
                            : "border-white/30 text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                      <span className="text-lg">{item.emoji}</span>
                      <span
                        className={`flex-1 font-semibold ${
                          on ? "text-white/50 line-through" : ""
                        }`}
                      >
                        {item.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="px-1 text-center text-xs text-white/40">
              체크 상태는 이 기기에 저장돼요.
            </p>
          </div>
        ) : schedule.length === 0 ? (
          <p className="text-center text-sm text-white/50">
            아직 등록된 일정이 없습니다.
          </p>
        ) : (
          <ScheduleTimeline items={schedule} />
        )}
      </div>

      <form action={signOut} className="mt-8 text-center">
        <button className="text-xs text-white/40">로그아웃</button>
      </form>

      {/* 공개 전에도 미리 알림을 켜두게 안내 */}
      <NotificationGate />
    </main>
  );
}
