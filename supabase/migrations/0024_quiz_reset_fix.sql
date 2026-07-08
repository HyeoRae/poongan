-- =============================================================
-- 🧠 퀴즈 초기화 수정 + 참가자 = "실제 답변자" 로 한정. 0020~0022 실행 후 적용.
--
-- 두 가지 문제 해결:
--  1) quiz_reset 의 WHERE 없는 delete/update 가 safe-updates 설정에 막혀
--     "DELETE requires a WHERE clause" 오류가 나던 것 → where true 로 명시.
--  2) 점수 행을 0 으로 "남기지" 말고 삭제 → 다음 게임의 참가자/최저점 판정이
--     이번 게임에서 실제로 제출한 사람만을 대상으로 이뤄진다.
--     (seedQuiz 의 전체 프로필 점수 사전 시드 제거와 짝을 이룸 —
--      접속/참여하지 않은 사람이 0점으로 벌칙 후보에 끌려오던 문제 해결)
-- =============================================================

create or replace function public.quiz_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 가능합니다.'; end if;
  delete from public.quiz_answers where true;
  delete from public.quiz_scores where true;  -- 유령 참가자 제거 — 다음 게임은 실제 답변자만
  update public.quiz_state
    set status = 'idle', phase = 'main', current_seq = null,
        question_started_at = null, question_deadline = null,
        tiebreak_user_ids = null, round_seqs = null, last_result = null, updated_at = now()
    where id = 1;
end;
$$;
