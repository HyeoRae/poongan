-- =============================================================
-- 웹 푸시 구독 저장. 0001~0006 실행 후 이 파일을 실행하세요.
-- 각 사용자의 브라우저/기기별 푸시 구독(endpoint + 키)을 보관한다.
-- 발송은 서버에서 web-push(VAPID)로 수행한다.
-- =============================================================

create table if not exists public.push_subscriptions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- 본인 구독만 관리(조회/삽입/수정/삭제)
drop policy if exists "manage_own_push" on public.push_subscriptions;
create policy "manage_own_push" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 관리자는 전체 조회 가능 (발송은 서버 서비스키로 수행하지만, 대상 확인용)
drop policy if exists "admin_read_push" on public.push_subscriptions;
create policy "admin_read_push" on public.push_subscriptions for select to authenticated
  using (public.is_admin(auth.uid()));
