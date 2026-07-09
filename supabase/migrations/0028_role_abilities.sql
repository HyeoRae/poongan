-- =============================================================
-- 비밀역할 3종 추가: 도둑(thief) · 해커(hacker) · 팀장(leader).
-- 0001~0027 실행 후 이 파일을 실행하세요.
--
--  · assign_roles: 팀마다 5역할(스파이·광대·도둑·해커·팀장)을 랜덤 1:1 배정.
--    (팀당 5명 = 전원 특수역할. 6명 이상이면 나머지는 member, 5명 미만이면
--     우선순위 spy→leader→thief→hacker→jester 순으로 채우고 스킵.)
--  · 도둑: steal_gold(p_target) — 대상 지갑 10%를 50% 확률로 훔침. 대상 1명당 1회.
--  · 해커: hacker_scan() — 100토큰 소모, 10분간 전원 잔액 조회(창 안에서는 재조회 무료).
--  · 팀장: rename_team(p_name) 팀명 변경 · leader_team_balances() 팀원 잔고(상시).
--  · 모든 토큰 변동은 _apply_gold 경유(원장·행잠금·음수거부 유지).
-- =============================================================

-- ---------- 역할 CHECK 제약 확장 ----------
alter table public.player_roles drop constraint if exists player_roles_role_check;
alter table public.player_roles
  add constraint player_roles_role_check
  check (role in ('member','spy','jester','thief','hacker','leader'));

-- ---------- 역할 배정: 팀당 5역할 1:1 ----------
create or replace function public.assign_roles(p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t        record;
  m        record;
  -- 우선순위 순서(인원 부족 시 앞에서부터 채움). 팀 5명이면 전원 배정됨.
  v_roles  text[] := array['spy','leader','thief','hacker','jester'];
  v_i      int;
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 가능합니다.';
  end if;

  if not p_force and exists (select 1 from public.player_roles) then
    raise exception '이미 역할이 배정되어 있습니다. 다시 섞으려면 강제 옵션을 사용하세요.';
  end if;

  delete from public.player_roles where true;
  insert into public.player_roles (user_id, role)
  select id, 'member' from public.profiles where role = 'player' and is_bot = false;

  for t in
    select distinct team_id from public.profiles
    where role = 'player' and is_bot = false and team_id is not null
  loop
    v_i := 1;
    -- 팀원을 랜덤 순서로 돌며 앞에서부터 역할 배열을 하나씩 부여
    for m in
      select id from public.profiles
      where role = 'player' and is_bot = false and team_id = t.team_id
      order by random()
    loop
      exit when v_i > array_length(v_roles, 1);
      update public.player_roles set role = v_roles[v_i] where user_id = m.id;
      v_i := v_i + 1;
    end loop;
  end loop;
end;
$$;

-- ---------- 도둑: 시도 기록(대상당 1회) ----------
create table if not exists public.thief_steals (
  id         bigserial primary key,
  thief_id   uuid not null references public.profiles(id) on delete cascade,
  target_id  uuid not null references public.profiles(id) on delete cascade,
  success    boolean not null,
  amount     int not null default 0,
  created_at timestamptz not null default now(),
  unique (thief_id, target_id)
);
alter table public.thief_steals enable row level security;
drop policy if exists "read_my_steals" on public.thief_steals;
create policy "read_my_steals" on public.thief_steals for select to authenticated
  using (thief_id = auth.uid());  -- 쓰기는 RPC(정의자권한) 전용

-- ---------- 해커: 조회 세션(10분 창) ----------
create table if not exists public.hacker_sessions (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.hacker_sessions enable row level security;
drop policy if exists "read_my_hacker" on public.hacker_sessions;
create policy "read_my_hacker" on public.hacker_sessions for select to authenticated
  using (user_id = auth.uid());

-- ---------- 도둑 능력 ----------
-- 대상 지갑의 10%를 50% 확률로 훔친다. 대상 1명당 1회(성공/실패 무관 소모).
-- 성공 시 대상에 -amount('steal') · 도둑에 +amount('steal') 를 _apply_gold 로 기록
-- → 피해자는 자기 transactions(steal, 음수) 실시간 구독으로 알림을 받는다.
create or replace function public.steal_gold(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_role    text;
  v_bal     int;
  v_amount  int;
  v_success boolean;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  if p_target is null then raise exception '대상을 선택하세요.'; end if;
  if p_target = v_uid then raise exception '자기 자신은 훔칠 수 없습니다.'; end if;

  select role into v_role from public.player_roles where user_id = v_uid;
  if v_role is distinct from 'thief' then
    raise exception '도둑만 사용할 수 있습니다.';
  end if;

  if exists (select 1 from public.thief_steals where thief_id = v_uid and target_id = p_target) then
    raise exception '이미 시도한 대상입니다.';
  end if;

  -- 실제 참가자만 대상. 잔액 조회(비밀이라 definer 로만 접근).
  select gold_balance into v_bal from public.profiles
  where id = p_target and role = 'player' and is_bot = false;
  if not found then
    raise exception '훔칠 수 없는 대상입니다.';
  end if;

  v_amount := floor(v_bal * 0.10);                   -- ⚠ lib/constants.ts THIEF_STEAL_PCT(0.1) 와 값 일치
  if v_amount < 1 then
    -- 훔칠 토큰이 없으면 시도를 소모하지 않는다(롤백)
    raise exception '대상 지갑에 훔칠 토큰이 없습니다.';
  end if;

  v_success := random() < 0.5;                        -- ⚠ lib/constants.ts THIEF_SUCCESS_PCT(0.5) 와 값 일치

  if v_success then
    perform public._apply_gold(p_target, -v_amount, 'steal', '지갑에서 도둑맞음', v_uid);
    perform public._apply_gold(v_uid,     v_amount, 'steal', '도둑질 성공',       v_uid);
  end if;

  insert into public.thief_steals(thief_id, target_id, success, amount)
  values (v_uid, p_target, v_success, case when v_success then v_amount else 0 end);

  return jsonb_build_object(
    'success', v_success,
    'amount',  case when v_success then v_amount else 0 end
  );
end;
$$;
grant execute on function public.steal_gold(uuid) to authenticated;

-- ---------- 해커 능력 ----------
-- 활성 세션이 없으면 100토큰 차감 후 10분 창을 연다. 창 안에서는 재호출해도 무료.
-- 반환: 전원(실참가자) 잔액 + 창 만료시각. 클라는 만료까지 카운트다운 후 숨긴다.
create or replace function public.hacker_scan()
returns table (uid uuid, name text, balance int, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_exp  timestamptz;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;

  select role into v_role from public.player_roles where user_id = v_uid;
  if v_role is distinct from 'hacker' then
    raise exception '해커만 사용할 수 있습니다.';
  end if;

  select hs.expires_at into v_exp from public.hacker_sessions hs where hs.user_id = v_uid;
  if v_exp is null or v_exp <= now() then
    perform public._apply_gold(v_uid, -100, 'game', '해킹: 전원 잔액 조회', v_uid);  -- ⚠ lib/constants.ts HACKER_SCAN_COST(100)
    v_exp := now() + interval '10 minutes';                                         -- ⚠ lib/constants.ts HACKER_WINDOW_MIN(10)
    insert into public.hacker_sessions(user_id, expires_at) values (v_uid, v_exp)
    on conflict (user_id) do update set expires_at = excluded.expires_at;
  end if;

  return query
  select p.id, p.display_name, p.gold_balance, v_exp
  from public.profiles p
  where p.role = 'player' and p.is_bot = false
  order by p.gold_balance desc;
end;
$$;
grant execute on function public.hacker_scan() to authenticated;

-- ---------- 팀장: 팀원 잔고 조회(상시) ----------
create or replace function public.leader_team_balances()
returns table (uid uuid, name text, balance int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_team int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;

  select role into v_role from public.player_roles where user_id = v_uid;
  if v_role is distinct from 'leader' then
    raise exception '팀장만 사용할 수 있습니다.';
  end if;

  select team_id into v_team from public.profiles where id = v_uid;
  if v_team is null then raise exception '소속 팀이 없습니다.'; end if;

  return query
  select p.id, p.display_name, p.gold_balance
  from public.profiles p
  where p.team_id = v_team and p.role = 'player' and p.is_bot = false
  order by p.gold_balance desc;
end;
$$;
grant execute on function public.leader_team_balances() to authenticated;

-- ---------- 팀장: 팀명 변경 ----------
create or replace function public.rename_team(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_team int;
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;

  select role into v_role from public.player_roles where user_id = v_uid;
  if v_role is distinct from 'leader' then
    raise exception '팀장만 팀명을 변경할 수 있습니다.';
  end if;

  select team_id into v_team from public.profiles where id = v_uid;
  if v_team is null then raise exception '소속 팀이 없습니다.'; end if;

  if length(v_name) = 0 then raise exception '팀명을 입력하세요.'; end if;
  if length(v_name) > 20 then raise exception '팀명은 20자 이내로 입력하세요.'; end if;

  update public.teams set name = v_name where id = v_team;
end;
$$;
grant execute on function public.rename_team(text) to authenticated;

-- ---------- Realtime ----------
-- teams 는 이미 발행됨(0001) → 팀명 변경 자동 전파.
-- transactions 도 이미 발행됨(0001) → 도둑맞음 알림에 사용.
do $$
begin
  begin
    alter publication supabase_realtime add table public.hacker_sessions;
  exception when duplicate_object then null; end;
end $$;
