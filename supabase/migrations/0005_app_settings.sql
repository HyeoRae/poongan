-- =============================================================
-- 앱 공개/비공개 토글. 0001~0004 실행 후 이 파일을 실행하세요.
-- is_public=false 면 참가자는 앱 내용을 볼 수 없고 '곧 공개' 화면만 봄.
-- 관리자는 항상 전체 접근 가능.
-- =============================================================

create table if not exists public.app_settings (
  id          int primary key default 1,
  is_public   boolean not null default false,
  updated_at  timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

insert into public.app_settings (id, is_public) values (1, false)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "read_settings" on public.app_settings;
create policy "read_settings" on public.app_settings for select to authenticated using (true);

drop policy if exists "admin_write_settings" on public.app_settings;
create policy "admin_write_settings" on public.app_settings for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

do $$
begin
  begin
    alter publication supabase_realtime add table public.app_settings;
  exception when duplicate_object then null; end;
end $$;
