import { requireProfile } from "@/lib/auth";
import Gamble from "@/components/Gamble";

export const dynamic = "force-dynamic";

export default async function GamblePage() {
  const me = await requireProfile();
  return <Gamble initialGold={me.gold_balance} />;
}
