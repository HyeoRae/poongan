-- =============================================================
-- 🛎️ 대기실 "입장자" 명단 + 퀴즈 참가자를 입장자로 한정. 0019~0024 실행 후 적용.
--
-- 지금까지 대기실 로스터는 Presence(로그인=자동 접속)로 채워져 "참가 의사"와 무관했다.
-- 이제 명시적 "입장(join)"을 durable 테이블에 남겨서:
--   · 상단 '입장' 버튼으로 opt-in 한 사람만 로스터에 뜨고
--   · 퀴즈 시작 시 그 입장자 명단이 곧 참가자·최저점·벌칙 후보가 된다
--     (입장 안 한 사람/유령 프로필은 제외).
-- =============================================================

-- 입장자 명단 — 표시정보(이름/사진/관리자)를 join 시점에 스냅샷(비정규화)해 로스터를 바로 그린다.
create table if not exists public.event_lobby_members (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null,
  avatar_url   text,
  is_admin     boolean not null default false,
  joined_at    timestamptz not null default now()
);

alter table public.event_lobby_members enable row level security;

drop policy if exists "read_lobby_members" on public.event_lobby_members;
create policy "read_lobby_members" on public.event_lobby_members
  for select to authenticated using (true);
-- 쓰기 정책 없음 — 아래 RPC(SECURITY DEFINER)로만 변경.

-- 대기실 입장(누구나) — 열린 대기실에만. 내 프로필을 스냅샷해 명단에 추가(멱등).
create or replace function public.join_event_lobby()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  if not exists (select 1 from public.event_lobby where id = 1 and status = 'open') then
    raise exception '열린 대기실이 없습니다.';
  end if;
  insert into public.event_lobby_members (user_id, display_name, avatar_url, is_admin)
    select id, display_name, avatar_url, (role = 'admin')
    from public.profiles where id = v_uid
  on conflict (user_id) do nothing;
end;
$$;

grant execute on function public.join_event_lobby() to authenticated;

-- 대기실 열기 재정의 — 새 세션이므로 이전 입장자 명단을 비우고, 여는 관리자(사회자)는 자동 입장.
create or replace function public.open_event_lobby(p_title text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 가능합니다.';
  end if;
  update public.event_lobby
    set status = 'open',
        title = nullif(btrim(coalesce(p_title, '')), ''),
        activity = null,
        updated_at = now()
    where id = 1;
  delete from public.event_lobby_members where true;               -- 새 세션 → 명단 초기화
  insert into public.event_lobby_members (user_id, display_name, avatar_url, is_admin)
    select id, display_name, avatar_url, true
    from public.profiles where id = auth.uid()                     -- 사회자 자동 입장
  on conflict (user_id) do nothing;
end;
$$;

-- 라운드 시작 재정의(0022 override) — 참가자 = 현재 대기실 입장자. 명단으로 점수행을 0 세팅.
-- (예전 seedQuiz 전체 프로필 사전 시드 대체. 입장 안 한 사람은 quiz_scores 에 없어 벌칙 대상 제외.)
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

  -- 새 게임: 이전 답안·점수 정리 후, 입장자 명단으로 참가자 점수행 0 세팅
  delete from public.quiz_answers where true;
  delete from public.quiz_scores where true;
  insert into public.quiz_scores (user_id, total, correct_count)
    select user_id, 0, 0 from public.event_lobby_members;

  if not exists (select 1 from public.quiz_scores) then
    raise exception '대기실에 입장한 참가자가 없습니다. 대기실에서 입장 후 시작하세요.';
  end if;

  -- main 문제 중 무작위 p_count 개 → 무작위 순서로 고정
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

-- 정답 제출 재정의(0020 override) — 참가자(quiz_scores 에 있는 입장자)만 제출 가능.
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
  if not exists (select 1 from public.quiz_scores where user_id = v_uid) then
    raise exception '이번 퀴즈 참가자가 아닙니다. (대기실 입장 후 참여)';
  end if;
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

-- Realtime publication 추가 (입장/퇴장이 실시간으로 로스터에 반영되도록)
do $$
begin
  begin
    alter publication supabase_realtime add table public.event_lobby_members;
  exception when duplicate_object then null; end;
end $$;
