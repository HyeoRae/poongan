/**
 * 초기화 스크립트 — 모든 계정과 테스트 데이터를 깨끗이 지운다.
 *
 * 지우는 것: 전체 Auth 계정(→ profiles 연쇄삭제), 풍산토큰 거래내역(transactions),
 *            게임기록(game_plays), 구매내역(purchases), 배정식 상태(draw_state) 초기화.
 * 남기는 것: 팀(teams), 일정(schedule), 상점아이템(shop_items).
 *
 * 사용법: npm run reset   (그 다음 npm run seed 로 다시 생성)
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

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
  console.log("== 초기화 시작 ==");

  // 1) 거래/게임/구매 내역 삭제 (외래키 때문에 계정보다 먼저)
  for (const table of ["transactions", "game_plays", "purchases"]) {
    const { error } = await admin.from(table).delete().gt("id", 0);
    if (error) throw error;
    console.log(`  ${table} 비움`);
  }

  // 2) 배정식 상태 초기화
  await admin
    .from("draw_state")
    .update({ status: "idle", assignments: [], revealed_count: 0 })
    .eq("id", 1);
  console.log("  draw_state idle 로 초기화");

  // 3) 전체 Auth 계정 삭제 (profiles 는 on delete cascade 로 함께 삭제됨)
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  for (const u of data.users) {
    const { error: dErr } = await admin.auth.admin.deleteUser(u.id);
    if (dErr) throw dErr;
    console.log(`  - 계정 삭제: ${u.email}`);
  }
  console.log(`  총 ${data.users.length}개 계정 삭제`);

  console.log("== 초기화 완료 == (이제 npm run seed 로 다시 생성하세요)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
