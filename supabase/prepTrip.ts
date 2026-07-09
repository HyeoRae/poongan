/**
 * 실전 준비 스크립트 — 봇 정리 + 앱 이력 초기화 + 초기 토큰 2,000 지급.
 *
 * reset.ts 와 달리 실제 참가자 계정(auth.users / profiles)은 보존한다.
 *  · 봇(is_bot=true)만 삭제
 *  · 리허설 이력 테이블 전량 비우기(실참가자분 포함)
 *  · 싱글톤 상태(draw/penalty/quiz/lobby) idle 리셋
 *  · 실참가자(role='player') gold_balance=2000, team_id=null + 원장 1건 기록
 *    (팀은 실전 배정식에서 다시 배정. team_totals 는 트리거로 자동)
 *
 * 사용법:
 *   npm run prep:trip            # 미리보기(대상만 출력, DB 변경 없음)
 *   npm run prep:trip -- --yes   # 실제 실행
 *
 * ⚠ 0028 마이그레이션까지 적용된 프로덕션에서 실행할 것. 되돌릴 수 없음.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const INITIAL_GOLD = 2000;
const CONFIRM = process.argv.includes("--yes");

if (!URL || !SERVICE_KEY) {
  console.error("환경변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)를 .env.local 에 설정하세요.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 이력 테이블 — [테이블, "항상 not null 인 PK 컬럼"]. 자식 → 부모 순서.
const HISTORY: [string, string][] = [
  ["quiz_answers", "user_id"],
  ["quiz_scores", "user_id"],
  ["penalty_picks", "id"],
  ["player_roles", "user_id"],
  ["player_effect_cards", "id"],
  ["player_gacha", "user_id"],
  ["thief_steals", "id"],
  ["hacker_sessions", "user_id"],
  ["bets", "id"],
  ["sutda_hands", "user_id"],
  ["sutda_players", "user_id"],
  ["sutda_rooms", "id"],
  ["event_lobby_members", "user_id"],
  ["game_plays", "id"],
  ["purchases", "id"],
  ["transactions", "id"],
];

async function main() {
  // 1) 대상 확인
  const { data: profiles, error: pErr } = await admin
    .from("profiles")
    .select("id, username, display_name, role, is_bot")
    .order("is_bot", { ascending: true });
  if (pErr) throw pErr;

  const bots = (profiles ?? []).filter((p) => p.is_bot);
  const players = (profiles ?? []).filter((p) => p.role === "player" && !p.is_bot);
  const admins = (profiles ?? []).filter((p) => p.role === "admin" && !p.is_bot);

  console.log("\n=== 프로필 현황 ===");
  console.log(`관리자(보존): ${admins.length}명 — ${admins.map((a) => a.username).join(", ")}`);
  console.log(`실참가자(보존, 토큰 ${INITIAL_GOLD} 지급): ${players.length}명 — ${players.map((p) => p.username).join(", ")}`);
  console.log(`봇(삭제): ${bots.length}명 — ${bots.map((b) => b.username).join(", ")}`);
  console.log("\n※ 위 '실참가자' 목록에 봇/테스트 계정이 섞여 있지 않은지 반드시 확인하세요.");

  if (!CONFIRM) {
    console.log("\n[미리보기] DB 를 변경하지 않았습니다. 실제 실행하려면:  npm run prep:trip -- --yes\n");
    return;
  }

  console.log("\n=== 실행 시작 ===");

  // 2) 이력 테이블 비우기
  for (const [table, col] of HISTORY) {
    const { error } = await admin.from(table).delete().not(col, "is", null);
    if (error) {
      console.warn(`  ⚠ ${table} 삭제 경고: ${error.message}`);
    } else {
      console.log(`  ${table} 비움`);
    }
  }

  // 3) 싱글톤 상태 idle 리셋
  await admin.from("draw_state").update({ status: "idle", assignments: [], revealed_count: 0 }).eq("id", 1);
  await admin
    .from("penalty_state")
    .update({ status: "idle", participants: [], winner_index: 0, mode: "person", target_user: null, lobby: [], slots: 0 })
    .eq("id", 1);
  await admin.from("event_lobby").update({ status: "closed", activity: null }).eq("id", 1);
  await admin
    .from("quiz_state")
    .update({ status: "idle", phase: "main", current_seq: null, round_seqs: null, tiebreak_user_ids: null, last_result: null })
    .eq("id", 1);
  console.log("  싱글톤 상태(draw/penalty/lobby/quiz) idle 로 초기화");

  // 4) 봇 계정 삭제 (profiles 는 cascade)
  for (const b of bots) {
    const { error } = await admin.auth.admin.deleteUser(b.id);
    if (error) console.warn(`  ⚠ 봇 삭제 실패(${b.username}): ${error.message}`);
    else console.log(`  - 봇 삭제: ${b.username}`);
  }

  // 5) 실참가자 초기 토큰 2,000 + team_id 해제 + 원장 기록
  for (const p of players) {
    const { error: uErr } = await admin
      .from("profiles")
      .update({ gold_balance: INITIAL_GOLD, team_id: null })
      .eq("id", p.id);
    if (uErr) {
      console.warn(`  ⚠ ${p.username} 잔액 세팅 실패: ${uErr.message}`);
      continue;
    }
    const { error: tErr } = await admin.from("transactions").insert({
      user_id: p.id,
      amount: INITIAL_GOLD,
      type: "admin_grant",
      reason: "초기 지급",
      created_by: p.id,
    });
    if (tErr) console.warn(`  ⚠ ${p.username} 원장 기록 실패: ${tErr.message}`);
  }
  console.log(`  실참가자 ${players.length}명 초기 토큰 ${INITIAL_GOLD} 지급 완료`);

  console.log("\n=== 완료 == 여행 시작 시 관리자 패널에서 앱 공개(is_public) 전환을 잊지 마세요.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
