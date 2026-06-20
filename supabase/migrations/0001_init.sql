-- =============================================================
-- 풍산11기 여름여행 웹앱 — 초기 스키마 + RLS + 골드 RPC
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요.
-- =============================================================

-- ---------- 테이블 ----------
create table if not exists public.teams (
  id     serial primary key,
  name   text not null,
  color  text not null default '#888888'
);

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique,
  display_name  text not null,
  role          text not null default 'player' check (role in ('admin','player')),
  team_id       int references public.teams(id) on delete set null,
  gold_balance  int not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.transactions (
  id          bigserial primary key,
  user_id     uuid references public.profiles(id) on delete set null,
  team_id     int references public.teams(id) on delete set null,
  amount      int not null,
  type        text not null check (type in ('admin_grant','game','gamble','transfer','steal','shop')),
  reason      text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists transactions_user_idx on public.transactions(user_id, created_at desc);

create table if not exists public.schedule (
  id           serial primary key,
  day          int not null,
  start_time   text,
  title        text not null,
  description  text,
  location     text,
  sort_order   int not null default 0
);

create table if not exists public.games (
  id          serial primary key,
  type        text not null check (type in ('quiz','dice','roulette','highlow','vote')),
  title       text not null,
  config      jsonb not null default '{}'::jsonb,
  is_open     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.game_plays (
  id          bigserial primary key,
  game_id     int references public.games(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  result      jsonb not null default '{}'::jsonb,
  gold_delta  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.shop_items (
  id           serial primary key,
  name         text not null,
  description  text,
  price        int not null,
  stock        int not null default -1,  -- -1 = 무제한
  is_active    boolean not null default true
);

create table if not exists public.purchases (
  id          bigserial primary key,
  item_id     int references public.shop_items(id) on delete set null,
  user_id     uuid references public.profiles(id) on delete set null,
  price       int not null,
  created_at  timestamptz not null default now()
);

-- ---------- 헬퍼 ----------
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = uid and role = 'admin');
$$;

-- 내부 공통: 원장 기록 + 잔액 원자적 갱신 (음수 잔액 방지)
create or replace function public._apply_gold(
  p_user uuid, p_amount int, p_type text, p_reason text, p_created_by uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team int;
  v_new  int;
begin
  -- 행 잠금으로 동시성 보호
  select team_id, gold_balance into v_team, v_new
  from public.profiles where id = p_user for update;

  if not found then
    raise exception '대상 사용자를 찾을 수 없습니다.';
  end if;

  v_new := v_new + p_amount;
  if v_new < 0 then
    raise exception '골드가 부족합니다.';
  end if;

  update public.profiles set gold_balance = v_new where id = p_user;

  insert into public.transactions(user_id, team_id, amount, type, reason, created_by)
  values (p_user, v_team, p_amount, p_type, p_reason, p_created_by);

  return v_new;
end;
$$;

-- ---------- 공개 RPC ----------

-- 관리자: 개인 골드 지급/차감 (amount 음수 = 차감)
create or replace function public.admin_grant_gold(
  p_user uuid, p_amount int, p_reason text
) returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 가능합니다.';
  end if;
  return public._apply_gold(p_user, p_amount, 'admin_grant', p_reason, auth.uid());
end;
$$;

-- 관리자: 팀 전원에게 같은 금액 지급/차감
create or replace function public.admin_grant_team_gold(
  p_team int, p_amount int, p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 가능합니다.';
  end if;
  for r in select id from public.profiles where team_id = p_team and role = 'player' loop
    perform public._apply_gold(r.id, p_amount, 'admin_grant', p_reason, auth.uid());
  end loop;
end;
$$;

-- 송금/배신: 본인 → 상대에게 골드 이전
create or replace function public.transfer_gold(
  p_to uuid, p_amount int, p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from uuid := auth.uid();
begin
  if p_amount <= 0 then
    raise exception '금액은 1 이상이어야 합니다.';
  end if;
  if v_from = p_to then
    raise exception '자기 자신에게는 보낼 수 없습니다.';
  end if;
  perform public._apply_gold(v_from, -p_amount, 'transfer', p_reason, v_from);
  perform public._apply_gold(p_to,    p_amount, 'transfer', p_reason, v_from);
end;
$$;

-- 팀 빌딩: player 전원을 2팀에 랜덤 5:5 배정 (p_force=false면 이미 배정된 경우 거부)
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

  if not p_force and exists (select 1 from public.profiles where role='player' and team_id is not null) then
    raise exception '이미 팀이 배정되어 있습니다. 다시 섞으려면 강제 옵션을 사용하세요.';
  end if;

  select array_agg(id order by id) into v_team_ids from public.teams;
  if array_length(v_team_ids, 1) < 2 then
    raise exception '팀이 2개 이상 필요합니다.';
  end if;

  for r in select id from public.profiles where role='player' order by random() loop
    update public.profiles
      set team_id = v_team_ids[(i % 2) + 1]
      where id = r.id;
    i := i + 1;
  end loop;
end;
$$;

-- ---------- RLS ----------
alter table public.teams        enable row level security;
alter table public.profiles     enable row level security;
alter table public.transactions enable row level security;
alter table public.schedule     enable row level security;
alter table public.games        enable row level security;
alter table public.game_plays   enable row level security;
alter table public.shop_items   enable row level security;
alter table public.purchases    enable row level security;

-- 읽기: 로그인 사용자는 모두 조회 가능 (대시보드 투명성)
drop policy if exists "read_teams" on public.teams;
create policy "read_teams" on public.teams for select to authenticated using (true);

drop policy if exists "read_profiles" on public.profiles;
create policy "read_profiles" on public.profiles for select to authenticated using (true);

drop policy if exists "read_tx" on public.transactions;
create policy "read_tx" on public.transactions for select to authenticated using (true);

drop policy if exists "read_schedule" on public.schedule;
create policy "read_schedule" on public.schedule for select to authenticated using (true);

drop policy if exists "read_games" on public.games;
create policy "read_games" on public.games for select to authenticated using (true);

drop policy if exists "read_plays" on public.game_plays;
create policy "read_plays" on public.game_plays for select to authenticated using (true);

drop policy if exists "read_shop" on public.shop_items;
create policy "read_shop" on public.shop_items for select to authenticated using (true);

drop policy if exists "read_purchases" on public.purchases;
create policy "read_purchases" on public.purchases for select to authenticated using (true);

-- 쓰기: 관리자만 직접 수정 가능한 테이블 (일정/게임/상점)
drop policy if exists "admin_write_schedule" on public.schedule;
create policy "admin_write_schedule" on public.schedule for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "admin_write_games" on public.games;
create policy "admin_write_games" on public.games for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "admin_write_shop" on public.shop_items;
create policy "admin_write_shop" on public.shop_items for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- profiles/transactions/game_plays/purchases 직접 INSERT/UPDATE는 정책 없음 → RPC(SECURITY DEFINER)로만 변경.

-- ---------- Realtime ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.transactions;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.teams;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.games;
  exception when duplicate_object then null; end;
end $$;
