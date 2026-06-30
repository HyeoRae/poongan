-- =============================================================
-- 일정별 미니게임 — 승자 예측 팟배팅(파리뮤추얼) + 룰렛 RNG
-- 기존 games 테이블을 확장하고 bet_options/bets 를 추가한다.
-- 0001~0007 실행 후 이 파일을 SQL Editor에서 실행하세요.
-- =============================================================

-- ---------- games 확장 ----------
-- 팟배팅 타입 추가
alter table public.games drop constraint if exists games_type_check;
alter table public.games add constraint games_type_check
  check (type in ('quiz','dice','roulette','highlow','vote','pool'));

alter table public.games
  add column if not exists schedule_id   int references public.schedule(id) on delete set null,
  add column if not exists status        text not null default 'draft'
    check (status in ('draft','open','locked','settled','cancelled')),
  add column if not exists result        jsonb,
  add column if not exists option_source text not null default 'custom'
    check (option_source in ('custom','players'));

-- ---------- 팟배팅 옵션(선택지) ----------
create table if not exists public.bet_options (
  id          serial primary key,
  game_id     int not null references public.games(id) on delete cascade,
  label       text not null,
  ref_user_id uuid references public.profiles(id) on delete set null, -- 참가자 옵션이면 해당 유저
  sort_order  int not null default 0
);
create index if not exists bet_options_game_idx on public.bet_options(game_id);

-- ---------- 개별 베팅 기록 ----------
create table if not exists public.bets (
  id         bigserial primary key,
  game_id    int not null references public.games(id) on delete cascade,
  option_id  int not null references public.bet_options(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  amount     int not null check (amount > 0),
  payout     int not null default 0,   -- 정산 후 지급액(환불 포함) 기록
  created_at timestamptz not null default now()
);
create index if not exists bets_game_idx on public.bets(game_id);

-- ---------- RPC ----------

-- 베팅: 게임이 열려있을 때만, 베팅액 즉시 차감 후 기록
create or replace function public.place_bet(p_game int, p_option int, p_amount int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game record;
  v_balance int;
begin
  if p_amount <= 0 then
    raise exception '베팅액은 1 이상이어야 합니다.';
  end if;

  select * into v_game from public.games where id = p_game for update;
  if not found then raise exception '게임을 찾을 수 없습니다.'; end if;
  if v_game.type <> 'pool' then raise exception '베팅 가능한 게임이 아닙니다.'; end if;
  if v_game.status <> 'open' then raise exception '지금은 베팅할 수 없습니다.'; end if;

  perform 1 from public.bet_options where id = p_option and game_id = p_game;
  if not found then raise exception '선택지를 찾을 수 없습니다.'; end if;

  -- 베팅액 차감 (잔액 부족 시 여기서 거부)
  v_balance := public._apply_gold(v_uid, -p_amount, 'game', v_game.title || ' 베팅', v_uid);

  insert into public.bets(game_id, option_id, user_id, amount)
  values (p_game, p_option, v_uid, p_amount);

  return jsonb_build_object('balance', v_balance);
end;
$$;

-- 정산: 관리자가 우승 선택지를 정하면 팟을 우승 베팅 비율대로 분배 (토큰 보존)
create or replace function public.settle_pool_game(p_game int, p_winning_option int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game       record;
  v_pot        int;
  v_winstake   int;
  v_distributed int := 0;
  v_remainder  int;
  r            record;
  v_pay        int;
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 가능합니다.';
  end if;

  select * into v_game from public.games where id = p_game for update;
  if not found then raise exception '게임을 찾을 수 없습니다.'; end if;
  if v_game.type <> 'pool' then raise exception '팟배팅 게임이 아닙니다.'; end if;
  if v_game.status not in ('open','locked') then
    raise exception '이미 정산되었거나 취소된 게임입니다.';
  end if;

  perform 1 from public.bet_options where id = p_winning_option and game_id = p_game;
  if not found then raise exception '우승 선택지가 올바르지 않습니다.'; end if;

  select coalesce(sum(amount),0) into v_pot
    from public.bets where game_id = p_game;
  select coalesce(sum(amount),0) into v_winstake
    from public.bets where game_id = p_game and option_id = p_winning_option;

  if v_pot = 0 then
    null; -- 베팅 없음
  elsif v_winstake = 0 then
    -- 우승 베팅 없음: 전원 환불
    for r in select id, user_id, amount from public.bets where game_id = p_game loop
      perform public._apply_gold(r.user_id, r.amount, 'game', v_game.title || ' 무효 환불', auth.uid());
      update public.bets set payout = amount where id = r.id;
    end loop;
  else
    -- 파리뮤추얼: floor 분배 후 잔여분을 큰 베팅부터 1씩 보정 → 합계 = 팟
    for r in
      select id, amount from public.bets
      where game_id = p_game and option_id = p_winning_option
      order by amount desc, id
    loop
      v_pay := (r.amount::bigint * v_pot / v_winstake)::int;
      v_distributed := v_distributed + v_pay;
      update public.bets set payout = v_pay where id = r.id;
    end loop;

    v_remainder := v_pot - v_distributed;
    for r in
      select id from public.bets
      where game_id = p_game and option_id = p_winning_option
      order by amount desc, id
    loop
      exit when v_remainder <= 0;
      update public.bets set payout = payout + 1 where id = r.id;
      v_remainder := v_remainder - 1;
    end loop;

    -- 실제 지급
    for r in
      select user_id, payout from public.bets
      where game_id = p_game and option_id = p_winning_option
    loop
      perform public._apply_gold(r.user_id, r.payout, 'game', v_game.title || ' 당첨', auth.uid());
    end loop;
  end if;

  update public.games
    set status = 'settled',
        result = jsonb_build_object(
          'winning_option', p_winning_option,
          'pot', v_pot,
          'winner_stake', v_winstake
        )
    where id = p_game;

  return jsonb_build_object(
    'pot', v_pot,
    'winner_stake', v_winstake,
    'refunded', (v_pot > 0 and v_winstake = 0)
  );
end;
$$;

-- 취소: 전 베팅 환불 후 cancelled
create or replace function public.cancel_pool_game(p_game int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game record;
  r      record;
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 가능합니다.';
  end if;

  select * into v_game from public.games where id = p_game for update;
  if not found then raise exception '게임을 찾을 수 없습니다.'; end if;
  if v_game.status in ('settled','cancelled') then
    raise exception '이미 종료된 게임입니다.';
  end if;

  for r in select id, user_id, amount from public.bets where game_id = p_game loop
    perform public._apply_gold(r.user_id, r.amount, 'game', v_game.title || ' 취소 환불', auth.uid());
    update public.bets set payout = amount where id = r.id;
  end loop;

  update public.games set status = 'cancelled' where id = p_game;
end;
$$;

-- 룰렛: 1~10. low(1-5)/high(6-10)/odd/even = x2, 숫자 적중 = x10.
create or replace function public.gamble_roulette(p_bet int, p_choice text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_roll int;
  v_win boolean := false;
  v_mult int := 0;
  v_num int;
  v_balance int;
begin
  if p_bet <= 0 then
    raise exception '베팅액은 1 이상이어야 합니다.';
  end if;

  perform public._apply_gold(v_uid, -p_bet, 'gamble', '룰렛 베팅', v_uid);

  v_roll := floor(random() * 10)::int + 1; -- 1~10

  if p_choice = 'low' then
    v_win := v_roll between 1 and 5; v_mult := 2;
  elsif p_choice = 'high' then
    v_win := v_roll between 6 and 10; v_mult := 2;
  elsif p_choice = 'odd' then
    v_win := (v_roll % 2 = 1); v_mult := 2;
  elsif p_choice = 'even' then
    v_win := (v_roll % 2 = 0); v_mult := 2;
  elsif p_choice ~ '^[0-9]+$' then
    v_num := p_choice::int;
    if v_num < 1 or v_num > 10 then
      raise exception '1~10 중에서 선택하세요.';
    end if;
    v_win := (v_roll = v_num); v_mult := 10;
  else
    raise exception '잘못된 선택입니다.';
  end if;

  if v_win then
    v_balance := public._apply_gold(v_uid, p_bet * v_mult, 'gamble', '룰렛 당첨', v_uid);
  else
    v_balance := (select gold_balance from public.profiles where id = v_uid);
  end if;

  insert into public.game_plays(game_id, user_id, result, gold_delta)
  values (null, v_uid,
    jsonb_build_object('game','roulette','choice',p_choice,'roll',v_roll,'win',v_win,'mult',v_mult),
    case when v_win then p_bet * (v_mult - 1) else -p_bet end);

  return jsonb_build_object('roll', v_roll, 'win', v_win, 'balance', v_balance, 'mult', v_mult);
end;
$$;

-- ---------- RLS ----------
alter table public.bet_options enable row level security;
alter table public.bets        enable row level security;

-- 읽기: 로그인 사용자 전체 (팟/베팅 현황 투명 공개)
drop policy if exists "read_bet_options" on public.bet_options;
create policy "read_bet_options" on public.bet_options for select to authenticated using (true);

drop policy if exists "read_bets" on public.bets;
create policy "read_bets" on public.bets for select to authenticated using (true);

-- 쓰기: 선택지는 관리자만 직접 수정, 베팅은 place_bet RPC(SECURITY DEFINER)로만
drop policy if exists "admin_write_bet_options" on public.bet_options;
create policy "admin_write_bet_options" on public.bet_options for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- bets: 직접 INSERT/UPDATE 정책 없음 → RPC로만 변경

-- ---------- Realtime ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.bets;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.bet_options;
  exception when duplicate_object then null; end;
end $$;
