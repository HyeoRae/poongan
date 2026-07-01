import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type {
  SutdaRoom,
  SutdaPlayer,
  SutdaHand,
  SutdaRoomListItem,
} from "@/lib/types";
import Sutda from "@/components/Sutda";
import SutdaRoomView from "@/components/SutdaRoom";
import ContentTabs from "@/components/ContentTabs";

export const dynamic = "force-dynamic";

export default async function SutdaPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const me = await requireProfile();
  const supabase = await createClient();
  const sp = await searchParams;
  const roomId = Number(sp?.room) || null;
  const isAdmin = me.role === "admin";

  // ---------- 로비 ----------
  if (!roomId) {
    const { data: roomsRaw } = await supabase
      .from("sutda_rooms")
      .select("*")
      .neq("status", "closed")
      .order("created_at", { ascending: false });
    const rooms = (roomsRaw as SutdaRoom[]) ?? [];

    const ids = rooms.map((r) => r.id);
    const { data: playersRaw } = await supabase
      .from("sutda_players")
      .select("room_id, user_id, is_active")
      .in("room_id", ids.length ? ids : [-1]);
    const players =
      (playersRaw as Pick<SutdaPlayer, "room_id" | "user_id" | "is_active">[]) ?? [];

    const list: SutdaRoomListItem[] = rooms.map((r) => ({
      ...r,
      player_count: players.filter((p) => p.room_id === r.id && p.is_active).length,
      joined: players.some((p) => p.room_id === r.id && p.user_id === me.id && p.is_active),
    }));

    return (
      <div className="space-y-5">
        <ContentTabs />
        <Sutda me={{ id: me.id, isAdmin }} rooms={list} />
      </div>
    );
  }

  // ---------- 방 ----------
  const { data: roomRaw } = await supabase
    .from("sutda_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
  const room = roomRaw as SutdaRoom | null;
  if (!room || room.status === "closed") redirect("/sutda");

  const { data: playersRaw } = await supabase
    .from("sutda_players")
    .select("*")
    .eq("room_id", roomId)
    .order("seat");
  const players = (playersRaw as SutdaPlayer[]) ?? [];

  // 표시 이름 매핑 (개인 잔액 비공개 → list_public_profiles 로 이름만)
  const { data: profsRaw } = await supabase.rpc("list_public_profiles");
  const nameMap = new Map<string, string>(
    ((profsRaw as { id: string; display_name: string }[]) ?? []).map((p) => [
      p.id,
      p.display_name,
    ])
  );
  const playersNamed = players.map((p) => ({
    ...p,
    display_name: nameMap.get(p.user_id) ?? "?",
  }));

  const myRow = players.find((p) => p.user_id === me.id);
  const seated = !!myRow && myRow.is_active;
  const isSpectator = !seated && isAdmin;

  // 내 패 (착석 + 진행 중)
  let myHand: SutdaHand | null = null;
  if (seated && room.hand_no > 0) {
    const { data } = await supabase
      .from("sutda_hands")
      .select("*")
      .eq("room_id", roomId)
      .eq("hand_no", room.hand_no)
      .eq("user_id", me.id)
      .maybeSingle();
    myHand = (data as SutdaHand) ?? null;
  }

  return (
    <SutdaRoomView
      me={{ id: me.id, isAdmin }}
      room={room!}
      players={playersNamed}
      seated={seated}
      isSpectator={isSpectator}
      myHand={myHand}
    />
  );
}
