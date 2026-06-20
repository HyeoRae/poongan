import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import Wallet from "@/components/Wallet";
import type { Profile, Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const me = await requireProfile();
  const supabase = await createClient();

  const [{ data: others }, { data: txs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .neq("id", me.id)
      .order("display_name"),
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", me.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <Wallet
      me={me}
      others={(others as Profile[]) ?? []}
      transactions={(txs as Transaction[]) ?? []}
    />
  );
}
