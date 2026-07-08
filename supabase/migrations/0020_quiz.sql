-- =============================================================
-- 🧠 실시간 스피드 퀴즈쇼 (벌칙 선정 게임 #1)
-- 0001~0019 실행 후 이 파일을 SQL Editor에서 실행하세요.
-- event_lobby(0019)·penalty(0017)·sutda(0009) 싱글톤/상태머신 패턴을 본떴습니다.
--
-- 흐름: 관리자가 문제를 열면(quiz_start_question) question_started_at(=now()+3초)
-- 를 미래로 잡아 전원 화면이 3·2·1 카운트다운 후 "동시에" 문제를 연다.
-- 참가자는 제한시간(30초) 안에 quiz_submit 으로 정답을 고르고, 제출 시각은
-- 서버가 clock_timestamp() 로 찍어 "누가 먼저 눌렀는지"를 정밀 판별한다.
-- 관리자가 quiz_reveal 하면 정답 공개 + 속도순 점수(정답 50 + 1등30/2등20/3등10).
--
-- ⚠ 정답(answer_idx)은 절대 클라이언트로 새면 안 됨:
--   quiz_questions 는 SELECT 정책이 없어 클라가 직접 못 읽고,
--   quiz_current() RPC 가 question 중엔 지문·보기만, reveal 후에만 정답을 준다.
-- =============================================================

-- ── 진행 상태 (싱글톤 id=1) — 상태머신 전체를 한 행에 압축 ──
create table if not exists public.quiz_state (
  id                   int primary key default 1,
  status               text not null default 'idle'
    check (status in ('idle','question','reveal','finished')),
  phase                text not null default 'main'
    check (phase in ('main','tiebreak')),          -- main=본게임, tiebreak=동점자 서든데스
  current_seq          int,                         -- 현재 문제(quiz_questions.seq)
  question_started_at  timestamptz,                 -- 문제 오픈 서버시각(=트리거+3초). 3·2·1 기준점
  question_deadline    timestamptz,                 -- started_at + 30초. 이후 제출 거부
  tiebreak_user_ids    uuid[],                      -- 서든데스 남은 동점자. main이면 null
  last_result          jsonb,                       -- reveal/finished 스냅샷
  updated_at           timestamptz not null default now(),
  constraint quiz_state_singleton check (id = 1)
);

insert into public.quiz_state (id, status) values (1, 'idle')
on conflict (id) do nothing;

alter table public.quiz_state enable row level security;
drop policy if exists "read_quiz_state" on public.quiz_state;
create policy "read_quiz_state" on public.quiz_state for select to authenticated using (true);
-- 쓰기 정책 없음 — 아래 RPC(SECURITY DEFINER)로만.

-- ── 문제 (seed 로 주입; 정답 포함 — 직접 SELECT 차단) ──
create table if not exists public.quiz_questions (
  seq        int primary key,                       -- 출제 순서(본게임 1..N, 서든데스는 1001.. 대역 권장)
  kind       text not null default 'main' check (kind in ('main','tiebreak')),
  prompt     text not null,
  choices    jsonb not null,                        -- ["보기1","보기2","보기3","보기4"]
  answer_idx int not null                           -- 정답 인덱스 (⚠ 클라 노출 금지)
);

alter table public.quiz_questions enable row level security;
-- SELECT 정책을 일부러 두지 않는다 → 클라이언트는 직접 못 읽고 quiz_current() 로만 노출.

-- ── 제출 (사용자×문제 1행) — 서버 시각으로 순서 판별 ──
create table if not exists public.quiz_answers (
  seq         int not null references public.quiz_questions(seq),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  choice_idx  int not null,
  answered_at timestamptz not null default clock_timestamp(),  -- ★속도 순위 기준(트랜잭션 아닌 실시각)
  primary key (seq, user_id)                                   -- 1인 1제출(중복 방지)
);

alter table public.quiz_answers enable row level security;
-- 읽기: 본인 제출만(+관리자 전체). 실시간 제출 인원 카운트는 관리자만 전체를 봄.
drop policy if exists "read_own_quiz_answers" on public.quiz_answers;
create policy "read_own_quiz_answers" on public.quiz_answers for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));
-- 쓰기 정책 없음 — quiz_submit() RPC 로만.

-- ── 누적 점수표 ──
create table if not exists public.quiz_scores (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  total         int not null default 0,
  correct_count int not null default 0,             -- 참고(동점 표시용)
  updated_at    timestamptz not null default now()
);

alter table public.quiz_scores enable row level security;
drop policy if exists "read_quiz_scores" on public.quiz_scores;
create policy "read_quiz_scores" on public.quiz_scores for select to authenticated using (true);
-- 쓰기 정책 없음 — RPC 로만.

-- =============================================================
-- RPC (모두 security definer; 관리자용은 is_admin 재검증, 상태 전환은 for update)
-- =============================================================

-- 문제 노출(참가자용): question 중엔 지문·보기만, reveal 후에만 정답 포함.
create or replace function public.quiz_current()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.quiz_state;
  v_q     public.quiz_questions;
begin
  select * into v_state from public.quiz_state where id = 1;
  if v_state.current_seq is null then return null; end if;
  select * into v_q from public.quiz_questions where seq = v_state.current_seq;
  if not found then return null; end if;

  if v_state.status in ('reveal','finished') then
    return jsonb_build_object(
      'seq', v_q.seq, 'kind', v_q.kind,
      'prompt', v_q.prompt, 'choices', v_q.choices,
      'answer_idx', v_q.answer_idx
    );
  end if;
  -- question 진행 중 — 정답 제외
  return jsonb_build_object(
    'seq', v_q.seq, 'kind', v_q.kind,
    'prompt', v_q.prompt, 'choices', v_q.choices
  );
end;
$$;

-- 문제 목록(관리자 전용): 진행 콘솔이 다음 문제/서든데스 문제를 고르는 용도.
-- 정답(answer_idx)은 주지 않는다 — 진행 순서·지문만.
create or replace function public.quiz_list_questions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 가능합니다.'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'seq', seq, 'kind', kind, 'prompt', prompt
    ) order by seq), '[]'::jsonb)
    from public.quiz_questions
  );
end;
$$;

-- 문제 시작(관리자): 3초 뒤 동시 오픈되도록 started_at 을 미래로.
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
        question_deadline   = now() + interval '3 seconds' + interval '30 seconds',
        tiebreak_user_ids = null,
        last_result = null,
        updated_at = now()
    where id = 1;
end;
$$;

-- 정답 제출(참가자): 서버 시각 기록, 1인 1회.
create or replace function public.quiz_submit(p_choice int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.quiz_state;
  v_uid   uuid := auth.uid();
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  select * into v_state from public.quiz_state where id = 1;
  if v_state.status <> 'question' then raise exception '지금은 제출할 수 없습니다.'; end if;
  if v_state.question_started_at is null or now() < v_state.question_started_at then
    raise exception '아직 문제가 시작되지 않았습니다.';
  end if;
  if v_state.question_deadline is not null and now() > v_state.question_deadline then
    raise exception '시간이 종료되었습니다.';
  end if;
  if v_state.phase = 'tiebreak'
     and not (v_uid = any(coalesce(v_state.tiebreak_user_ids, array[]::uuid[]))) then
    raise exception '서든데스 참가자가 아닙니다.';
  end if;

  begin
    insert into public.quiz_answers(seq, user_id, choice_idx)
      values (v_state.current_seq, v_uid, p_choice);
  exception when unique_violation then
    raise exception '이미 제출했습니다.';
  end;
end;
$$;

-- 정답 공개 + 채점(관리자): main=점수누적, tiebreak=탈락(가장 못한 쪽만 남김).
create or replace function public.quiz_reveal()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state    public.quiz_state;
  v_seq      int;
  v_answer   int;
  v_result   jsonb;
  v_ntotal   int;
  v_all      uuid[];
  v_correct  uuid[];
  v_wrong    uuid[];
  v_survivors uuid[];
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 가능합니다.'; end if;
  select * into v_state from public.quiz_state where id = 1 for update;
  if v_state.status <> 'question' then raise exception '진행 중인 문제가 없습니다.'; end if;
  v_seq := v_state.current_seq;
  select answer_idx into v_answer from public.quiz_questions where seq = v_seq;

  if v_state.phase = 'main' then
    -- 점수 반영 (정답자 속도순 보너스)
    with ranked as (
      select user_id, choice_idx,
             row_number() over (partition by (choice_idx = v_answer) order by answered_at) as rnk
      from public.quiz_answers where seq = v_seq
    )
    insert into public.quiz_scores as s (user_id, total, correct_count, updated_at)
    select user_id,
           case when choice_idx = v_answer
                then 50 + (case rnk when 1 then 30 when 2 then 20 when 3 then 10 else 0 end)
                else 0 end,
           case when choice_idx = v_answer then 1 else 0 end,
           now()
    from ranked
    on conflict (user_id) do update
      set total = s.total + excluded.total,
          correct_count = s.correct_count + excluded.correct_count,
          updated_at = now();

    -- 스냅샷(문제별 상세)
    with ranked as (
      select user_id, choice_idx, answered_at,
             row_number() over (partition by (choice_idx = v_answer) order by answered_at) as rnk
      from public.quiz_answers where seq = v_seq
    )
    select jsonb_build_object(
      'phase', 'main', 'seq', v_seq, 'answer_idx', v_answer,
      'answers', coalesce(jsonb_agg(jsonb_build_object(
        'user_id', user_id,
        'choice', choice_idx,
        'correct', (choice_idx = v_answer),
        'rank', case when choice_idx = v_answer then rnk else null end,
        'score', case when choice_idx = v_answer
                      then 50 + (case rnk when 1 then 30 when 2 then 20 when 3 then 10 else 0 end)
                      else 0 end
      ) order by answered_at), '[]'::jsonb)
    ) into v_result
    from ranked;

  else
    -- tiebreak: 참여자 중 "가장 못한 쪽"만 남겨 1명이 될 때까지 좁힌다.
    v_ntotal := coalesce(array_length(v_state.tiebreak_user_ids, 1), 0);
    with parts as (select unnest(v_state.tiebreak_user_ids) as user_id),
    ans as (
      select p.user_id, a.answered_at,
             (a.choice_idx = v_answer) as correct
      from parts p
      left join public.quiz_answers a on a.seq = v_seq and a.user_id = p.user_id
    )
    select array_agg(user_id),
           array_agg(user_id) filter (where correct),
           array_agg(user_id) filter (where coalesce(correct, false) = false)
      into v_all, v_correct, v_wrong
    from ans;

    if v_correct is not null and array_length(v_correct, 1) < v_ntotal then
      -- 일부만 정답 → 오답/미제출자가 계속(정답자는 면제)
      v_survivors := v_wrong;
    elsif v_correct is not null and array_length(v_correct, 1) = v_ntotal then
      -- 전원 정답 → 가장 느린 사람만 계속
      with parts as (select unnest(v_state.tiebreak_user_ids) as user_id),
      ans as (
        select p.user_id, a.answered_at
        from parts p
        left join public.quiz_answers a on a.seq = v_seq and a.user_id = p.user_id
      )
      select array_agg(user_id) into v_survivors
      from ans
      where answered_at = (select max(answered_at) from ans);
    else
      -- 전원 오답/미제출 → 전원 계속(다음 문제 반복)
      v_survivors := v_all;
    end if;

    update public.quiz_state set tiebreak_user_ids = v_survivors where id = 1;

    v_result := jsonb_build_object(
      'phase', 'tiebreak', 'seq', v_seq, 'answer_idx', v_answer,
      'survivors', to_jsonb(v_survivors),
      'participants', to_jsonb(v_state.tiebreak_user_ids)
    );
  end if;

  update public.quiz_state
    set status = 'reveal', last_result = v_result, updated_at = now()
    where id = 1;
  return v_result;
end;
$$;

-- 서든데스 시작(관리자): 최초 호출 시 최저점 동점자를 tiebreak_user_ids 로,
-- 이후 호출은 남은 생존자를 유지한 채 다음 서든데스 문제를 연다.
create or replace function public.quiz_start_tiebreak(p_seq int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.quiz_state;
  v_min   int;
  v_tied  uuid[];
begin
  if not public.is_admin(auth.uid()) then raise exception '관리자만 가능합니다.'; end if;
  perform 1 from public.quiz_questions where seq = p_seq and kind = 'tiebreak';
  if not found then raise exception '서든데스 문제를 찾을 수 없습니다.'; end if;

  select * into v_state from public.quiz_state where id = 1 for update;

  if v_state.phase <> 'tiebreak' or v_state.tiebreak_user_ids is null then
    -- 최초: 최저 누적점수 동점자 산출
    select min(total) into v_min from public.quiz_scores;
    select array_agg(user_id) into v_tied from public.quiz_scores where total = v_min;
    if coalesce(array_length(v_tied, 1), 0) < 2 then
      raise exception '동점자가 없습니다.';
    end if;
  else
    v_tied := v_state.tiebreak_user_ids;   -- 이어가기
  end if;

  update public.quiz_state
    set status = 'question',
        phase = 'tiebreak',
        current_seq = p_seq,
        tiebreak_user_ids = v_tied,
        question_started_at = now() + interval '3 seconds',
        question_deadline   = now() + interval '3 seconds' + interval '30 seconds',
        last_result = null,
        updated_at = now()
    where id = 1;
end;
$$;

-- 종료/최저점 산출(관리자): main 이면 최저 누적점(동점이면 needs_tiebreak),
-- tiebreak 면 생존자 1명이 벌칙 대상.
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
    select min(total) into v_min from public.quiz_scores;
    select array_agg(user_id) into v_tied from public.quiz_scores where total = v_min;
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

-- 초기화(관리자): 답안 삭제 + 점수 0 + idle.
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
        tiebreak_user_ids = null, last_result = null, updated_at = now()
    where id = 1;
end;
$$;

grant execute on function public.quiz_current() to authenticated;
grant execute on function public.quiz_list_questions() to authenticated;
grant execute on function public.quiz_start_question(int) to authenticated;
grant execute on function public.quiz_submit(int) to authenticated;
grant execute on function public.quiz_reveal() to authenticated;
grant execute on function public.quiz_start_tiebreak(int) to authenticated;
grant execute on function public.quiz_finish() to authenticated;
grant execute on function public.quiz_reset() to authenticated;

-- Realtime publication (quiz_state·quiz_scores 전원 동기화, quiz_answers 는 RLS 로
-- 관리자만 전체 수신 → 실시간 제출 인원 카운트. quiz_questions 는 제외=정답 유출 차단)
do $$
begin
  begin alter publication supabase_realtime add table public.quiz_state; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.quiz_scores; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.quiz_answers; exception when duplicate_object then null; end;
end $$;
