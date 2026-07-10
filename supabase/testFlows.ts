/**
 * Phase 8 — 다중 계정 통합 테스트 & 허점 탐침 (test1~test10)
 *
 * 검증 항목:
 *   [0~1]  시드 지급 · 팀/역할 배정(스파이·광대 정확히 1명)
 *   [2]    송금 수수료 — 기대값을 lib/constants.ts 상수로 계산(SQL parity 가드)
 *   [3~4]  잔액/원장 RLS 비밀화 · team_totals 공개
 *   [5~6]  가챠 무료→유료 비용 점증(GACHA_* parity) · 음수 잔액 거부
 *   [7]    효과카드 소모(fee_free / fee_half parity / peek / ledger)
 *   [8~9]  통계 무단열람 차단 · 재도전 이중환급 방지
 *   [10]   ★ 풀 정산 — 팟 보존(토큰 총량 불변) + 파리뮤추얼 배당
 *   [11]   ★ 잔액 == 거래원장 합 불변식(전원, _apply_gold 정합성)
 *   [12]   ★ admin_grant 만큼 총 공급량 정확히 증가
 *   [13]   ★ 도박 하우스세 parity(HOUSE_TAX_BASE) + 세무조사 + 잭팟 재분배 총량 보존
 *   [14]   ★ 카지노 뱅크롤 — 도박 총량 보존(Σ플레이어+뱅크+잭팟풀 불변, 발행 없음)
 *   미검증: 섯다 팟 정산, 동시성/경쟁조건 (TODO)
 *
 * parity 가드: SQL RPC 의 밸런스 값이 lib/constants.ts 상수와 어긋나면 [2][5][7] 이 FAIL 한다.
 *
 * ⚠️ 먼저 0014·0015·0016 마이그레이션을 SQL Editor 에 적용한 뒤 실행하세요.
 * ⚠️ 이 스크립트는 test1~test10 계정을 만들고 build_teams/assign_roles 를 강제 실행하므로
 *     실제 이벤트 데이터(팀/역할)를 리셋합니다. 테스트 창에서만 돌리세요(프로덕션 금지).
 *
 * 사용법:
 *   .env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *                 NEXT_PUBLIC_SUPABASE_ANON_KEY 필요
 *   npm run test:flows   (= npx tsx supabase/testFlows.ts)
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// ⚠ 밸런스 상수 parity 가드: 기대값을 여기서 계산해, SQL RPC 가 상수와 어긋나면 테스트가 FAIL 한다.
import {
  TRANSFER_FEE_PCT,
  TRANSFER_FEE_HALF_PCT,
  GACHA_FREE,
  GACHA_BASE,
  GACHA_STEP,
  HOUSE_TAX_BASE,
  HOUSE_TAX_RICH,
  TAX_AUDIT_PCT,
} from "../lib/constants";

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

  // 2) 송금 수수료 + 총량 보존 — 기대값을 TRANSFER_FEE_PCT 로 계산(SQL v_rate 와 parity)
  console.log("\n[2] 송금 수수료");
  const XFER = 1000;
  const expFee = Math.floor(XFER * TRANSFER_FEE_PCT);
  const expRecv = XFER - expFee;
  const aBefore = await balance(uids.test1);
  const bBefore = await balance(uids.test2);
  const t1 = await signIn("test1");
  const { error: tErr } = await t1.rpc("transfer_gold", { p_to: uids.test2, p_amount: XFER, p_reason: "테스트" });
  check("송금 성공", !tErr, tErr?.message ?? "");
  const aAfter = await balance(uids.test1);
  const bAfter = await balance(uids.test2);
  check(`보낸이 -${XFER}`, aBefore - aAfter === XFER, `(${aBefore - aAfter})`);
  check(
    `받는이 +${expRecv} (수수료 ${TRANSFER_FEE_PCT * 100}% 소각)`,
    bAfter - bBefore === expRecv,
    `(${bAfter - bBefore}, 기대 ${expRecv})`
  );

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

  // 5) 가챠: 무료 N연차 → 유료 비용 점증 — 기대값을 GACHA_* 상수로 계산(SQL parity)
  console.log("\n[5] 가챠");
  const t3 = await signIn("test3");
  const nDraws = GACHA_FREE + 2; // 무료 소진 후 유료 2회까지 확인
  const draws: { was_free: boolean; cost: number; blank: boolean }[] = [];
  for (let i = 0; i < nDraws; i++) {
    const { data, error } = await t3.rpc("draw_effect_card");
    if (error) {
      check(`뽑기 ${i + 1}`, false, error.message);
      break;
    }
    draws.push(data);
  }
  check(
    `무료 ${GACHA_FREE}연차`,
    draws.slice(0, GACHA_FREE).every((d) => d.was_free) && draws[GACHA_FREE] && !draws[GACHA_FREE].was_free
  );
  const expCost0 = GACHA_BASE; // 첫 유료(paid_count=0)
  const expCost1 = GACHA_BASE + GACHA_STEP; // 둘째 유료(paid_count=1)
  check(
    `유료 비용 점증(${expCost0},${expCost1})`,
    draws[GACHA_FREE]?.cost === expCost0 && draws[GACHA_FREE + 1]?.cost === expCost1,
    `(${draws[GACHA_FREE]?.cost},${draws[GACHA_FREE + 1]?.cost})`
  );

  // 6) 잔액 부족 시 뽑기 거부 (음수 방지)
  console.log("\n[6] 음수 방지");
  const t4 = await signIn("test4");
  await adminC.rpc("admin_grant_gold", { p_user: uids.test4, p_amount: -(await balance(uids.test4)), p_reason: "0으로" });
  // 무료 뽑기 소진
  for (let i = 0; i < GACHA_FREE; i++) await t4.rpc("draw_effect_card");
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
  // fee_half(큰손): 수수료 절반 — 기대값을 TRANSFER_FEE_HALF_PCT 로 계산(SQL parity)
  await adminC.rpc("admin_grant_card", { p_user: uids.test8, p_key: "fee_half" });
  await adminC.rpc("admin_grant_gold", { p_user: uids.test8, p_amount: 5000, p_reason: "테스트" });
  const t8 = await signIn("test8");
  const HALF_XFER = 1000;
  const expHalfRecv = HALF_XFER - Math.floor(HALF_XFER * TRANSFER_FEE_HALF_PCT);
  const b9 = await balance(uids.test9);
  await t8.rpc("transfer_gold", { p_to: uids.test9, p_amount: HALF_XFER, p_reason: "큰손송금" });
  const b9recv = (await balance(uids.test9)) - b9;
  check(
    `큰손송금: 받는이 +${expHalfRecv} (수수료 ${TRANSFER_FEE_HALF_PCT * 100}%)`,
    b9recv === expHalfRecv,
    `(${b9recv}, 기대 ${expHalfRecv})`
  );
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

  // 10) 풀(pool) 예측배팅 정산 — 팟 보존(토큰 총량 불변) + 파리뮤추얼 배당
  console.log("\n[10] 풀 정산");
  // 서비스롤로 open 상태 게임 + 커스텀 선택지 2개 생성
  const { data: pg, error: pgErr } = await admin
    .from("games")
    .insert({ type: "pool", title: "정산테스트", status: "open", option_source: "custom", config: {} })
    .select("id")
    .single();
  if (pgErr || !pg) {
    check("풀 게임 생성", false, pgErr?.message ?? "");
  } else {
    const { data: opts } = await admin
      .from("bet_options")
      .insert([
        { game_id: pg.id, label: "A", sort_order: 0 },
        { game_id: pg.id, label: "B", sort_order: 1 },
      ])
      .select("id, sort_order");
    const optA = (opts ?? []).find((o) => o.sort_order === 0)?.id;
    const optB = (opts ?? []).find((o) => o.sort_order === 1)?.id;

    // 베팅: A에 test1=300·test2=100(우승, winstake=400), B에 test3=200(패). pot=600
    const p1 = await balance(uids.test1);
    const p2 = await balance(uids.test2);
    const p3 = await balance(uids.test3);
    const t2b = await signIn("test2");
    await t1.rpc("place_bet", { p_game: pg.id, p_option: optA, p_amount: 300 });
    await t2b.rpc("place_bet", { p_game: pg.id, p_option: optA, p_amount: 100 });
    await t3.rpc("place_bet", { p_game: pg.id, p_option: optB, p_amount: 200 });

    const { data: settle, error: sErr } = await adminC.rpc("settle_pool_game", {
      p_game: pg.id,
      p_winning_option: optA,
    });
    check("풀 정산 성공", !sErr, sErr?.message ?? "");
    check(
      "풀 정산: 팟=600 / winstake=400",
      Number(settle?.pot) === 600 && Number(settle?.winner_stake) === 400,
      JSON.stringify(settle)
    );

    const net1 = (await balance(uids.test1)) - p1; // 배당450 - 스테이크300 = +150
    const net2 = (await balance(uids.test2)) - p2; // 배당150 - 스테이크100 = +50
    const net3 = (await balance(uids.test3)) - p3; // 배당0   - 스테이크200 = -200
    // 핵심 불변식: 풀은 토큰을 만들지도 없애지도 않는다 → 참가자 순증감 합 = 0
    check("풀 정산: 팟 보존(순증감 합 0)", net1 + net2 + net3 === 0, `(${net1}+${net2}+${net3})`);
    check("풀 정산: 파리뮤추얼 배당(+150/+50)", net1 === 150 && net2 === 50, `(net1=${net1}, net2=${net2})`);
    check("풀 정산: 패자 스테이크 소실(-200)", net3 === -200, `(${net3})`);
    // 지급 원장 합 == 팟
    const { data: paidRows } = await admin.from("bets").select("payout").eq("game_id", pg.id);
    const paidSum = (paidRows ?? []).reduce((s, r) => s + (r.payout as number), 0);
    check("풀 정산: 지급합 = 팟(600)", paidSum === 600, `(${paidSum})`);
  }

  // 11) 잔액 = 원장 총량 불변식 — 지금까지의 모든 변동이 _apply_gold 로만 일어났는지 사후 검증
  //     (프로필 초기 잔액 0 + 모든 변동이 transactions 에 기록되므로 balance == Σ(amount) 여야 함)
  console.log("\n[11] 잔액=원장 불변식");
  let invOk = true;
  for (const n of names) {
    const bal = await balance(uids[n]);
    const { data: txs } = await admin.from("transactions").select("amount").eq("user_id", uids[n]);
    const sum = (txs ?? []).reduce((s, r) => s + (r.amount as number), 0);
    if (bal !== sum) {
      invOk = false;
      console.log(`  ⚠ ${n}: balance=${bal} ledger=${sum}`);
    }
  }
  check("전원 잔액 == 거래원장 합 (_apply_gold 정합성)", invOk);

  // 12) 총 공급량 방향성 — admin_grant 는 공급을 그만큼 정확히 늘린다
  console.log("\n[12] 총 공급량");
  const { data: g0 } = await adminC.rpc("get_global_stats");
  const GRANT = 777;
  await adminC.rpc("admin_grant_gold", { p_user: uids.test10, p_amount: GRANT, p_reason: "공급량 테스트" });
  const { data: g1 } = await adminC.rpc("get_global_stats");
  const supply0 = Number(g0?.[0]?.total_supply ?? 0);
  const supply1 = Number(g1?.[0]?.total_supply ?? 0);
  check("admin_grant 만큼 총공급 증가", supply1 - supply0 === GRANT, `(Δ${supply1 - supply0})`);

  // 13) 도박 하우스세 + 잭팟 재분배 (빈부격차 완화)
  //     세율을 (base, rich=0) 로 고정해 부(富)구간과 무관하게 결정론적으로 검증.
  //     test10 은 효과카드 미보유(부스트 없음) → 순이익=베팅액.
  console.log("\n[13] 하우스세 · 잭팟 재분배");
  await adminC.rpc("set_house_tax", { p_on: true, p_base: HOUSE_TAX_BASE, p_rich: 0 });
  // 뱅크롤 도입(0033): 당첨금은 카지노 뱅크에서 지급되므로, 상한에 걸리지 않게 넉넉히 투입.
  await adminC.rpc("adjust_casino_bank", { p_amount: 10_000_000 });
  const BET = 1000;
  const expTax = Math.floor(BET * HOUSE_TAX_BASE); // 순이익(=베팅액)의 base%
  const expNet = BET - expTax; // 세후 순이익
  const poolBefore = Number(
    (await admin.from("jackpot_pool").select("amount").eq("id", 1).single()).data?.amount ?? 0
  );
  const t10 = await signIn("test10");
  // 이길 때까지 동전 던지기(항상 front)
  let won13 = false;
  let net13 = 0;
  for (let i = 0; i < 60 && !won13; i++) {
    const bBet = await balance(uids.test10);
    const { data } = await t10.rpc("gamble_coinflip", { p_bet: BET, p_choice: "front" });
    if (data && (data as { win: boolean }).win === true) {
      won13 = true;
      net13 = (await balance(uids.test10)) - bBet; // 세후 순이익
    }
  }
  if (won13) {
    check(`하우스세 parity: 세후 순이익 +${expNet}`, net13 === expNet, `(${net13}, 기대 ${expNet})`);
    const poolAfterWin = Number(
      (await admin.from("jackpot_pool").select("amount").eq("id", 1).single()).data?.amount ?? 0
    );
    check(
      `하우스세: 세금 ${expTax}이 잭팟풀 적립`,
      poolAfterWin - poolBefore === expTax,
      `(Δ${poolAfterWin - poolBefore}, 기대 ${expTax})`
    );
  } else {
    console.log("  (60판 내 승리 없음 — 하우스세 parity 스킵)");
  }

  // 세무조사: 대상 잔액의 TAX_AUDIT_PCT 를 잭팟풀로 징수
  await adminC.rpc("admin_grant_card", { p_user: uids.test10, p_key: "tax_audit" });
  const t1bal = await balance(uids.test1);
  const expAudit = Math.floor(t1bal * TAX_AUDIT_PCT);
  const poolBeforeAudit = Number(
    (await admin.from("jackpot_pool").select("amount").eq("id", 1).single()).data?.amount ?? 0
  );
  const { error: auditErr } = await t10.rpc("use_tax_audit", { p_target: uids.test1 });
  check("세무조사 실행", !auditErr, auditErr?.message ?? "");
  const t1after = await balance(uids.test1);
  const poolAfterAudit = Number(
    (await admin.from("jackpot_pool").select("amount").eq("id", 1).single()).data?.amount ?? 0
  );
  check(
    `세무조사: 대상 -${expAudit} · 잭팟풀 +${expAudit}`,
    t1bal - t1after === expAudit && poolAfterAudit - poolBeforeAudit === expAudit,
    `(대상Δ${t1bal - t1after}, 풀Δ${poolAfterAudit - poolBeforeAudit}, 기대 ${expAudit})`
  );
  const { error: auditErr2 } = await t10.rpc("use_tax_audit", { p_target: uids.test1 });
  check("세무조사: 카드 소진 후 재사용 불가", !!auditErr2);

  // 로빈훗 분배: 잭팟풀 전액이 하위 절반에게 → 총량 보존(풀=총공급 증가분), 풀=0
  const { data: gs0 } = await adminC.rpc("get_global_stats");
  const poolToDist = Number(
    (await admin.from("jackpot_pool").select("amount").eq("id", 1).single()).data?.amount ?? 0
  );
  if (poolToDist > 0) {
    const { data: dist, error: distErr } = await adminC.rpc("distribute_jackpot");
    check("잭팟 분배 성공", !distErr, distErr?.message ?? "");
    const poolAfterDist = Number(
      (await admin.from("jackpot_pool").select("amount").eq("id", 1).single()).data?.amount ?? 0
    );
    const { data: gs1 } = await adminC.rpc("get_global_stats");
    const supplyDelta = Number(gs1?.[0]?.total_supply ?? 0) - Number(gs0?.[0]?.total_supply ?? 0);
    check("잭팟 분배 후 풀=0", poolAfterDist === 0, `(${poolAfterDist})`);
    check(
      "잭팟 분배: 총량 보존(공급증가=분배액)",
      supplyDelta === poolToDist,
      `(Δ${supplyDelta}, 풀 ${poolToDist})`
    );
    check("잭팟 분배: 반환 pool 일치", Number(dist?.pool) === poolToDist, JSON.stringify(dist));
  } else {
    console.log("  (잭팟풀이 비어 분배 스킵)");
  }
  // 14) 카지노 뱅크롤 총량 보존 — 도박이 토큰을 새로 발행하지 않는다.
  //     불변식: Σ(플레이어 잔액) + 카지노 뱅크 + 잭팟풀 = 도박 전후 동일.
  console.log("\n[14] 뱅크롤 총량 보존(발행 없음)");
  const totalAll = async (): Promise<number> => {
    const { data: profs } = await admin
      .from("profiles")
      .select("gold_balance")
      .eq("role", "player");
    const pSum = (profs ?? []).reduce((s, r) => s + (r.gold_balance as number), 0);
    const bank = Number(
      (await admin.from("casino_bank").select("balance").eq("id", 1).single()).data?.balance ?? 0
    );
    const pool = Number(
      (await admin.from("jackpot_pool").select("amount").eq("id", 1).single()).data?.amount ?? 0
    );
    return pSum + bank + pool;
  };
  const S0 = await totalAll();
  for (let i = 0; i < 20; i++) {
    await t10.rpc("gamble_roulette", { p_bet: 500, p_choice: String((i % 10) + 1) });
  }
  const S1 = await totalAll();
  check("도박 20판 후 총량 불변(Σ플레이어+뱅크+잭팟풀)", S0 === S1, `(S0=${S0}, S1=${S1})`);

  // 하우스세 기본값 복원(테스트가 남기는 상태 정리)
  await adminC.rpc("set_house_tax", {
    p_on: true,
    p_base: HOUSE_TAX_BASE,
    p_rich: HOUSE_TAX_RICH,
  });
  // TODO(후속): 섯다 팟 정산 정확성, 병렬 송금/동시 도박 등 동시성·경쟁조건 커버리지는 미검증.

  console.log(`\n== 결과: ${pass} PASS / ${fail} FAIL ==`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
