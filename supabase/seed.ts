/**
 * 시드 스크립트 — 12계정(관리자2+참가자10) + 팀2 + 일정 생성.
 *
 * 사용법:
 *   1) supabase/accounts.example.json → supabase/accounts.json 복사 후 실제 ID/PW/이름 입력
 *   2) .env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정
 *   3) npm run seed
 *
 * 멱등성: 같은 username 계정이 이미 있으면 건너뛰고 프로필만 보정한다.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DOMAIN = process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN ?? "poongsan.app";

if (!URL || !SERVICE_KEY) {
  console.error("환경변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)를 .env.local 에 설정하세요.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Account = { username: string; password: string; display_name: string };

function loadAccounts() {
  const path = resolve("supabase/accounts.json");
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  return {
    admins: raw.admins as Account[],
    players: raw.players as Account[],
  };
}

const emailOf = (u: string) => `${u.toLowerCase()}@${DOMAIN}`;

async function findUserByEmail(email: string) {
  // 소규모라 1페이지로 충분
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

async function upsertUser(acc: Account, role: "admin" | "player") {
  const email = emailOf(acc.username);
  let user = await findUserByEmail(email);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: acc.password,
      email_confirm: true,
      user_metadata: { username: acc.username, display_name: acc.display_name },
    });
    if (error) throw error;
    user = data.user;
    console.log(`  + 계정 생성: ${acc.username} (${role})`);
  } else {
    console.log(`  = 계정 존재: ${acc.username} (비번 갱신)`);
    await admin.auth.admin.updateUserById(user.id, { password: acc.password });
  }

  const { error: pErr } = await admin.from("profiles").upsert(
    {
      id: user.id,
      username: acc.username,
      display_name: acc.display_name,
      role,
      // 관리자는 강제 변경 제외, 참가자는 첫 로그인 시 변경 필요
      must_change_password: role !== "admin",
    },
    { onConflict: "id" }
  );
  if (pErr) throw pErr;
}

async function seedTeams() {
  const teams = [
    { id: 1, name: "통영팀", color: "#3b82f6" },
    { id: 2, name: "거제팀", color: "#ef4444" },
  ];
  const { error } = await admin.from("teams").upsert(teams, { onConflict: "id" });
  if (error) throw error;
  console.log("  팀 2개 준비 완료");
}

async function seedSchedule() {
  const items = [
    { day: 1, start_time: "10:00", title: "통영 집결 & 출발", location: "통영종합버스터미널", sort_order: 1 },
    { day: 1, start_time: "12:00", title: "점심 — 통영 충무김밥", location: "중앙시장", sort_order: 2 },
    { day: 1, start_time: "14:00", title: "🎲 팀 빌딩 & 오프닝 게임", description: "랜덤 5:5 팀 배정", sort_order: 3 },
    { day: 1, start_time: "16:00", title: "케이블카 & 동피랑 벽화마을", location: "통영", sort_order: 4 },
    { day: 1, start_time: "19:00", title: "저녁 & 숙소 체크인", location: "통영 숙소", sort_order: 5 },
    { day: 1, start_time: "21:00", title: "🃏 밤 도박장 오픈", description: "골드 베팅 컨텐츠", sort_order: 6 },
    { day: 2, start_time: "09:00", title: "거제 이동", location: "거제", sort_order: 1 },
    { day: 2, start_time: "11:00", title: "바람의 언덕 & 신선대", location: "거제", sort_order: 2 },
    { day: 2, start_time: "13:00", title: "점심 & 🎯 미션 게임", sort_order: 3 },
    { day: 2, start_time: "15:00", title: "외도 보타니아 / 해상관광", location: "거제", sort_order: 4 },
    { day: 2, start_time: "19:00", title: "저녁 BBQ & 🎤 팀 대항전", sort_order: 5 },
    { day: 2, start_time: "22:00", title: "🤝 배신의 밤 (송금/강탈)", sort_order: 6 },
    { day: 3, start_time: "10:00", title: "체크아웃 & 자유시간", location: "거제", sort_order: 1 },
    { day: 3, start_time: "12:00", title: "🏆 최종 골드 집계 & 시상", sort_order: 2 },
    { day: 3, start_time: "14:00", title: "해산", sort_order: 3 },
  ];
  // 일정은 멱등 보장이 어렵게 자동증가라 — 비어있을 때만 삽입
  const { count } = await admin.from("schedule").select("*", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    console.log("  일정 이미 존재 — 건너뜀");
    return;
  }
  const { error } = await admin.from("schedule").insert(items);
  if (error) throw error;
  console.log(`  일정 ${items.length}건 삽입`);
}

async function main() {
  console.log("== 시드 시작 ==");
  await seedTeams();

  const { admins, players } = loadAccounts();
  console.log(`관리자 ${admins.length}명, 참가자 ${players.length}명 처리`);
  for (const a of admins) await upsertUser(a, "admin");
  for (const p of players) await upsertUser(p, "player");

  await seedSchedule();
  console.log("== 시드 완료 ==");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
