/**
 * 미니게임 프리셋 시드 — minigamesData.ts 의 게임을 draft 상태로 생성한다.
 * 같은 제목의 게임이 이미 있으면 건너뛴다(중복 방지). 멱등.
 *
 * 사용법:
 *   1) .env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정
 *   2) (0008_minigames.sql 마이그레이션 적용 후) npm run seed:games
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { MINIGAME_PRESETS } from "./minigamesData";

config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!URL || !SERVICE_KEY) {
  console.error(
    "환경변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)를 .env.local 에 설정하세요."
  );
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("== 미니게임 프리셋 시드 시작 ==");

  for (const p of MINIGAME_PRESETS) {
    // 이미 같은 제목이 있으면 스킵
    const { data: existing } = await admin
      .from("games")
      .select("id")
      .eq("title", p.title)
      .limit(1);
    if (existing && existing.length > 0) {
      console.log(`  · 이미 존재: ${p.title} (스킵)`);
      continue;
    }

    // 키워드로 연결 일정 찾기
    const { data: sched } = await admin
      .from("schedule")
      .select("id, title")
      .ilike("title", `%${p.scheduleKeyword}%`)
      .limit(1);
    const scheduleId = sched?.[0]?.id ?? null;

    const { error } = await admin.from("games").insert({
      type: "pool",
      title: p.title,
      schedule_id: scheduleId,
      status: "draft",
      option_source: p.option_source,
      config: p.description ? { description: p.description } : {},
    });
    if (error) throw error;

    console.log(
      `  + 생성: ${p.title} → 일정 ${
        sched?.[0]?.title ?? "(연결 안 됨)"
      }`
    );
  }

  console.log("== 미니게임 프리셋 시드 완료 ==");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
