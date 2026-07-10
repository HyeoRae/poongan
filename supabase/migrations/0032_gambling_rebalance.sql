-- =============================================================
-- 빈부격차 완화: 도박 하우스세(누진) + 로빈훗 잭팟 재분배 + 신규 효과카드 2종.
-- 0001~0031 실행 후 이 파일을 실행하세요.
--
-- 배경: 효과카드(payout_boost/lucky/double_next/bailout)를 잘 뽑은 참가자가
--       하우스 엣지 0% 인 도박을 무한 반복하며 격차가 벌어졌다.
--
-- 이 마이그레이션이 하는 일
--  1) 도박 당첨금의 "순이익"에서 누진 하우스세를 떼 공동 잭팟풀에 적립
--     → 도박 EV 를 (특히 부자에게) 마이너스로 되돌려 무한 증식 억제.
--  2) 관리자가 잭팟풀을 하위 절반에게 역가중 분배(distribute_jackpot).
--  3) 신규 효과카드: 언더독(하위권 배당↑) / 세무조사(부자 잔액 일부 징수→풀).
--  4) 하우스세 on/off·세율을 app_settings 로 실시간 조정(재배포 불필요).
-- =============================================================

-- ---------- 공동 잭팟풀 (싱글턴) ----------
create table if not exists public.jackpot_pool (
  id          int primary key default 1,
  amount      bigint not null default 0,   -- 도박 하우스세·세무조사로 모인 재분배 대기 토큰
  updated_at  timestamptz not null default now(),
  constraint jackpot_pool_singleton check (id = 1)
);
insert into public.jackpot_pool (id, amount) values (1, 0) on conflict (id) do nothing;

alter table public.jackpot_pool enable row level security;
-- 읽기: 전원 공개(대시보드 표시용). 쓰기 직접정책 없음 → RPC(security definer) 전용.
drop policy if exists "read_jackpot" on public.jackpot_pool;
create policy "read_jackpot" on public.jackpot_pool for select to authenticated using (true);

-- ---------- app_settings: 하우스세 토글/세율 ----------
alter table public.app_settings add column if not exists house_tax_on   boolean not null default true;
alter table public.app_settings add column if not exists house_tax_base  numeric not null default 0.10;  -- ⚠ lib/constants.ts HOUSE_TAX_BASE 와 값 일치
alter table public.app_settings add column if not exists house_tax_rich  numeric not null default 0.15;  -- ⚠ lib/constants.ts HOUSE_TAX_RICH 와 값 일치

-- ---------- transactions 종류 확장 ('jackpot' 재분배/징수) ----------
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions
  add constraint transactions_type_check
  check (type in ('admin_grant','game','gamble','transfer','steal','shop','fee','gacha','jackpot'));

-- ---------- 부(富) 구간 헬퍼 ----------
-- player(봇 제외) 전체를 잔액 오름차순 3등분 → 'bottom' | 'mid' | 'top'.
-- 대상이 player 가 아니면(관리자 등) null → 언더독/부자세 어느 쪽도 적용 안 됨.
create or replace function public._wealth_bucket(p_uid uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select case b when 1 then 'bottom' when 3 then 'top' else 'mid' end
  from (
    select id, ntile(3) over (order by gold_balance asc) as b
    from public.profiles
    where role = 'player' and is_bot = false
  ) t
  where t.id = p_uid;
$$;

-- ---------- 도박 누진 하우스세 ----------
-- 순이익(p_profit>0)에 base 세율, 상위 1/3 이면 +rich 세율. 토글 off 면 0.
-- 반환값(정수)은 잭팟풀로 적립되고 당첨금에서 차감된다.
create or replace function public._gamble_house_tax(p_uid uuid, p_profit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_on   boolean;
  v_base numeric;
  v_rich numeric;
  v_rate numeric;
begin
  if p_profit <= 0 then return 0; end if;
  select house_tax_on, house_tax_base, house_tax_rich
    into v_on, v_base, v_rich
    from public.app_settings where id = 1;
  if not coalesce(v_on, true) then return 0; end if;
  v_rate := coalesce(v_base, 0.10);
  if public._wealth_bucket(p_uid) = 'top' then
    v_rate := v_rate + coalesce(v_rich, 0.15);
  end if;
  return floor(p_profit * v_rate)::int;
end;
$$;

-- ---------- 도박 RPC 재정의 (하우스세 + 언더독 훅 추가) ----------
-- 기존 효과 훅(lucky/payout_boost/double_next/bailout)은 그대로 유지.
-- 신규: underdog(하위권 배당 +20%, 세전) · 하우스세(순이익 누진세 → 잭팟풀).
create or replace function public.gamble_coinflip(p_bet int, p_choice text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_outcome text;
  v_win boolean;
  v_delta int;
  v_balance int;
  v_bailed boolean := false;
  v_profit int;
  v_tax int := 0;
begin
  if p_choice not in ('front','back') then
    raise exception '앞(front)/뒤(back) 중 선택하세요.';
  end if;
  if p_bet <= 0 then
    raise exception '베팅액은 1 이상이어야 합니다.';
  end if;

  perform public._apply_gold(v_uid, -p_bet, 'gamble', '동전던지기 베팅', v_uid);

  v_outcome := case when random() < 0.5 then 'front' else 'back' end;
  v_win := (v_outcome = p_choice);

  -- 행운의 편자: 패배 시 10% 구제
  if not v_win and public._has_passive(v_uid, 'lucky') and random() < 0.10 then
    v_win := true; v_outcome := p_choice;
  end if;

  if v_win then
    v_delta := p_bet * 2;
    if public._has_passive(v_uid, 'payout_boost') then v_delta := floor(v_delta * 1.1); end if;
    -- 언더독: 잔액 하위 1/3 이면 당첨금 +20% (⚠ lib/constants.ts UNDERDOG_BOOST)
    if public._has_passive(v_uid, 'underdog') and public._wealth_bucket(v_uid) = 'bottom' then
      v_delta := floor(v_delta * 1.2);
    end if;
    if public._consume_effect(v_uid, 'double_next') then v_delta := v_delta * 2; end if;
    -- 하우스세: 순이익 누진세를 잭팟풀로 적립 후 당첨금에서 차감
    v_profit := v_delta - p_bet;
    v_tax := public._gamble_house_tax(v_uid, v_profit);
    if v_tax > 0 then
      v_delta := v_delta - v_tax;
      update public.jackpot_pool set amount = amount + v_tax, updated_at = now() where id = 1;
    end if;
    v_balance := public._apply_gold(v_uid, v_delta, 'gamble', '동전던지기 당첨(세후)', v_uid);
  elsif public._consume_effect(v_uid, 'bailout') then
    v_bailed := true;
    v_balance := public._apply_gold(v_uid, p_bet, 'gamble', '방탄조끼 환급', v_uid);
  else
    v_balance := (select gold_balance from public.profiles where id = v_uid);
  end if;

  insert into public.game_plays(game_id, user_id, result, gold_delta, refunded)
  values (null, v_uid,
    jsonb_build_object('game','coinflip','choice',p_choice,'outcome',v_outcome,'win',v_win,'tax',v_tax),
    case when v_win then v_delta - p_bet else -p_bet end,
    v_bailed);

  return jsonb_build_object('outcome', v_outcome, 'win', v_win, 'balance', v_balance);
end;
$$;

create or replace function public.gamble_dice(p_bet int, p_guess int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_roll int;
  v_win boolean;
  v_delta int;
  v_balance int;
  v_bailed boolean := false;
  v_profit int;
  v_tax int := 0;
begin
  if p_guess < 1 or p_guess > 6 then
    raise exception '1~6 중에서 선택하세요.';
  end if;
  if p_bet <= 0 then
    raise exception '베팅액은 1 이상이어야 합니다.';
  end if;

  perform public._apply_gold(v_uid, -p_bet, 'gamble', '주사위 베팅', v_uid);

  v_roll := floor(random() * 6)::int + 1;
  v_win := (v_roll = p_guess);

  if not v_win and public._has_passive(v_uid, 'lucky') and random() < 0.10 then
    v_win := true; v_roll := p_guess;
  end if;

  if v_win then
    v_delta := p_bet * 6;
    if public._has_passive(v_uid, 'payout_boost') then v_delta := floor(v_delta * 1.1); end if;
    if public._has_passive(v_uid, 'underdog') and public._wealth_bucket(v_uid) = 'bottom' then
      v_delta := floor(v_delta * 1.2);
    end if;
    if public._consume_effect(v_uid, 'double_next') then v_delta := v_delta * 2; end if;
    v_profit := v_delta - p_bet;
    v_tax := public._gamble_house_tax(v_uid, v_profit);
    if v_tax > 0 then
      v_delta := v_delta - v_tax;
      update public.jackpot_pool set amount = amount + v_tax, updated_at = now() where id = 1;
    end if;
    v_balance := public._apply_gold(v_uid, v_delta, 'gamble', '주사위 당첨(세후)', v_uid);
  elsif public._consume_effect(v_uid, 'bailout') then
    v_bailed := true;
    v_balance := public._apply_gold(v_uid, p_bet, 'gamble', '방탄조끼 환급', v_uid);
  else
    v_balance := (select gold_balance from public.profiles where id = v_uid);
  end if;

  insert into public.game_plays(game_id, user_id, result, gold_delta, refunded)
  values (null, v_uid,
    jsonb_build_object('game','dice','guess',p_guess,'roll',v_roll,'win',v_win,'tax',v_tax),
    case when v_win then v_delta - p_bet else -p_bet end,
    v_bailed);

  return jsonb_build_object('roll', v_roll, 'win', v_win, 'balance', v_balance);
end;
$$;

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
  v_delta int;
  v_balance int;
  v_bailed boolean := false;
  v_profit int;
  v_tax int := 0;
begin
  if p_bet <= 0 then
    raise exception '베팅액은 1 이상이어야 합니다.';
  end if;

  perform public._apply_gold(v_uid, -p_bet, 'gamble', '룰렛 베팅', v_uid);

  v_roll := floor(random() * 10)::int + 1;

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

  -- 행운의 편자: 패배 시 10% 구제
  if not v_win and public._has_passive(v_uid, 'lucky') and random() < 0.10 then
    v_win := true;
    if v_mult = 0 then v_mult := 2; end if;
  end if;

  if v_win then
    v_delta := p_bet * v_mult;
    if public._has_passive(v_uid, 'payout_boost') then v_delta := floor(v_delta * 1.1); end if;
    if public._has_passive(v_uid, 'underdog') and public._wealth_bucket(v_uid) = 'bottom' then
      v_delta := floor(v_delta * 1.2);
    end if;
    if public._consume_effect(v_uid, 'double_next') then v_delta := v_delta * 2; end if;
    v_profit := v_delta - p_bet;
    v_tax := public._gamble_house_tax(v_uid, v_profit);
    if v_tax > 0 then
      v_delta := v_delta - v_tax;
      update public.jackpot_pool set amount = amount + v_tax, updated_at = now() where id = 1;
    end if;
    v_balance := public._apply_gold(v_uid, v_delta, 'gamble', '룰렛 당첨(세후)', v_uid);
  elsif public._consume_effect(v_uid, 'bailout') then
    v_bailed := true;
    v_balance := public._apply_gold(v_uid, p_bet, 'gamble', '방탄조끼 환급', v_uid);
  else
    v_balance := (select gold_balance from public.profiles where id = v_uid);
  end if;

  insert into public.game_plays(game_id, user_id, result, gold_delta, refunded)
  values (null, v_uid,
    jsonb_build_object('game','roulette','choice',p_choice,'roll',v_roll,'win',v_win,'mult',v_mult,'tax',v_tax),
    case when v_win then v_delta - p_bet else -p_bet end,
    v_bailed);

  return jsonb_build_object('roll', v_roll, 'win', v_win, 'balance', v_balance, 'mult', v_mult);
end;
$$;

-- ---------- 로빈훗 잭팟 분배 (관리자) ----------
-- 잭팟풀 전액을 하위 절반(player, 봇 제외, 잔액 오름차순)에게 균등 분배.
-- floor 잔여분은 최하위부터 1씩 보정 → 총량 보존(풀=지급 합). 분배 후 풀=0.
create or replace function public.distribute_jackpot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_pool bigint;
  v_recipients uuid[];
  v_n int;
  v_total int;
  v_players int;
  v_share int;
  v_remainder int;
  v_uid uuid;
  v_i int := 0;
begin
  if not public.is_admin(v_admin) then
    raise exception '관리자만 가능합니다.';
  end if;

  select amount into v_pool from public.jackpot_pool where id = 1 for update;
  if coalesce(v_pool, 0) <= 0 then
    raise exception '분배할 잭팟이 없습니다.';
  end if;

  select count(*) into v_players
    from public.profiles where role = 'player' and is_bot = false;
  if v_players = 0 then
    raise exception '분배 대상이 없습니다.';
  end if;

  -- 하위 절반(잔액 오름차순). 최소 1명.
  select array_agg(id order by gold_balance asc)
    into v_recipients
    from (
      select id, gold_balance from public.profiles
      where role = 'player' and is_bot = false
      order by gold_balance asc
      limit greatest(1, floor(v_players * 0.5)::int)  -- ⚠ lib/constants.ts JACKPOT_BOTTOM_FRACTION
    ) t;

  v_n := coalesce(array_length(v_recipients, 1), 0);
  if v_n = 0 then
    raise exception '분배 대상이 없습니다.';
  end if;

  v_total := v_pool::int;            -- 이벤트 규모상 int 범위 내
  v_share := (v_total / v_n);        -- 정수 나눗셈(내림)
  v_remainder := v_total - v_share * v_n;

  foreach v_uid in array v_recipients loop
    v_i := v_i + 1;
    -- 최하위(앞쪽)부터 잔여 1토큰씩 더 → 지급 합 = 풀(총량 보존)
    perform public._apply_gold(
      v_uid,
      v_share + case when v_i <= v_remainder then 1 else 0 end,
      'jackpot', '로빈훗 잭팟 분배', v_admin
    );
  end loop;

  update public.jackpot_pool set amount = 0, updated_at = now() where id = 1;
  return jsonb_build_object('pool', v_total, 'recipients', v_n);
end;
$$;

-- ---------- 세무조사 (효과카드 소모템, 대상지정) ----------
-- 대상(부자) 1명 잔액의 10% 를 잭팟풀로 징수. 약자가 부자를 견제하는 능동 수단.
create or replace function public.use_tax_audit(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bal int;
  v_amount int;
begin
  if p_target is null then
    raise exception '대상을 선택하세요.';
  end if;
  if p_target = v_uid then
    raise exception '자기 자신은 조사할 수 없습니다.';
  end if;

  select gold_balance into v_bal from public.profiles where id = p_target for update;
  if v_bal is null then
    raise exception '대상을 찾을 수 없습니다.';
  end if;

  if not public._consume_effect(v_uid, 'tax_audit') then
    raise exception '세무조사 카드가 없습니다.';
  end if;

  v_amount := floor(v_bal * 0.10)::int;   -- ⚠ lib/constants.ts TAX_AUDIT_PCT
  if v_amount > 0 then
    perform public._apply_gold(p_target, -v_amount, 'jackpot', '세무조사 징수', v_uid);
    update public.jackpot_pool set amount = amount + v_amount, updated_at = now() where id = 1;
  end if;

  return jsonb_build_object('amount', v_amount, 'target', p_target);
end;
$$;

-- ---------- 관리자: 하우스세 토글/세율 조정 ----------
create or replace function public.set_house_tax(
  p_on boolean, p_base numeric, p_rich numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 가능합니다.';
  end if;
  if p_base < 0 or p_base > 0.9 or p_rich < 0 or p_rich > 0.9 then
    raise exception '세율은 0~0.9 사이여야 합니다.';
  end if;
  update public.app_settings
    set house_tax_on = p_on, house_tax_base = p_base, house_tax_rich = p_rich,
        updated_at = now()
    where id = 1;
end;
$$;

-- ---------- 신규 효과카드 프리셋 ----------
insert into public.effect_card_presets(key, name, description, grade, effect_key, icon) values
  ('underdog',  '언더독',   '잔액 하위권일 때 도박 당첨금 +20%',          'passive',    'underdog',  '🦴'),
  ('tax_audit', '세무조사', '대상 1명 잔액의 10%를 공동 잭팟풀로 징수',    'consumable', 'tax_audit', '🧾')
on conflict (key) do nothing;

-- ---------- Realtime ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.jackpot_pool;
  exception when duplicate_object then null; end;
end $$;
