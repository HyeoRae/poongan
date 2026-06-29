/**
 * 일정 갱신 스크립트 — 기존 schedule 테이블을 비우고 scheduleData.ts 내용으로 덮어쓴다.
 *
 * seed.ts 의 일정 삽입은 "비어있을 때만" 동작하므로, 이미 일정이 들어있는 DB의
 * 내용을 docs/schedule.md 기준으로 교체할 때 사용한다.
 *
 * 사용법:
 *   1) .env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정
 *   2) npm run seed:schedule
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { SCHEDULE_ITEMS } from "./scheduleData";

config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!URL || !SERVICE_KEY) {
  console.error("환경변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)를 .env.local 에 설정하세요.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("== 일정 갱신 시작 ==");

  const { error: delErr } = await admin.from("schedule").delete().gt("id", 0);
  if (delErr) throw delErr;
  console.log("  기존 일정 비움");

  const { error: insErr } = await admin.from("schedule").insert(SCHEDULE_ITEMS);
  if (insErr) throw insErr;
  console.log(`  일정 ${SCHEDULE_ITEMS.length}건 삽입`);

  console.log("== 일정 갱신 완료 ==");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
