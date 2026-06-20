import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import DrawCeremony from "@/components/DrawCeremony";
import type { DrawState } from "@/lib/types";

const IDLE_DRAW: DrawState = {
  id: 1,
  status: "idle",
  assignments: [],
  revealed_count: 0,
  updated_at: "",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const isAdmin = profile.role === "admin";

  const supabase = await createClient();
  const { data: drawRow } = await supabase
    .from("draw_state")
    .select("*")
    .eq("id", 1)
    .single();
  const draw = (drawRow as DrawState) ?? IDLE_DRAW;

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
    </div>
  );
}
