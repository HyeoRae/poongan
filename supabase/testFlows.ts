/**
 * Phase 8 — 다중 계정 통합 테스트 & 허점 탐침 (test1~test10)
 *
 * ⚠️ 먼저 0014·0015·0016 마이그레이션을 SQL Editor 에 적용한 뒤 실행하세요.
 * ⚠️ 이 스크립트는 test1~test10 계정을 만들고 build_teams/assign_roles 를 강제 실행하므로
 *     실제 이벤트 데이터(팀/역할)를 리셋합니다. 테스트 창에서만 돌리세요.
 *
 * 사용법:
 *   .env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *                 NEXT_PUBLIC_SUPABASE_ANON_KEY 필요
 *   npx tsx supabase/testFlows.ts
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const DOMAIN = process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN ?? "poongsan.app";
const emailOf = (u: string) => `${u.toLowerCase()}@${DOMAIN}`;

if (!URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("환경변수(URL, SERVICE_ROLE_KEY, ANON_KEY)를 .env.local 에 설정하세요.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0,
  fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}  ${detail}`);
  }
}

async function findUser(email: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === email) ?? null;
}

// 테스트 플레이어 보장 (test1~test10)
async function ensureTestPlayer(username: string) {
  const email = emailOf(username);
  let user = await findUser(email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: username,
      email_confirm: true,
      user_metadata: { username, display_name: username },
    });
    if (error) throw error;
    user = data.user;
  } else {
    await admin.auth.admin.updateUserById(user.id, { password: username });
  }
  await admin.from("profiles").upsert(
    {
      id: user.id,
      username,
      display_name: username,
      role: "player",
      is_bot: false,
      must_change_password: false,
    },
    { onConflict: "id" }
  );
  return user.id;
}

async function signIn(username: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({
    email: emailOf(username),
    password: username,
  });
  if (error) throw new Error(`로그인 실패(${username}): ${error.message}`);
  return c;
}

async function balance(uid: string): Promise<number> {
  const { data } = await admin.from("profiles").select("gold_balance").eq("id", uid).single();
  return (data?.gold_balance as number) ?? 0;
}

async function main() {
  console.log("== Phase 8 통합 테스트 시작 ==\n");

  const accounts = JSON.parse(readFileSync(resolve("supabase/accounts.json"), "utf-8"));
  const adminAcc = accounts.admins[0];

  // 0) 테스트 플레이어 10명 보장 + 시드 토큰
  console.log("[0] test1~test10 준비");
  const names = Array.from({ length: 10 }, (_, i) => `test${i + 1}`);
  const uids: Record<string, string> = {};
  for (const n of names) uids[n] = await ensureTestPlayer(n);
  const adminC = await signIn(adminAcc.username);
  for (const n of names) {
    await adminC.rpc("admin_grant_gold", { p_user: uids[n], p_amount: 100000, p_reason: "테스트 시드" });
  }
  check("시드 토큰 지급", (await balance(uids.test1)) >= 100000);

  // 1) 팀/역할 배정
  console.log("\n[1] 팀·역할 배정 (build_teams + assign_roles, force)");
  await adminC.rpc("build_teams", { p_force: true });
  await adminC.rpc("assign_roles", { p_force: true });
  const { data: roles } = await admin.from("player_roles").select("user_id, role");
  const { data: profs } = await admin
    .from("profiles")
    .select("id, team_id, is_bot")
    .eq("role", "player")
    .eq("is_bot", false);
  const teamIds = [...new Set((profs ?? []).map((p) => p.team_id).filter(Boolean))];
  for (const tid of teamIds) {
    const members = (profs ?? []).filter((p) => p.team_id === tid).map((p) => p.id);
    const spies = (roles ?? []).filter((r) => members.includes(r.user_id) && r.role === "spy");
    const jesters = (roles ?? []).filter((r) => members.includes(r.user_id) && r.role === "jester");
    check(`팀 ${tid}: 스파이 1명`, spies.length === 1, `(${spies.length})`);
    check(`팀 ${tid}: 광대 1명`, jesters.length === 1, `(${jesters.length})`);
    check(
      `팀 ${tid}: 스파이≠광대`,
      spies.length === 1 && jesters.length === 1 && spies[0].user_id !== jesters[0].user_id
    );
  }

  // 2) 송금 수수료 20% + 총량 보존
  console.log("\n[2] 송금 수수료");
  const aBefore = await balance(uids.test1);
  const bBefore = await balance(uids.test2);
  const t1 = await signIn("test1");
  const { error: tErr } = await t1.rpc("transfer_gold", { p_to: uids.test2, p_amount: 1000, p_reason: "테스트" });
  check("송금 성공", !tErr, tErr?.message ?? "");
  const aAfter = await balance(uids.test1);
  const bAfter = await balance(uids.test2);
  check("보낸이 -1000", aBefore - aAfter === 1000, `(${aBefore - aAfter})`);
  check("받는이 +800 (수수료 20% 소각)", bAfter - bBefore === 800, `(${bAfter - bBefore})`);

  // 3) 개인 잔액/원장 비밀화 (RLS)
  console.log("\n[3] 잔액 비밀화");
  const { data: otherProf } = await t1.from("profiles").select("id, gold_balance").eq("id", uids.test2).maybeSingle();
  check("남의 profiles 행 비노출", !otherProf, JSON.stringify(otherProf));
  const { data: pubList } = await t1.rpc("list_public_profiles");
  const pubRow = (pubList ?? []).find((p: { id: string }) => p.id === uids.test2);
  check("list_public_profiles 는 이름 노출", !!pubRow);
  check("list_public_profiles 에 gold_balance 없음", pubRow && !("gold_balance" in pubRow));
  const { data: otherTx } = await t1.from("transactions").select("id").eq("user_id", uids.test2);
  check("남의 거래내역 비노출", (otherTx ?? []).length === 0);

  // 4) 팀 합산 점수 공개 + 자동 갱신
  console.log("\n[4] team_totals");
  const { data: totals } = await t1.from("team_totals").select("*");
  check("team_totals 공개 조회 가능", (totals ?? []).length >= 2);

  // 5) 가챠: 무료 3연차 → 유료 비용 점증
  console.log("\n[5] 가챠");
  const t3 = await signIn("test3");
  const draws: { was_free: boolean; cost: number; blank: boolean }[] = [];
  for (let i = 0; i < 5; i++) {
    const { data, error } = await t3.rpc("draw_effect_card");
    if (error) {
      check(`뽑기 ${i + 1}`, false, error.message);
      break;
    }
    draws.push(data);
  }
  check("무료 3연차", draws.slice(0, 3).every((d) => d.was_free) && draws[3] && !draws[3].was_free);
  check("유료 비용 점증(30,45)", draws[3]?.cost === 30 && draws[4]?.cost === 45, `(${draws[3]?.cost},${draws[4]?.cost})`);

  // 6) 잔액 부족 시 뽑기 거부 (음수 방지)
  console.log("\n[6] 음수 방지");
  const t4 = await signIn("test4");
  await adminC.rpc("admin_grant_gold", { p_user: uids.test4, p_amount: -(await balance(uids.test4)), p_reason: "0으로" });
  // 무료 3회 소진
  for (let i = 0; i < 3; i++) await t4.rpc("draw_effect_card");
  const { error: broke } = await t4.rpc("draw_effect_card");
  check("잔액 0일 때 유료 뽑기 거부", !!broke, "거부되어야 함");
  check("잔액 음수 아님", (await balance(uids.test4)) >= 0);

  // 7) 효과카드 소모 (fee_free / peek / ledger)
  console.log("\n[7] 효과카드 소모");
  // fee_free: 수수료 0
  await adminC.rpc("admin_grant_card", { p_user: uids.test5, p_key: "fee_free" });
  await adminC.rpc("admin_grant_gold", { p_user: uids.test5, p_amount: 5000, p_reason: "테스트" });
  const t5 = await signIn("test5");
  const b6 = await balance(uids.test6);
  await t5.rpc("transfer_gold", { p_to: uids.test6, p_amount: 1000, p_reason: "무료송금" });
  check("무료송금: 받는이 +1000 (수수료 면제)", (await balance(uids.test6)) - b6 === 1000);
  // peek
  await adminC.rpc("admin_grant_card", { p_user: uids.test5, p_key: "peek" });
  const { data: peeked, error: peErr } = await t5.rpc("peek_role", { p_target: uids.test1 });
  check("관심법: 역할 반환", !peErr && !!(peeked as { role?: string })?.role, peErr?.message ?? "");
  const { error: peErr2 } = await t5.rpc("peek_role", { p_target: uids.test1 });
  check("관심법: 카드 없으면 재사용 불가", !!peErr2);
  // ledger
  await adminC.rpc("admin_grant_card", { p_user: uids.test5, p_key: "ledger" });
  const { data: led, error: leErr } = await t5.rpc("ledger_peek", { p_target: uids.test1 });
  check("흥신소: 전적 반환", !leErr && Array.isArray(led) && led.length === 1, leErr?.message ?? "");

  // 8) 흥신소 카드 없이 남의 통계 직접 조회 차단
  console.log("\n[8] 통계 무단 열람 차단");
  const { error: statErr } = await t5.rpc("get_player_stats", { p_target: uids.test1 });
  check("get_player_stats: 남의 것 차단", !!statErr, "차단되어야 함");
  const { error: selfStatErr } = await t5.rpc("get_player_stats", { p_target: uids.test5 });
  check("get_player_stats: 본인 것 허용", !selfStatErr, selfStatErr?.message ?? "");

  // 9) 재도전(mulligan): 진 도박 무르기, 이중환급 방지
  console.log("\n[9] 재도전");
  await adminC.rpc("admin_grant_gold", { p_user: uids.test7, p_amount: 50000, p_reason: "테스트" });
  await adminC.rpc("admin_grant_card", { p_user: uids.test7, p_key: "mulligan" });
  const t7 = await signIn("test7");
  // 질 때까지 동전 던지기(항상 front)
  let lost = false;
  for (let i = 0; i < 40 && !lost; i++) {
    const { data } = await t7.rpc("gamble_coinflip", { p_bet: 100, p_choice: "front" });
    if (data && (data as { win: boolean }).win === false) lost = true;
  }
  if (lost) {
    const bBeforeM = await balance(uids.test7);
    const { error: mErr } = await t7.rpc("use_mulligan");
    check("재도전 환급", !mErr && (await balance(uids.test7)) - bBeforeM === 100, mErr?.message ?? "");
    const { error: mErr2 } = await t7.rpc("use_mulligan");
    check("재도전 카드 소진 후 재사용 불가", !!mErr2);
  } else {
    console.log("  (40판 내 패배 없음 — 재도전 스킵)");
  }

  console.log(`\n== 결과: ${pass} PASS / ${fail} FAIL ==`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
