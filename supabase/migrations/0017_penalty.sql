-- =============================================================
-- 벌칙 옷 랜덤 뽑기 세리머니 (실시간 쇼) 상태 + 이력 테이블.
-- 0001~0016 실행 후 이 파일을 SQL Editor에서 실행하세요.
-- 팀 배정식(0003_draw.sql) 패턴을 그대로 본떴습니다.
-- =============================================================

-- 싱글톤(id=1) 상태 행 — 모든 클라이언트가 이 행을 Realtime 구독해 동기화.
create table if not exists public.penalty_state (
  id             int primary key default 1,
  status         text not null default 'idle' check (status in ('idle','running','revealed')),
  style          text check (style in ('race','plinko','slot')),   -- 이번 라운드 연출
  outfit         text check (outfit in ('banana','clown','mario','party')), -- 이번 라운드 벌칙 옷
  participants   jsonb not null default '[]'::jsonb,  -- 뽑기 풀(표시 순서) [{user_id,display_name,avatar_url}]
  winner_index   int not null default 0,              -- participants 내 당첨자 인덱스(서버 확정)
  seed           int not null default 0,              -- 전원 동일 애니메이션용 공유 시드
  updated_at     timestamptz not null default now(),
  constraint penalty_state_singleton check (id = 1)
);

-- 초기 행 보장
insert into public.penalty_state (id, status) values (1, 'idle')
on conflict (id) do nothing;

alter table public.penalty_state enable row level security;

-- 읽기: 로그인 사용자 전체 (모두가 세리머니를 봄)
drop policy if exists "read_penalty_state" on public.penalty_state;
create policy "read_penalty_state" on public.penalty_state for select to authenticated using (true);

-- 쓰기: 관리자만 (시작/다시뽑기/확정/닫기)
drop policy if exists "admin_write_penalty_state" on public.penalty_state;
create policy "admin_write_penalty_state" on public.penalty_state for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Realtime publication 추가 (이게 있어야 실시간 전파됨)
do $$
begin
  begin
    alter publication supabase_realtime add table public.penalty_state;
  exception when duplicate_object then null; end;
end $$;

-- -------------------------------------------------------------
-- 벌칙 당첨 이력 — "이미 뽑힌 사람 제외" + 현황 표시용
-- -------------------------------------------------------------
create table if not exists public.penalty_picks (
  id         serial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  outfit     text not null check (outfit in ('banana','clown','mario','party')),
  style      text,
  created_at timestamptz not null default now()
);

create index if not exists penalty_picks_user_idx on public.penalty_picks(user_id);

alter table public.penalty_picks enable row level security;

-- 읽기: 로그인 사용자 전체 (현황 공유)
drop policy if exists "read_penalty_picks" on public.penalty_picks;
create policy "read_penalty_picks" on public.penalty_picks for select to authenticated using (true);

-- 쓰기(기록/초기화): 관리자만
drop policy if exists "admin_write_penalty_picks" on public.penalty_picks;
create policy "admin_write_penalty_picks" on public.penalty_picks for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
