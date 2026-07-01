-- =============================================================
-- 프로필 사진(avatar) + 봇/테스트 제외 플래그(is_bot). 0001~0010 실행 후 이 파일을 실행하세요.
-- 1) profiles 에 avatar_url, is_bot 컬럼 추가
-- 2) avatars 스토리지 버킷(공개 읽기) + 본인 폴더 업로드 정책
-- 3) set_my_avatar / admin_set_bot RPC
-- 4) build_teams / assign_roles 를 is_bot 제외 버전으로 교체
-- =============================================================

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists is_bot boolean not null default false;

-- 기존 테스트/봇 계정 백필 (username 에 test/bot 포함) — 기존 username 기반 제외 동작을 그대로 승계
update public.profiles
  set is_bot = true
  where username ilike '%test%' or username ilike '%bot%';

-- 본인 아바타 설정: profiles 직접 UPDATE 정책이 없으므로 SECURITY DEFINER RPC 로만 변경
create or replace function public.set_my_avatar(p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;
  update public.profiles set avatar_url = p_url where id = auth.uid();
end;
$$;

-- 관리자: 봇/제외 플래그 토글
create or replace function public.admin_set_bot(p_user uuid, p_is_bot boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 가능합니다.';
  end if;
  update public.profiles set is_bot = p_is_bot where id = p_user;
  -- 제외로 바뀌면 팀에서도 빼둔다 (배정식/대시보드 정합성)
  if p_is_bot then
    update public.profiles set team_id = null where id = p_user;
  end if;
end;
$$;

-- ---------- avatars 스토리지 버킷 ----------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 읽기는 공개, 쓰기는 본인 폴더(<uid>/...)만
drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------- 팀 배정: 봇/테스트 계정 제외 ----------
-- (0001 build_teams 교체) 실제 참가자(is_bot=false)만 두 팀에 번갈아 배정.
create or replace function public.build_teams(p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_ids int[];
  r record;
  i int := 0;
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 가능합니다.';
  end if;

  if not p_force and exists (
    select 1 from public.profiles
    where role = 'player' and is_bot = false and team_id is not null
  ) then
    raise exception '이미 팀이 배정되어 있습니다. 다시 섞으려면 강제 옵션을 사용하세요.';
  end if;

  select array_agg(id order by id) into v_team_ids from public.teams;
  if array_length(v_team_ids, 1) < 2 then
    raise exception '팀이 2개 이상 필요합니다.';
  end if;

  -- 봇/테스트는 팀에서 제외
  update public.profiles set team_id = null where role = 'player' and is_bot = true;

  for r in
    select id from public.profiles
    where role = 'player' and is_bot = false
    order by random()
  loop
    update public.profiles
      set team_id = v_team_ids[(i % 2) + 1]
      where id = r.id;
    i := i + 1;
  end loop;
end;
$$;

-- ---------- 역할(스파이) 배정: 봇/테스트 계정 제외 ----------
-- (0010 assign_roles 교체) is_bot=false 인 실제 참가자만 대상으로.
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

  delete from public.player_roles where true;
  insert into public.player_roles (user_id, role)
  select id, 'member' from public.profiles where role = 'player' and is_bot = false;

  for t in
    select distinct team_id from public.profiles
    where role = 'player' and is_bot = false and team_id is not null
  loop
    select id into spy
    from public.profiles
    where role = 'player' and is_bot = false and team_id = t.team_id
    order by random()
    limit 1;

    if spy is not null then
      update public.player_roles set role = 'spy' where user_id = spy;
    end if;
  end loop;
end;
$$;
