-- =============================================================
-- 팀 배정식(실시간 드로우 쇼) 상태 테이블.
-- 0001/0002 실행 후 이 파일을 SQL Editor에서 실행하세요.
-- =============================================================

-- 싱글톤(id=1) 상태 행 — 모든 클라이언트가 이 행을 Realtime 구독해 동기화.
create table if not exists public.draw_state (
  id             int primary key default 1,
  status         text not null default 'idle' check (status in ('idle','intro','revealing','done')),
  assignments    jsonb not null default '[]'::jsonb,  -- 공개 순서 배열 [{user_id,display_name,team_id,team_name,team_color}]
  revealed_count int not null default 0,
  updated_at     timestamptz not null default now(),
  constraint draw_state_singleton check (id = 1)
);

-- 초기 행 보장
insert into public.draw_state (id, status) values (1, 'idle')
on conflict (id) do nothing;

alter table public.draw_state enable row level security;

-- 읽기: 로그인 사용자 전체 (모두가 배정식을 봄)
drop policy if exists "read_draw" on public.draw_state;
create policy "read_draw" on public.draw_state for select to authenticated using (true);

-- 쓰기: 관리자만 (시작/공개/확정/닫기)
drop policy if exists "admin_write_draw" on public.draw_state;
create policy "admin_write_draw" on public.draw_state for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Realtime publication 추가
do $$
begin
  begin
    alter publication supabase_realtime add table public.draw_state;
  exception when duplicate_object then null; end;
end $$;
