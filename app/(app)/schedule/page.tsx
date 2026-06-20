import { createClient } from "@/lib/supabase/server";
import type { ScheduleItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAY_LABEL: Record<number, string> = {
  1: "1일차",
  2: "2일차",
  3: "3일차",
};

export default async function SchedulePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("schedule")
    .select("*")
    .order("day")
    .order("sort_order");

  const items = (data as ScheduleItem[]) ?? [];
  const days = [...new Set(items.map((i) => i.day))].sort();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black">🗓️ 여행 일정</h1>

      {items.length === 0 && (
        <p className="text-sm text-white/50">아직 등록된 일정이 없습니다.</p>
      )}

      {days.map((day) => (
        <section key={day}>
          <h2 className="mb-3 text-sm font-bold text-gold">{DAY_LABEL[day] ?? `${day}일차`}</h2>
          <ol className="relative space-y-3 border-l border-border pl-4">
            {items
              .filter((i) => i.day === day)
              .map((it) => (
                <li key={it.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-gold" />
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{it.title}</span>
                      {it.start_time && (
                        <span className="shrink-0 text-xs text-white/50">
                          {it.start_time}
                        </span>
                      )}
                    </div>
                    {it.location && (
                      <p className="mt-0.5 text-xs text-white/50">📍 {it.location}</p>
                    )}
                    {it.description && (
                      <p className="mt-1 text-sm text-white/70">{it.description}</p>
                    )}
                  </div>
                </li>
              ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
