/**
 * 🧠 스피드 퀴즈쇼 시드 — quizData.ts 의 문제를 quiz_questions 에 올린다(멱등).
 *
 * 참가자 점수 행은 여기서 미리 만들지 않는다 — quiz_scores 에는 게임 중 실제로
 * 답을 제출한 사람만 행이 생기고(quiz_reveal), 그들만이 최저점·벌칙 대상이 된다.
 * (예전엔 전체 프로필을 0 점으로 시드해, 접속도 안 한 사람이 벌칙 후보에 끌려왔음)
 *
 * 사용법:
 *   1) .env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정
 *   2) (0020_quiz.sql 마이그레이션 적용 후) npm run seed:quiz
 *
 * ⚠ 정답(answerIdx)이 담긴 quizData.ts 는 이 스크립트(서버)에서만 import 한다.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { QUIZ_QUESTIONS } from "./quizData";

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
  console.log("== 스피드 퀴즈 시드 시작 ==");

  // 1) 문제 업서트 (seq 기준 멱등 — 다시 실행하면 지문/정답만 갱신)
  const rows = QUIZ_QUESTIONS.map((q) => ({
    seq: q.seq,
    kind: q.kind,
    prompt: q.prompt,
    choices: q.choices,
    answer_idx: q.answerIdx,
  }));
  const { error: qErr } = await admin
    .from("quiz_questions")
    .upsert(rows, { onConflict: "seq" });
  if (qErr) throw qErr;
  console.log(
    `  + 문제 ${rows.length}개 업서트 (전부 본게임 — 서든데스는 본게임 문제에서 무작위 출제)`
  );

  // 2) 참가자 점수 행 0 으로 준비 (봇만 제외 — 관리자도 퀴즈에 참여/채점·벌칙 대상에 포함)
  //    ⚠ 참여 = 최저점이면 관리자도 벌칙 대상이 될 수 있음(진행은 그대로 관리자가 함).
  const { data: participants, error: pErr } = await admin
    .from("profiles")
    .select("id")
    .eq("is_bot", false);
  if (pErr) throw pErr;

  const scoreRows = ((participants as { id: string }[]) ?? []).map((p) => ({
    user_id: p.id,
    total: 0,
    correct_count: 0,
  }));
  if (scoreRows.length > 0) {
    // 이미 있는 행은 건드리지 않음(진행 중 재시드 대비). 초기화는 quiz_reset RPC 로.
    const { error: sErr } = await admin
      .from("quiz_scores")
      .upsert(scoreRows, { onConflict: "user_id", ignoreDuplicates: true });
    if (sErr) throw sErr;
  }
  console.log(`  + 참가자 점수 행 ${scoreRows.length}명 준비`);

  console.log("== 스피드 퀴즈 시드 완료 ==");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
