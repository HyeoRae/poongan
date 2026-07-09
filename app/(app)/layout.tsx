import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import DrawCeremony from "@/components/DrawCeremony";
import PenaltyCeremony from "@/components/PenaltyCeremony";
import EventLobby from "@/components/EventLobby";
import NotificationGate from "@/components/NotificationGate";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import StealAlert from "@/components/StealAlert";
import type { DrawState, PenaltyState, EventLobby as EventLobbyState } from "@/lib/types";

const IDLE_DRAW: DrawState = {
  id: 1,
  status: "idle",
  assignments: [],
  revealed_count: 0,
  updated_at: "",
};

const IDLE_PENALTY: PenaltyState = {
  id: 1,
  status: "idle",
  style: null,
  outfit: null,
  participants: [],
  winner_index: 0,
  seed: 0,
  slots: 0,
  lobby: [],
  mode: "person",
  target_user: null,
  updated_at: "",
};

const CLOSED_LOBBY: EventLobbyState = {
  id: 1,
  status: "closed",
  title: null,
  activity: null,
  updated_at: "",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  // 첫 로그인 — 비밀번호 변경 전이면 강제 이동
  if (profile.must_change_password) redirect("/change-password");

  const isAdmin = profile.role === "admin";

  const supabase = await createClient();

  // 앱 비공개 상태면 참가자는 잠금 화면으로 (관리자는 통과)
  if (!isAdmin) {
    const { data: settings } = await supabase
      .from("app_settings")
      .select("is_public")
      .eq("id", 1)
      .single();
    if (!settings?.is_public) redirect("/locked");
  }
  const [{ data: drawRow }, { data: penaltyRow }, { data: lobbyRow }] =
    await Promise.all([
      supabase.from("draw_state").select("*").eq("id", 1).single(),
      supabase.from("penalty_state").select("*").eq("id", 1).single(),
      supabase.from("event_lobby").select("*").eq("id", 1).single(),
    ]);
  const draw = (drawRow as DrawState) ?? IDLE_DRAW;
  const penalty = (penaltyRow as PenaltyState) ?? IDLE_PENALTY;
  const eventLobby = (lobbyRow as EventLobbyState) ?? CLOSED_LOBBY;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <TopBar
        userId={profile.id}
        displayName={profile.display_name}
        initialGold={profile.gold_balance}
        isAdmin={isAdmin}
      />
      <main className="flex-1 px-4 py-4">{children}</main>
      <BottomNav isAdmin={isAdmin} />
      <DrawCeremony isAdmin={isAdmin} initial={draw} />
      <PenaltyCeremony isAdmin={isAdmin} myUserId={profile.id} initial={penalty} />
      <EventLobby
        isAdmin={isAdmin}
        me={{
          user_id: profile.id,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          is_admin: isAdmin,
        }}
        initial={eventLobby}
      />
      <StealAlert userId={profile.id} />
      <NotificationGate />
      <ServiceWorkerRegister />
    </div>
  );
}
