-- =============================================================
-- 경제 개편: 개인 잔액 비밀화 + 송금 수수료 20% + 누적 통계
-- 0001~0013 실행 후 이 파일을 실행하세요.
--
-- 핵심 설계
--  · profiles 행 읽기를 "본인 + 관리자"로 제한 → 남의 gold_balance 비공개.
--    (도박/섯다/정산 RPC는 모두 SECURITY DEFINER 라 RLS 우회 → 무변경.)
--  · 이름/팀/아바타 등 공개 정보는 list_public_profiles() 로만 노출(잔액 미포함).
--  · 팀 합산 점수는 team_totals 테이블 + profiles 트리거로 자동 재계산 → 실시간 구독.
--  · transactions 원장도 본인+관리자만. 누적 통계는 get_player_stats/get_global_stats 로.
-- =============================================================

-- ---------- 트랜잭션 종류 확장 ('fee' 송금 수수료 소각, 'gacha' 효과카드 뽑기) ----------
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions
  add constraint transactions_type_check
  check (type in ('admin_grant','game','gamble','transfer','steal','shop','fee','gacha'));

-- ---------- 팀 합산 점수 테이블 (개인 잔액 노출 없이 팀 점수만 공개) ----------
create table if not exists public.team_totals (
  team_id     int primary key references public.teams(id) on delete cascade,
  total       int not null default 0,
  updated_at  timestamptz not null default now()
);

alter table public.team_totals enable row level security;

-- 읽기: 로그인 사용자 전체 공개(팀 점수는 공개 정책). 쓰기 직접정책 없음 → 트리거로만 갱신.
drop policy if exists "read_team_totals" on public.team_totals;
create policy "read_team_totals" on public.team_totals for select to authenticated using (true);

-- 특정 팀의 합산을 profiles 로부터 다시 계산해 team_totals 에 반영(봇 제외, player 만).
create or replace function public._recompute_team_total(p_team int)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.team_totals (team_id, total, updated_at)
  values (
    p_team,
    coalesce((
      select sum(gold_balance) from public.profiles
      where team_id = p_team and role = 'player' and is_bot = false
    ), 0),
    now()
  )
  on conflict (team_id) do update
    set total = excluded.total, updated_at = excluded.updated_at;
$$;

-- profiles 변동(잔액/팀) 시 관련 팀 합산을 자동 재계산.
-- (모든 잔액 변동은 _apply_gold → profiles UPDATE 를 거치므로 트리거로 충분.
--  build_teams/reset_teams 의 team_id 변경도 이 트리거가 자동 반영.)
create or replace function public._sync_team_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.team_id is not null then
    perform public._recompute_team_total(old.team_id);
  end if;
  if tg_op in ('INSERT','UPDATE') and new.team_id is not null then
    if tg_op = 'INSERT'
       or new.team_id is distinct from old.team_id
       or new.gold_balance is distinct from old.gold_balance then
      perform public._recompute_team_total(new.team_id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_team_total on public.profiles;
create trigger trg_sync_team_total
  after insert or update or delete on public.profiles
  for each row execute function public._sync_team_total();

-- 기존 팀들의 초기 합산 채우기
insert into public.team_totals (team_id, total)
  select id, 0 from public.teams
  on conflict (team_id) do nothing;
do $$
declare t record;
begin
  for t in select id from public.teams loop
    perform public._recompute_team_total(t.id);
  end loop;
end $$;

-- ---------- 개인 잔액 비밀화: profiles / transactions 읽기 제한 ----------
-- 본인 행 또는 관리자만 조회 가능(남의 gold_balance 비공개).
drop policy if exists "read_profiles" on public.profiles;
create policy "read_profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));

-- 원장도 본인+관리자만(금액으로 잔액 유추 방지).
drop policy if exists "read_tx" on public.transactions;
create policy "read_tx" on public.transactions for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- 공개 프로필 목록(잔액 제외) — 대시보드/지갑/섯다의 이름·팀·아바타 표시용.
create or replace function public.list_public_profiles()
returns table (
  id uuid, username text, display_name text, role text,
  team_id int, avatar_url text, is_bot boolean, created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, username, display_name, role, team_id, avatar_url, is_bot, created_at
  from public.profiles;
$$;
grant execute on function public.list_public_profiles() to authenticated;

-- ---------- 송금 수수료 20% (소각) ----------
-- 보내는 사람은 p_amount 전액 차감, 받는 사람은 80% 수령, 20%는 소각(경제에서 제거).
-- 원장: 송금분(-received)과 수수료분(-fee)을 분리 기록해 잔액-원장 합이 일치.
-- (효과카드에 의한 수수료 면제/할인은 0016 에서 transfer_gold 재정의로 추가.)
create or replace function public.transfer_gold(
  p_to uuid, p_amount int, p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from uuid := auth.uid();
  v_fee  int;
  v_recv int;
begin
  if p_amount <= 0 then
    raise exception '금액은 1 이상이어야 합니다.';
  end if;
  if v_from = p_to then
    raise exception '자기 자신에게는 보낼 수 없습니다.';
  end if;

  v_fee  := floor(p_amount * 0.20);
  v_recv := p_amount - v_fee;

  -- 보내는 사람: 실지급분 + 수수료분 분리 차감(합계 = p_amount)
  perform public._apply_gold(v_from, -v_recv, 'transfer', p_reason, v_from);
  if v_fee > 0 then
    perform public._apply_gold(v_from, -v_fee, 'fee', '송금 수수료(20%)', v_from);
  end if;
  -- 받는 사람: 80% 수령
  perform public._apply_gold(p_to, v_recv, 'transfer', p_reason, v_from);
end;
$$;

-- ---------- 누적 통계 (개인별 / 전체) ----------
-- 개인 누적: 본인 또는 관리자만 조회(교차 열람은 0016 흥신소 카드가 별도 진입점).
create or replace function public.get_player_stats(p_target uuid)
returns table (
  earned bigint, spent bigint, sent bigint, received bigint,
  fee_paid bigint, gamble_net bigint, gacha_spent bigint, tx_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (p_target = auth.uid() or public.is_admin(auth.uid())) then
    raise exception '본인 또는 관리자만 조회할 수 있습니다.';
  end if;
  return query
  select
    coalesce(sum(amount) filter (where amount > 0), 0),
    coalesce(-sum(amount) filter (where amount < 0), 0),
    coalesce(-sum(amount) filter (where type = 'transfer' and amount < 0), 0),
    coalesce(sum(amount) filter (where type = 'transfer' and amount > 0), 0),
    coalesce(-sum(amount) filter (where type = 'fee'), 0),
    coalesce(sum(amount) filter (where type = 'gamble'), 0),
    coalesce(-sum(amount) filter (where type = 'gacha' and amount < 0), 0),
    count(*)
  from public.transactions
  where user_id = p_target;
end;
$$;
grant execute on function public.get_player_stats(uuid) to authenticated;

-- 전체 누적(비식별 집계) — 참가자 전체 경제 규모.
create or replace function public.get_global_stats()
returns table (
  total_earned bigint, total_spent bigint, total_sent bigint,
  total_fee bigint, total_gamble_net bigint, tx_count bigint, total_supply bigint
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(sum(amount) filter (where amount > 0), 0),
    coalesce(-sum(amount) filter (where amount < 0), 0),
    coalesce(sum(amount) filter (where type = 'transfer' and amount > 0), 0),
    coalesce(-sum(amount) filter (where type = 'fee'), 0),
    coalesce(sum(amount) filter (where type = 'gamble'), 0),
    count(*),
    (select coalesce(sum(gold_balance), 0) from public.profiles where role = 'player')
  from public.transactions;
$$;
grant execute on function public.get_global_stats() to authenticated;

-- ---------- Realtime ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.team_totals;
  exception when duplicate_object then null; end;
end $$;
