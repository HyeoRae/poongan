-- =============================================================
-- 역할카드 확장: 광대(jester) 추가.
-- 0001~0014 실행 후 이 파일을 실행하세요.
--
--  · player_roles.role 에 'jester' 허용.
--  · assign_roles: 팀마다 스파이 1명 + (스파이와 다른) 광대 1명을 비밀 배정.
--  · 광대 승리조건 = 본인 팀 우승 + 그 팀 안에서 개인 꼴찌.
--    (판정은 클라이언트 read-time 계산 — 별도 RPC 없음.)
-- =============================================================

-- 역할 CHECK 제약 확장 (member | spy | jester)
alter table public.player_roles drop constraint if exists player_roles_role_check;
alter table public.player_roles
  add constraint player_roles_role_check
  check (role in ('member','spy','jester'));

-- 역할 배정: 팀당 스파이 1 + 광대 1 (봇/테스트 계정 제외, 서로 다른 사람).
create or replace function public.assign_roles(p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t      record;
  spy    uuid;
  jester uuid;
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
    -- 스파이 1명
    select id into spy
    from public.profiles
    where role = 'player' and is_bot = false and team_id = t.team_id
    order by random()
    limit 1;

    if spy is not null then
      update public.player_roles set role = 'spy' where user_id = spy;
    end if;

    -- 광대 1명 (스파이와 다른 사람)
    select id into jester
    from public.profiles
    where role = 'player' and is_bot = false and team_id = t.team_id
      and id is distinct from spy
    order by random()
    limit 1;

    if jester is not null then
      update public.player_roles set role = 'jester' where user_id = jester;
    end if;
  end loop;
end;
$$;
