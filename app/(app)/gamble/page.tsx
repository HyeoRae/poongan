import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Gamble from "@/components/Gamble";

export const dynamic = "force-dynamic";

export default async function GamblePage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: bankRow } = await supabase
    .from("casino_bank")
    .select("balance")
    .eq("id", 1)
    .maybeSingle();
  return (
    <div className="space-y-5">
      <Gamble
        initialGold={me.gold_balance}
        initialBank={(bankRow as { balance: number } | null)?.balance ?? 0}
      />
    </div>
  );
}
