import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import EffectCardGacha from "@/components/EffectCardGacha";
import MyEffectCards from "@/components/MyEffectCards";
import { GACHA_BASE, GACHA_MULT } from "@/lib/constants";
import type {
  EffectCardPreset,
  PlayerEffectCard,
  GachaState,
  PublicProfile,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CardPage() {
  const me = await requireProfile();
  const supabase = await createClient();

  const [{ data: presets }, { data: cards }, { data: gachaRow }, { data: roster }] =
    await Promise.all([
      supabase.from("effect_card_presets").select("*").order("id"),
      supabase
        .from("player_effect_cards")
        .select("*, preset:effect_card_presets(*)")
        .eq("user_id", me.id)
        .order("acquired_at", { ascending: false }),
      supabase
        .from("player_gacha")
        .select("*")
        .eq("user_id", me.id)
        .maybeSingle(),
      supabase.rpc("list_public_profiles"),
    ]);

  const gacha =
    (gachaRow as GachaState | null) ?? {
      user_id: me.id,
      free_left: 3,
      paid_count: 0,
    };
  const nextCost =
    gacha.free_left > 0 ? 0 : GACHA_BASE * Math.pow(GACHA_MULT, gacha.paid_count);

  // 관심법/흥신소 대상 목록 (본인·관리자·봇 제외)
  const targets = ((roster as PublicProfile[]) ?? []).filter(
    (p) => p.id !== me.id && p.role === "player" && !p.is_bot
  );

  return (
    <div className="space-y-5">
      <EffectCardGacha
        userId={me.id}
        presets={(presets as EffectCardPreset[]) ?? []}
        freeLeft={gacha.free_left}
        nextCost={nextCost}
      />
      <MyEffectCards
        userId={me.id}
        cards={(cards as PlayerEffectCard[]) ?? []}
        targets={targets.map((t) => ({ id: t.id, name: t.display_name }))}
      />
    </div>
  );
}
