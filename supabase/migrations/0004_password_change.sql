-- =============================================================
-- 첫 로그인 시 비밀번호 강제 변경.
-- 0001~0003 실행 후 이 파일을 SQL Editor에서 실행하세요.
-- =============================================================

-- 플래그 컬럼 추가 (기존 행은 모두 true가 됨 = 다음 로그인 때 변경 요구)
alter table public.profiles
  add column if not exists must_change_password boolean not null default true;

-- 관리자(기획자)는 제외 — 강제 변경 안 함
update public.profiles set must_change_password = false where role = 'admin';

-- 본인 플래그만 해제하는 RPC (비밀번호 변경 완료 시 호출)
create or replace function public.clear_password_change_flag()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;
