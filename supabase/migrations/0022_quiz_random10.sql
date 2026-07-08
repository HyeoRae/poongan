-- =============================================================
-- 🧠 스피드 퀴즈쇼 — 본게임 100문제 중 랜덤 10문제 출제
-- 0020_quiz.sql 실행 후 이 파일을 SQL Editor에서 실행하세요.
--
-- 기존 0020 은 본게임 문제를 seq 오름차순으로 "전부" 진행했다(문제 8개 기준).
-- 문제 은행이 100개로 커지면서, 라운드 시작 시 main 문제 중 10개를 무작위로
-- 뽑아 quiz_state.round_seqs 에 "고정"하고 그 순서대로만 진행하도록 바꾼다.
--   · 서버 권위(RPC)로 한 번 뽑아 전원에게 Realtime 동기화 → 클라마다 다른 셔플/새로고침
--     로 흐트러지지 않는다.
--   · 서든데스(tiebreak)도 별도 문제 풀 없이 main 100문제 중 '아직 안 나온' 것을 무작위 출제한다
--     (아래 quiz_start_tiebreak() 를 인자 없는 시그니처로 재정의).
--   · 문제 제한시간을 30초 → 20초로 단축(quiz_start_question·quiz_begin·quiz_start_tiebreak 공통).
-- =============================================================

-- ── 라운드에 뽑힌 본게임 문제 순서(고정 셔플). null=아직 시작 안 함 ──
alter table public.quiz_state add column if not exists round_seqs int[];

-- 라운드 시작(관리자): main 문제 중 p_count 개를 무작위로 뽑아 round_seqs 에 고정하고
-- 첫 문제를 3초 카운트다운으로 연다. idle → 첫 문제까지 한 번에 처리.
create or replace function public.quiz_begin(p_count int default 10)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seqs int[];
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 가능합니다.'; end if;

  -- main 문제 중 무작위 p_count 개 → 뽑힌 것들끼리도 무작위 순서로 정렬해 배열화
  select array_agg(seq order by rnd) into v_seqs
  from (
    select seq, random() as rnd
    from public.quiz_questions
    where kind = 'main'
    order by random()
    limit greatest(p_count, 1)
  ) t;

  if v_seqs is null or array_length(v_seqs, 1) = 0 then
    raise exception '출제할 본게임 문제가 없습니다.';
  end if;

  update public.quiz_state
    set status = 'question',
        phase = 'main',
        round_seqs = v_seqs,
        current_seq = v_seqs[1],
        question_started_at = now() + interval '3 seconds',
        question_deadline   = now() + interval '3 seconds' + interval '20 seconds',
        tiebreak_user_ids = null,
        last_result = null,
        updated_at = now()
    where id = 1;
end;
$$;

-- 초기화(관리자): 기존 동작 + round_seqs 도 비워 다음 라운드에 새로 셔플되게 한다.
create or replace function public.quiz_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 가능합니다.'; end if;
  delete from public.quiz_answers;
  update public.quiz_scores set total = 0, correct_count = 0, updated_at = now();
  update public.quiz_state
    set status = 'idle', phase = 'main', current_seq = null,
        question_started_at = null, question_deadline = null,
        tiebreak_user_ids = null, round_seqs = null, last_result = null, updated_at = now()
    where id = 1;
end;
$$;

grant execute on function public.quiz_begin(int) to authenticated;

-- ── 서든데스: 별도 풀 없이 본게임 100문제에서 무작위 출제 ──
-- 0020 의 quiz_start_tiebreak(int) 은 tiebreak 전용 문제(seq 1001..)를 인자로 받았지만,
-- 이제 tiebreak 문제 풀을 없애고 "이번 게임에서 아직 안 나온 main 문제"를 무작위로 뽑는다.
-- 뽑은 seq 는 round_seqs 에 누적해 같은 게임에서 재출제되지 않게 한다.
drop function if exists public.quiz_start_tiebreak(int);

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
    -- 최초: 최저 누적점수 동점자 산출
    select min(total) into v_min from public.quiz_scores;
    select array_agg(user_id) into v_tied from public.quiz_scores where total = v_min;
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
  -- 100문제를 전부 소진한 극단적 경우엔 중복을 허용해서라도 이어간다(게임 진행 보장)
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

grant execute on function public.quiz_start_tiebreak() to authenticated;

-- ── 제한시간 20초: 0020 의 quiz_start_question 재정의(그 외 동작 동일) ──
-- '다음 문제'용. round_seqs 는 건드리지 않아 이번 라운드 문제 순서가 그대로 유지된다.
create or replace function public.quiz_start_question(p_seq int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 가능합니다.'; end if;
  perform 1 from public.quiz_questions where seq = p_seq and kind = 'main';
  if not found then raise exception '문제를 찾을 수 없습니다.'; end if;

  update public.quiz_state
    set status = 'question',
        phase = 'main',
        current_seq = p_seq,
        question_started_at = now() + interval '3 seconds',
        question_deadline   = now() + interval '3 seconds' + interval '20 seconds',
        tiebreak_user_ids = null,
        last_result = null,
        updated_at = now()
    where id = 1;
end;
$$;

grant execute on function public.quiz_start_question(int) to authenticated;
