import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import QuizRoom from "@/components/QuizRoom";
import type {
  QuizState,
  QuizScore,
  QuizQuestionPublic,
  PublicProfile,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const IDLE: QuizState = {
  id: 1,
  status: "idle",
  phase: "main",
  current_seq: null,
  question_started_at: null,
  question_deadline: null,
  round_seqs: null,
  tiebreak_user_ids: null,
  last_result: null,
  updated_at: "",
};

export default async function QuizPage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const isAdmin = me.role === "admin";

  const [
    { data: stateRow },
    { data: scoresRaw },
    { data: questionRaw },
    { data: profsRaw },
  ] = await Promise.all([
    supabase.from("quiz_state").select("*").eq("id", 1).single(),
    supabase.from("quiz_scores").select("*"),
    supabase.rpc("quiz_current"),
    supabase.rpc("list_public_profiles"),
  ]);

  const state = (stateRow as QuizState) ?? IDLE;
  const scores = (scoresRaw as QuizScore[]) ?? [];
  const question = (questionRaw as QuizQuestionPublic | null) ?? null;
  const people = ((profsRaw as PublicProfile[]) ?? []).map((p) => ({
    user_id: p.id,
    display_name: p.display_name,
    avatar_url: p.avatar_url,
  }));

  // 내가 현재 문제에 제출했는지 (RLS: 본인 답안만 조회 가능)
  let myAnswer: number | null = null;
  if (state.current_seq != null) {
    const { data: mine } = await supabase
      .from("quiz_answers")
      .select("choice_idx")
      .eq("seq", state.current_seq)
      .eq("user_id", me.id)
      .maybeSingle();
    myAnswer = (mine as { choice_idx: number } | null)?.choice_idx ?? null;
  }

  return (
    <div className="space-y-5">
      <QuizRoom
        me={{ id: me.id, isAdmin, display_name: me.display_name }}
        initialState={state}
        initialScores={scores}
        initialQuestion={question}
        people={people}
        myAnswer={myAnswer}
      />
    </div>
  );
}
