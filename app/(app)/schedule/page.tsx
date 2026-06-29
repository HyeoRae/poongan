import { createClient } from "@/lib/supabase/server";
import type { ScheduleItem } from "@/lib/types";
import ScheduleTimeline from "@/components/ScheduleTimeline";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("schedule")
    .select("*")
    .order("day")
    .order("sort_order");

  const items = (data as ScheduleItem[]) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black">🗓️ 여행 일정</h1>

      {items.length === 0 ? (
        <p className="text-sm text-white/50">아직 등록된 일정이 없습니다.</p>
      ) : (
        <ScheduleTimeline items={items} />
      )}
    </div>
  );
}
