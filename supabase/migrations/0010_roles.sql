-- =============================================================
-- 비밀 역할(스파이) 시스템. 0001~0009 실행 후 이 파일을 실행하세요.
-- 각 팀에 스파이 1명을 비밀 배정한다. 정체는 본인/관리자만 볼 수 있다.
-- 토큰 변동 RPC는 추가하지 않는다 — 스파이는 기존 송금/섯다/배팅으로 동작.
-- =============================================================

-- 플레이어별 비밀 역할. 현재 값은 'member' | 'spy' (추후 역할 추가 시 체크 제약 확장).
create table if not exists public.player_roles (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  role        text not null default 'member' check (role in ('member','spy')),
  revealed    boolean not null default false,  -- 2일차 밤 전체 공개용 (이번엔 미사용)
  assigned_at timestamptz not null default now()
);

alter table public.player_roles enable row level security;

-- 읽기: 본인 행 / 전체 공개된 행 / 관리자만. (대시보드 투명성 정책과 달리 역할은 비밀)
drop policy if exists "read_player_roles" on public.player_roles;
create policy "read_player_roles" on public.player_roles for select to authenticated
  using (user_id = auth.uid() or revealed or public.is_admin(auth.uid()));

-- 쓰기 직접 정책 없음 → assign_roles 등 RPC(SECURITY DEFINER)로만 변경.

-- 공개 순간 클라이언트에 즉시 반영되도록 realtime 등록
do $$
begin
  begin
    alter publication supabase_realtime add table public.player_roles;
  exception when duplicate_object then null; end;
end $$;

-- 역할 배정: 팀별로 player 1명을 랜덤 스파이, 나머지는 member.
-- (build_teams 와 동일한 관리자 가드 + order by random() 패턴)
create or replace function public.assign_roles(p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t   record;
  spy uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 가능합니다.';
  end if;

  if not p_force and exists (select 1 from public.player_roles) then
    raise exception '이미 역할이 배정되어 있습니다. 다시 섞으려면 강제 옵션을 사용하세요.';
  end if;

  -- 초기화 후 전원 member 로 세팅
  delete from public.player_roles;
  insert into public.player_roles (user_id, role)
  select id, 'member' from public.profiles where role = 'player';

  -- 팀마다 한 명을 랜덤으로 스파이 지정
  for t in
    select distinct team_id from public.profiles
    where role = 'player' and team_id is not null
  loop
    select id into spy
    from public.profiles
    where role = 'player' and team_id = t.team_id
    order by random()
    limit 1;

    if spy is not null then
      update public.player_roles set role = 'spy' where user_id = spy;
    end if;
  end loop;
end;
$$;
