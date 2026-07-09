-- =============================================================
-- 🧠 최저점·벌칙 후보를 "이번 게임에서 1문제 이상 제출한 사람"으로 한정. 0020~0025 적용 후.
--
-- 대기실 입장은 durable 이라, 입장만 하고 앱을 끄면(연결 끊김) 0점 참가자로 남아
-- 최저점=벌칙 대상 1순위가 되는 억울한 케이스가 있다. 이를 막기 위해
-- 최저점/서든데스 동점자 산출 시 "quiz_answers 에 제출 기록이 있는 참가자"만 후보로 본다.
--   · quiz_begin 이 매 게임 시작 시 quiz_answers 를 비우므로, 제출 기록 존재 = 이번 게임 참여.
--   · 전원 미제출(모두 이탈)인 극단적 경우엔 전체 참가자로 폴백해 게임이 멈추지 않게 한다.
-- 채점(quiz_reveal) 로직은 그대로 — 후보 풀 계산만 바뀐다.
-- =============================================================

-- 종료/최저점 산출(0020 override) — main 이면 "제출자 중" 최저 누적점.
create or replace function public.quiz_finish()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state  public.quiz_state;
  v_min    int;
  v_tied   uuid[];
  v_loser  uuid;
  v_result jsonb;
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 가능합니다.'; end if;
  select * into v_state from public.quiz_state where id = 1 for update;

  if v_state.phase = 'tiebreak' then
    if coalesce(array_length(v_state.tiebreak_user_ids, 1), 0) <> 1 then
      raise exception '아직 동점자가 남았습니다. 서든데스를 더 진행하세요.';
    end if;
    v_loser := v_state.tiebreak_user_ids[1];
  else
    -- 후보 = 이번 게임에서 1문제 이상 제출한 참가자만 (입장 후 이탈한 0점자 제외)
    select min(s.total) into v_min
      from public.quiz_scores s
      where exists (select 1 from public.quiz_answers a where a.user_id = s.user_id);
    if v_min is null then
      -- 전원 미제출 → 전체 참가자로 폴백
      select min(total) into v_min from public.quiz_scores;
      select array_agg(user_id) into v_tied from public.quiz_scores where total = v_min;
    else
      select array_agg(s.user_id) into v_tied
        from public.quiz_scores s
        where s.total = v_min
          and exists (select 1 from public.quiz_answers a where a.user_id = s.user_id);
    end if;

    if coalesce(array_length(v_tied, 1), 0) > 1 then
      -- 동점 → 종료하지 않고 서든데스 필요 표시
      v_result := jsonb_build_object('phase', 'finish_tie', 'needs_tiebreak', true,
                                     'tied', to_jsonb(v_tied), 'min', v_min);
      update public.quiz_state set last_result = v_result, updated_at = now() where id = 1;
      return v_result;
    end if;
    v_loser := v_tied[1];
  end if;

  v_result := jsonb_build_object(
    'phase', 'finished',
    'loser', v_loser,
    'ranking', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', user_id, 'total', total, 'correct_count', correct_count
      ) order by total desc, correct_count desc), '[]'::jsonb)
      from public.quiz_scores
    )
  );
  update public.quiz_state
    set status = 'finished', last_result = v_result, updated_at = now()
    where id = 1;
  return v_result;
end;
$$;

-- 서든데스 시작(0022 override) — 최초 동점자 산출도 "제출자 중" 최저점 기준.
create or replace function public.quiz_start_tiebreak()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.quiz_state;
  v_min   int;
  v_tied  uuid[];
  v_seq   int;
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 가능합니다.'; end if;
  select * into v_state from public.quiz_state where id = 1 for update;

  if v_state.phase <> 'tiebreak' or v_state.tiebreak_user_ids is null then
    -- 최초: 제출자 중 최저 누적점수 동점자 산출
    select min(s.total) into v_min
      from public.quiz_scores s
      where exists (select 1 from public.quiz_answers a where a.user_id = s.user_id);
    if v_min is null then
      select min(total) into v_min from public.quiz_scores;
      select array_agg(user_id) into v_tied from public.quiz_scores where total = v_min;
    else
      select array_agg(s.user_id) into v_tied
        from public.quiz_scores s
        where s.total = v_min
          and exists (select 1 from public.quiz_answers a where a.user_id = s.user_id);
    end if;
    if coalesce(array_length(v_tied, 1), 0) < 2 then
      raise exception '동점자가 없습니다.';
    end if;
  else
    v_tied := v_state.tiebreak_user_ids;   -- 이어가기(생존자 유지)
  end if;

  -- 이미 나온 문제(round_seqs) 제외하고 main 에서 무작위 1문제
  select seq into v_seq
  from public.quiz_questions
  where kind = 'main'
    and not (seq = any(coalesce(v_state.round_seqs, array[]::int[])))
  order by random()
  limit 1;
  if v_seq is null then
    select seq into v_seq from public.quiz_questions where kind = 'main' order by random() limit 1;
  end if;
  if v_seq is null then raise exception '출제할 문제가 없습니다.'; end if;

  update public.quiz_state
    set status = 'question',
        phase = 'tiebreak',
        current_seq = v_seq,
        round_seqs = array_append(coalesce(round_seqs, array[]::int[]), v_seq),
        tiebreak_user_ids = v_tied,
        question_started_at = now() + interval '3 seconds',
        question_deadline   = now() + interval '3 seconds' + interval '20 seconds',
        last_result = null,
        updated_at = now()
    where id = 1;
end;
$$;
