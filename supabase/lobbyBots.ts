/**
 * 대기실 + 퀴즈쇼 테스트 봇 — 시드 계정 여러 개로 동시에 로그인해
 * ① 이벤트 대기실 Presence 를 채우고(관리자가 대기실을 열면 즉시 로스터에 뜸),
 * ② 스피드 퀴즈쇼가 시작되면 사람처럼 잠깐 뒤 무작위 보기를 자동 제출한다.
 *
 * 사용법:
 *   npm run bots            # 기본 10명 (test1 ~ test10)
 *   npx tsx supabase/lobbyBots.ts 6   # 6명만
 *
 * 동작 요약:
 *   - test1~testN 계정을 서비스키로 보장(없으면 생성, is_bot=true 로 팀/경제에서 제외)
 *   - 각 봇이 로그인 → 'event-lobby-presence' 채널에 track  → 대기실에 카드로 보임
 *   - 'quiz_state' 를 1.5초마다 폴링 → status='question' 이면 사람처럼 랜덤 딜레이 후 제출
 *   - Ctrl+C 로 종료하면 프레즌스가 해제되어 대기실에서 사라진다.
 *
 * ⚠ 실제 Supabase 프로젝트에 계정을 만든다. 프로덕션이 아닌 테스트/스테이징에서만 쓸 것.
 *    (test* username 은 0011 마이그레이션 규칙상 is_bot 취급 → 팀 배정·후보 풀에서 제외됨)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DOMAIN = process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN ?? "poongsan.app";

if (!URL || !ANON || !SERVICE) {
  console.error(
    "환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)를 .env.local 에 설정하세요."
  );
  process.exit(1);
}

const COUNT = Math.min(Math.max(Number(process.argv[2]) || 10, 1), 30);
const PASSWORD = "testbot-pw-1234"; // 테스트 전용 고정 비번
const emailOf = (u: string) => `${u.toLowerCase()}@${DOMAIN}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const adminc = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 계정 보장: 없으면 생성 + 프로필/봇플래그 세팅, 있으면 비번만 리셋.
async function provision(username: string, displayName: string) {
  const email = emailOf(username);
  const { data: list, error } = await adminc.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  let user = list.users.find((u) => u.email === email) ?? null;
  if (!user) {
    const { data, error: cErr } = await adminc.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { username, display_name: displayName },
    });
    if (cErr) throw cErr;
    user = data.user;
    console.log(`  + 봇 계정 생성: ${username}`);
  } else {
    await adminc.auth.admin.updateUserById(user.id, { password: PASSWORD });
  }
  // profiles 보정 — is_bot=true 로 실제 팀/후보 풀에서 제외, 비번 변경 강제 해제.
  await adminc.from("profiles").upsert(
    {
      id: user!.id,
      username,
      display_name: displayName,
      role: "player",
      is_bot: true,
      must_change_password: false,
    },
    { onConflict: "id" }
  );
  return user!.id;
}

// 봇 하나: 로그인 → 대기실이 열리면 자동 입장(join) → 퀴즈 자동응답 루프.
async function runBot(username: string, displayName: string) {
  await provision(username, displayName);
  const sb: SupabaseClient = createClient(URL, ANON, {
    auth: { autoRefreshToken: true, persistSession: false },
  });
  const { error: aerr } = await sb.auth.signInWithPassword({
    email: emailOf(username),
    password: PASSWORD,
  });
  if (aerr) {
    console.error(`❌ ${displayName} 로그인 실패:`, aerr.message);
    return;
  }
  console.log(`🤖 ${displayName} 로그인 — 대기실 열리면 자동 입장`);

  // ── 대기실 입장 + 퀴즈 자동응답 루프 (event_lobby / quiz_state 폴링) ──
  let answeredSeq = -1;
  let joinedForOpen = false; // 이번 open 세션에 입장했는지 (닫히면 리셋 → 재오픈 시 재입장)
  for (;;) {
    // 대기실이 열려 있으면 입장(멱등). 닫히면 다음 오픈을 위해 플래그 리셋.
    const { data: lob } = await sb
      .from("event_lobby")
      .select("status")
      .eq("id", 1)
      .maybeSingle();
    if (lob?.status === "open") {
      if (!joinedForOpen) {
        const { error } = await sb.rpc("join_event_lobby");
        if (!error) {
          joinedForOpen = true;
          console.log(`  🛎️ ${displayName} 대기실 입장`);
        }
      }
    } else {
      joinedForOpen = false;
    }

    const { data: st } = await sb
      .from("quiz_state")
      .select("status,current_seq,question_started_at,question_deadline")
      .eq("id", 1)
      .maybeSingle();

    if (st?.status === "question" && st.current_seq != null && st.current_seq !== answeredSeq) {
      const startedAt = st.question_started_at ? Date.parse(st.question_started_at) : 0;
      const deadline = st.question_deadline ? Date.parse(st.question_deadline) : Infinity;
      const now = Date.now();
      // 아직 문제 시작 전(3초 카운트다운)이면 대기, 마감 지났으면 이번 문제 포기
      if (now < startedAt) {
        // 카운트다운 중 — 다음 폴링에서 다시 확인
      } else if (now <= deadline) {
        // 보기 개수 파악(정답은 question 중이라 내려오지 않음) 후 무작위 제출
        const { data: q } = await sb.rpc("quiz_current");
        const nChoices = Array.isArray(q?.choices) ? q.choices.length : 4;
        const think = 700 + Math.floor(Math.random() * 3500); // 사람처럼 0.7~4.2초 고민
        await sleep(Math.min(think, Math.max(deadline - Date.now() - 300, 0)));
        const choice = Math.floor(Math.random() * nChoices);
        const { error } = await sb.rpc("quiz_submit", { p_choice: choice });
        answeredSeq = st.current_seq;
        if (!error) console.log(`  ✏️ ${displayName} → ${st.current_seq}번 문제 ${choice + 1}번 제출`);
        else if (!/이미|already|시간|종료/.test(error.message))
          console.log(`  ⚠️ ${displayName} 제출 실패: ${error.message}`);
      } else {
        answeredSeq = st.current_seq; // 마감된 문제는 스킵 처리
      }
    }
    await sleep(1500);
  }
}

async function main() {
  console.log(`🚀 테스트 봇 ${COUNT}명 기동 (test1~test${COUNT}) …`);
  const bots = Array.from({ length: COUNT }, (_, i) =>
    runBot(`test${i + 1}`, `🤖 봇${i + 1}`)
  );
  // 종료 시 안내 (프레즌스는 프로세스가 죽으면 자동 해제됨)
  process.on("SIGINT", () => {
    console.log("\n👋 봇 종료 — 대기실에서 사라집니다.");
    process.exit(0);
  });
  await Promise.all(bots);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
