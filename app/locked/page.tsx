import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import LockedScreen from "@/components/LockedScreen";
import type { ScheduleItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LockedPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.must_change_password) redirect("/change-password");
  if (profile.role === "admin") redirect("/dashboard");

  // 이미 공개됐으면 들어가게
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("app_settings")
    .select("is_public")
    .eq("id", 1)
    .single();
  if (settings?.is_public) redirect("/dashboard");

  // 공개 전에도 참가자가 볼 수 있는 여행 일정 + 팀 색(아바타 폴백용)
  const [{ data: scheduleRaw }, { data: teamRow }] = await Promise.all([
    supabase.from("schedule").select("*").order("day").order("sort_order"),
    profile.team_id
      ? supabase
          .from("teams")
          .select("color")
          .eq("id", profile.team_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);
  const schedule = (scheduleRaw as ScheduleItem[]) ?? [];
  const teamColor = (teamRow as { color: string } | null)?.color ?? null;

  return (
    <LockedScreen
      userId={profile.id}
      displayName={profile.display_name}
      avatarUrl={profile.avatar_url}
      teamColor={teamColor}
      schedule={schedule}
    />
  );
}
