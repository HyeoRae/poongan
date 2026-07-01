import { requireProfile } from "@/lib/auth";
import Gamble from "@/components/Gamble";
import ContentTabs from "@/components/ContentTabs";

export const dynamic = "force-dynamic";

export default async function GamblePage() {
  const me = await requireProfile();
  return (
    <div className="space-y-5">
      <ContentTabs />
      <Gamble initialGold={me.gold_balance} />
    </div>
  );
}
