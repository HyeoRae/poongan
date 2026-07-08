"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import { useQuizState, useQuizScores, useQuizAnswerCount } from "@/lib/hooks";
import {
  submitAnswer,
  quizBegin,
  quizStartQuestion,
  quizReveal,
  quizStartTiebreak,
  quizFinish,
  quizReset,
} from "@/app/(app)/quiz/actions";
import { startOutfitPachinko } from "@/app/(app)/admin/penaltyActions";
import type {
  QuizState,
  QuizScore,
  QuizQuestionPublic,
} from "@/lib/types";

type Person = { user_id: string; display_name: string; avatar_url: string | null };

export default function QuizRoom({
  me,
  initialState,
  initialScores,
  initialQuestion,
  people,
  myAnswer,
}: {
  me: { id: string; isAdmin: boolean; display_name: string };
  initialState: QuizState;
  initialScores: QuizScore[];
  initialQuestion: QuizQuestionPublic | null;
  people: Person[];
  myAnswer: number | null;
}) {
  const router = useRouter();
  const quiz = useQuizState(initialState);
  const scores = useQuizScores(initialScores);
  const submitCount = useQuizAnswerCount(
    me.isAdmin && quiz.status === "question" ? quiz.current_seq : null
  );

  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  // 내 선택(낙관적) — 서버 재조회(myAnswer)로도 동기화
  const [myChoice, setMyChoice] = useState<number | null>(myAnswer);
  useEffect(() => setMyChoice(myAnswer), [myAnswer]);

  // 상태/문제 전환 시 서버 재조회(quiz_current·myAnswer·scores 재하이드레이션)
  const lastKey = useRef("");
  useEffect(() => {
    const key = `${quiz.status}:${quiz.current_seq}`;
    if (lastKey.current && lastKey.current !== key) router.refresh();
    lastKey.current = key;
  }, [quiz.status, quiz.current_seq, router]);

  // 로컬 시계 틱 (3·2·1 카운트다운 + 20초 제한시간)
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  const nameMap = useMemo(
    () => new Map(people.map((p) => [p.user_id, p])),
    [people]
  );

  const startedAt = quiz.question_started_at
    ? Date.parse(quiz.question_started_at)
    : null;
  const deadline = quiz.question_deadline
    ? Date.parse(quiz.question_deadline)
    : null;

  // 문제 진행 하위 국면
  const beforeStart = startedAt != null && nowMs < startedAt;
  const secToStart = beforeStart ? Math.ceil((startedAt! - nowMs) / 1000) : 0;
  const live =
    startedAt != null && deadline != null && nowMs >= startedAt && nowMs < deadline;
  const secLeft = deadline != null ? Math.max(0, Math.ceil((deadline - nowMs) / 1000)) : 0;
  const timeUp = deadline != null && nowMs >= deadline;

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setMsg(null);
    startTransition(async () => {
      const r = await fn();
      if (r.message) setMsg(r.message);
      if (!r.ok && r.message) return;
    });
  }

  function choose(idx: number) {
    if (myChoice != null || !live) return;
    setMyChoice(idx); // 낙관적
    startTransition(async () => {
      const r = await submitAnswer(idx);
      if (!r.ok) {
        setMyChoice(null); // 실패 시 롤백
        setMsg(r.message);
      }
    });
  }

  // 관리자 진행 콘솔용 다음 seq 계산
  // 본게임은 이번 라운드에 서버가 뽑아 고정한 round_seqs 순서대로만 진행한다(100문제 중 랜덤 10).
  // 서든데스는 서버(quiz_start_tiebreak)가 안 나온 문제를 무작위로 뽑으므로 클라에서 seq 를 고르지 않는다.
  const roundSeqs = useMemo(() => quiz.round_seqs ?? [], [quiz.round_seqs]);
  const inTiebreak = quiz.phase === "tiebreak";
  // 현재 문제의 라운드 내 위치 다음 것. 마지막 문제면 undefined → 종료/서든데스로 분기.
  const curIdx = quiz.current_seq == null ? -1 : roundSeqs.indexOf(quiz.current_seq);
  const nextMainSeq = curIdx >= 0 ? roundSeqs[curIdx + 1] : undefined;

  const question = initialQuestion;
  const answerIdx = question?.answer_idx; // reveal 후에만 존재

  // 점수표(높은 순)
  const board = useMemo(() => {
    return [...scores]
      .filter((s) => nameMap.has(s.user_id))
      .sort((a, b) => b.total - a.total || b.correct_count - a.correct_count);
  }, [scores, nameMap]);

  const result = quiz.last_result;

  // ---------- 렌더 ----------
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">🧠 스피드 퀴즈쇼</h1>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-bold text-white/60">
          {inTiebreak ? "⚡ 서든데스" : "본게임"}
        </span>
      </div>

      {msg && (
        <div className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">
          {msg}
        </div>
      )}

      {/* ===== 대기(idle) ===== */}
      {quiz.status === "idle" && (
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-4xl">🎤</p>
          <p className="mt-2 font-bold">곧 퀴즈가 시작됩니다</p>
          <p className="mt-1 text-sm text-white/50">
            정답을 <b className="text-gold">빠르게</b> 고를수록 높은 점수! (정답 50점
            + 1등 30 · 2등 20 · 3등 10)
          </p>
        </div>
      )}

      {/* ===== 문제 진행(question) ===== */}
      {quiz.status === "question" && (
        <>
          {beforeStart ? (
            <div className="flex min-h-[46vh] flex-col items-center justify-center rounded-2xl border border-gold/40 bg-gold/5">
              <p className="text-sm text-white/50">준비…</p>
              <p className="animate-[pop_0.4s_ease] text-8xl font-black text-gold tabular-nums">
                {secToStart}
              </p>
              <p className="mt-2 text-sm text-white/50">곧 문제가 나옵니다!</p>
            </div>
          ) : (
            <>
              {/* 제한시간 바 */}
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-[width] duration-200 ${
                      secLeft <= 5 ? "bg-[#ff5a5a]" : "bg-gold"
                    }`}
                    style={{
                      width: `${
                        deadline && startedAt
                          ? Math.max(
                              0,
                              Math.min(
                                100,
                                ((deadline - nowMs) / (deadline - startedAt)) * 100
                              )
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <span
                  className={`w-9 text-right text-lg font-black tabular-nums ${
                    secLeft <= 5 ? "text-[#ff5a5a]" : "text-gold"
                  }`}
                >
                  {secLeft}
                </span>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-lg font-bold leading-snug">{question?.prompt}</p>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {(question?.choices ?? []).map((c, i) => {
                  const picked = myChoice === i;
                  return (
                    <button
                      key={i}
                      onClick={() => choose(i)}
                      disabled={myChoice != null || !live || pending}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-4 text-left text-base font-bold transition-colors disabled:opacity-60 ${
                        picked
                          ? "border-gold bg-gold/20 text-gold"
                          : "border-border bg-card text-white hover:border-gold/50"
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm">
                        {"①②③④⑤⑥"[i] ?? i + 1}
                      </span>
                      {c}
                    </button>
                  );
                })}
              </div>

              <p className="text-center text-sm text-white/50">
                {myChoice != null
                  ? "✅ 제출됐어요! 결과를 기다려주세요"
                  : timeUp
                  ? "⏱️ 시간 종료 — 곧 정답이 공개됩니다"
                  : "가장 빠른 정답이 최고점!"}
              </p>
            </>
          )}
        </>
      )}

      {/* ===== 정답 공개(reveal) ===== */}
      {quiz.status === "reveal" && (
        <div className="space-y-4">
          {result?.phase === "tiebreak" ? (
            <TiebreakReveal
              result={result}
              nameMap={nameMap}
              answerIdx={answerIdx}
              choices={question?.choices ?? []}
            />
          ) : (
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="mb-2 text-sm text-white/50">{question?.prompt}</p>
              <div className="space-y-2">
                {(question?.choices ?? []).map((c, i) => {
                  const isAnswer = answerIdx === i;
                  const mine = myChoice === i;
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-bold ${
                        isAnswer
                          ? "border-green-400/60 bg-green-400/15 text-green-300"
                          : mine
                          ? "border-[#ff5a5a]/50 bg-[#ff5a5a]/10 text-[#ff9a9a]"
                          : "border-border text-white/50"
                      }`}
                    >
                      <span>
                        {"①②③④⑤⑥"[i] ?? i + 1} {c}
                      </span>
                      {isAnswer && <span>✅ 정답</span>}
                      {mine && !isAnswer && <span>내 선택</span>}
                    </div>
                  );
                })}
              </div>
              {result?.phase === "main" && (
                <MyGain result={result} myId={me.id} myChoice={myChoice} />
              )}
            </div>
          )}

          {/* 실시간 누적 점수표 */}
          <Scoreboard board={board} nameMap={nameMap} myId={me.id} />
        </div>
      )}

      {/* ===== 종료(finished) ===== */}
      {quiz.status === "finished" && result?.phase === "finished" && (
        <div className="space-y-4">
          <FinishedView result={result} nameMap={nameMap} />
          <Scoreboard board={board} nameMap={nameMap} myId={me.id} />
        </div>
      )}

      {/* ===== 관리자 진행 콘솔 ===== */}
      {me.isAdmin && (
        <div className="sticky bottom-2 space-y-2 rounded-2xl border border-gold/40 bg-[#0d0d12] p-3">
          <p className="text-xs font-bold text-white/50">
            🎬 진행자 콘솔
            {quiz.status === "question" && !beforeStart && (
              <span className="ml-2 text-gold">· {submitCount}명 제출</span>
            )}
          </p>

          {quiz.status === "idle" && (
            <ConsoleBtn disabled={pending} onClick={() => run(() => quizBegin(10))}>
              ▶️ 퀴즈 시작 (랜덤 10문제)
            </ConsoleBtn>
          )}

          {quiz.status === "question" && (
            <ConsoleBtn disabled={pending} onClick={() => run(quizReveal)}>
              🔓 정답 공개 · 채점
            </ConsoleBtn>
          )}

          {quiz.status === "reveal" && !inTiebreak && (
            <>
              {nextMainSeq != null ? (
                <ConsoleBtn
                  disabled={pending}
                  onClick={() => run(() => quizStartQuestion(nextMainSeq))}
                >
                  ⏭️ 다음 문제
                </ConsoleBtn>
              ) : result?.phase === "finish_tie" ? (
                <ConsoleBtn disabled={pending} onClick={() => run(quizStartTiebreak)}>
                  ⚡ 서든데스 시작 (동점자)
                </ConsoleBtn>
              ) : (
                <ConsoleBtn disabled={pending} onClick={() => run(quizFinish)}>
                  🏁 종료 · 최저점 발표
                </ConsoleBtn>
              )}
            </>
          )}

          {quiz.status === "reveal" && inTiebreak && (
            <>
              {(quiz.tiebreak_user_ids?.length ?? 0) > 1 ? (
                <ConsoleBtn disabled={pending} onClick={() => run(quizStartTiebreak)}>
                  ⚡ 서든데스 다음 문제 (남은 {quiz.tiebreak_user_ids?.length}명)
                </ConsoleBtn>
              ) : (
                <ConsoleBtn disabled={pending} onClick={() => run(quizFinish)}>
                  🏁 벌칙 대상 확정
                </ConsoleBtn>
              )}
            </>
          )}

          {quiz.status === "finished" && result?.phase === "finished" && (
            <ConsoleBtn
              disabled={pending}
              onClick={() =>
                run(() => startOutfitPachinko(result.loser))
              }
            >
              🎭 이 사람 벌칙 옷 파칭코 시작
            </ConsoleBtn>
          )}

          {quiz.status !== "idle" && (
            <button
              disabled={pending}
              onClick={() => {
                if (confirm("퀴즈를 초기화할까요? 점수·답안이 모두 지워집니다."))
                  run(quizReset);
              }}
              className="w-full rounded-xl border border-border py-2 text-xs font-bold text-white/50 disabled:opacity-50"
            >
              🔄 초기화
            </button>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes pop {
          0% {
            transform: scale(0.6);
            opacity: 0;
          }
          60% {
            transform: scale(1.15);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

function ConsoleBtn({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-xl bg-gold py-3 text-base font-black text-black disabled:opacity-50"
    >
      {children}
    </button>
  );
}

// 내 이번 문제 획득 점수
function MyGain({
  result,
  myId,
  myChoice,
}: {
  result: Extract<import("@/lib/types").QuizResult, { phase: "main" }>;
  myId: string;
  myChoice: number | null;
}) {
  const mine = result.answers.find((a) => a.user_id === myId);
  if (myChoice == null && !mine)
    return (
      <p className="mt-3 text-center text-sm text-white/40">미제출 · +0점</p>
    );
  const score = mine?.score ?? 0;
  const correct = mine?.correct ?? false;
  return (
    <p className="mt-3 text-center text-sm font-bold">
      {correct ? (
        <span className="text-green-300">
          정답! +{score}점{mine?.rank ? ` · ${mine.rank}등 속도보너스` : ""}
        </span>
      ) : (
        <span className="text-[#ff9a9a]">아쉽! +0점</span>
      )}
    </p>
  );
}

// 서든데스 결과
function TiebreakReveal({
  result,
  nameMap,
  answerIdx,
  choices,
}: {
  result: Extract<import("@/lib/types").QuizResult, { phase: "tiebreak" }>;
  nameMap: Map<string, Person>;
  answerIdx?: number;
  choices: string[];
}) {
  const survivors = result.survivors ?? [];
  const safe = (result.participants ?? []).filter((u) => !survivors.includes(u));
  return (
    <div className="rounded-2xl border border-[#ff5a5a]/40 bg-[#ff5a5a]/5 p-5">
      <p className="mb-2 text-sm font-bold text-[#ff9a9a]">⚡ 서든데스</p>
      {answerIdx != null && (
        <p className="mb-3 text-sm text-white/60">
          정답: {"①②③④⑤⑥"[answerIdx] ?? answerIdx + 1} {choices[answerIdx]}
        </p>
      )}
      <p className="text-xs text-white/50">계속 대결 (벌칙 후보)</p>
      <div className="mb-2 mt-1 flex flex-wrap gap-1.5">
        {survivors.map((u) => (
          <span
            key={u}
            className="rounded-lg border border-[#ff5a5a]/50 bg-[#ff5a5a]/10 px-2.5 py-1 text-sm font-bold text-[#ff9a9a]"
          >
            {nameMap.get(u)?.display_name ?? "?"}
          </span>
        ))}
      </div>
      {safe.length > 0 && (
        <>
          <p className="text-xs text-white/50">면제 🎉</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {safe.map((u) => (
              <span
                key={u}
                className="rounded-lg bg-white/5 px-2.5 py-1 text-sm text-white/50"
              >
                {nameMap.get(u)?.display_name ?? "?"}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// 최종 결과 — 벌칙 대상
function FinishedView({
  result,
  nameMap,
}: {
  result: Extract<import("@/lib/types").QuizResult, { phase: "finished" }>;
  nameMap: Map<string, Person>;
}) {
  const loser = nameMap.get(result.loser);
  return (
    <div className="rounded-2xl border border-[#ff5a5a]/50 bg-[#ff5a5a]/10 p-6 text-center">
      <p className="text-sm text-white/60">최저점 · 벌칙 당첨</p>
      <div className="mt-3 flex flex-col items-center gap-2">
        <Avatar
          url={loser?.avatar_url ?? null}
          name={loser?.display_name ?? "?"}
          color="#ff5a5a"
          size={64}
        />
        <p className="text-3xl font-black">{loser?.display_name ?? "?"}</p>
      </div>
      <p className="mt-3 text-sm text-white/50">벌칙 옷 파칭코를 기다리세요 🎭</p>
    </div>
  );
}

// 누적 점수표
function Scoreboard({
  board,
  nameMap,
  myId,
}: {
  board: QuizScore[];
  nameMap: Map<string, Person>;
  myId: string;
}) {
  if (board.length === 0) return null;
  const min = board.length ? board[board.length - 1].total : 0;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-2 text-sm font-bold text-white/60">📊 실시간 점수표</p>
      <ul className="space-y-1">
        {board.map((s, i) => {
          const p = nameMap.get(s.user_id);
          const isMe = s.user_id === myId;
          const isLast = s.total === min;
          return (
            <li
              key={s.user_id}
              className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${
                isMe ? "bg-gold/15" : "bg-white/5"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="w-5 text-center text-xs font-black text-white/40">
                  {i + 1}
                </span>
                <span className={`font-semibold ${isLast ? "text-[#ff9a9a]" : ""}`}>
                  {p?.display_name ?? "?"}
                  {isMe && " (나)"}
                  {isLast && " 🩲"}
                </span>
              </span>
              <span className="font-black tabular-nums">{s.total}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
