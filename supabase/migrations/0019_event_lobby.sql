-- =============================================================
-- 🛎️ 공용 이벤트 대기실 (실시간 접속 현황)
-- 0001~0018 실행 후 이 파일을 SQL Editor에서 실행하세요.
-- 팀 배정식(0003)·벌칙(0017) 싱글톤 패턴을 그대로 본떴습니다.
--
-- 관리자가 대기실을 열면 접속자 전원 화면에 전체화면 대기실이 뜨고,
-- "지금 접속(시청) 중인 사람들"의 프로필이 실시간으로 모입니다.
-- 어떤 이벤트(팀 배정식·벌칙 뽑기 등) 전에도 "다들 모여!" 용도로 사용.
--
-- 열림/닫힘 상태만 이 싱글톤(id=1)으로 동기화하고,
-- "누가 접속했는지"는 DB 가 아니라 클라이언트 Realtime Presence 채널로
-- 다룹니다(휘발성이라 원장/테이블에 남길 필요가 없음).
-- =============================================================

-- 싱글톤(id=1) 상태 행 — 모든 클라이언트가 이 행을 Realtime 구독해 동기화.
create table if not exists public.event_lobby (
  id         int primary key default 1,
  status     text not null default 'closed' check (status in ('closed','open')),
  title      text,                                    -- 대기실 안내 문구(선택)
  updated_at timestamptz not null default now(),
  constraint event_lobby_singleton check (id = 1)
);

-- 초기 행 보장
insert into public.event_lobby (id, status) values (1, 'closed')
on conflict (id) do nothing;

alter table public.event_lobby enable row level security;

-- 읽기: 로그인 사용자 전체 (모두가 대기실을 봄)
drop policy if exists "read_event_lobby" on public.event_lobby;
create policy "read_event_lobby" on public.event_lobby for select to authenticated using (true);
-- 쓰기 정책 없음 — 아래 RPC(SECURITY DEFINER)로만 변경.

-- 대기실 열기 (관리자 전용)
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
        updated_at = now()
    where id = 1;
end;
$$;

-- 대기실 닫기 (관리자 전용)
create or replace function public.close_event_lobby()
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
    set status = 'closed',
        updated_at = now()
    where id = 1;
end;
$$;

grant execute on function public.open_event_lobby(text) to authenticated;
grant execute on function public.close_event_lobby() to authenticated;

-- Realtime publication 추가 (이게 있어야 실시간 전파됨)
do $$
begin
  begin
    alter publication supabase_realtime add table public.event_lobby;
  exception when duplicate_object then null; end;
end $$;
