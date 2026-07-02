import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import Wallet from "@/components/Wallet";
import type { PublicProfile, Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const me = await requireProfile();
  const supabase = await createClient();

  // 남의 잔액은 비공개 → 송금 대상 목록은 list_public_profiles(이름만).
  const [{ data: roster }, { data: txs }] = await Promise.all([
    supabase.rpc("list_public_profiles"),
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", me.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const others = ((roster as PublicProfile[]) ?? [])
    .filter((p) => p.id !== me.id)
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  // 관리자: 전체 참가자 거래 타임라인 초기값 + user_id→이름 매핑
  let adminTxs: Transaction[] = [];
  let nameMap: Record<string, string> = {};
  if (me.role === "admin") {
    const { data: allTxs } = await supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    adminTxs = (allTxs as Transaction[]) ?? [];
    nameMap = Object.fromEntries(
      ((roster as PublicProfile[]) ?? []).map((p) => [p.id, p.display_name])
    );
  }

  return (
    <Wallet
      me={me}
      others={others}
      transactions={(txs as Transaction[]) ?? []}
      adminTxs={adminTxs}
      nameMap={nameMap}
    />
  );
}
