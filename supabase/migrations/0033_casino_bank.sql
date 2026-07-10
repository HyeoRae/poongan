-- =============================================================
-- 인플레이션 구조적 차단: 카지노 뱅크롤 + 고배율 카드 익스플로잇 너프.
-- 0001~0032 실행 후 이 파일을 실행하세요.
--
-- 문제(실측): 초기자본 2,000 → 10시간 만에 팀 합산 수천만. 원인 두 가지.
--   1) 도박장이 유한 뱅크 없이 당첨금을 새로 "발행"한다 → 이길수록 총공급 증가.
--   2) 이자꾼(+10%)·행운의편자(패배 10% 구제)가 고배율 판(주사위 6배·숫자 10배)에
--      곱해져 기대값이 폭증. 예) 숫자뽑기 EV = 0.19×11 − 1 = +1.09 (매판 +109%).
--
-- 이 마이그레이션이 하는 일
--   A) 핫픽스: 상시 패시브(payout_boost·lucky)를 "2배 짝수판"에만 적용
--      → 주사위·숫자뽑기 EV 를 0 으로 되돌려 무한 증식 익스플로잇 차단.
--   B) 카지노 뱅크롤: 베팅은 뱅크로 적립, 당첨금은 뱅크에서만 지급(잔고 상한).
--      → 도박이 제로섬이 되어 총공급(플레이어+뱅크+잭팟풀) 불변 = 인플레 영구 차단.
--      카드는 여전히 "뱅크에서 더 따가는" 우위로 유효하되, 발행이 아니라 재분배가 된다.
-- =============================================================

-- ---------- 카지노 뱅크(하우스 뱅크롤) 싱글턴 ----------
create table if not exists public.casino_bank (
  id          int primary key default 1,
  balance     bigint not null default 0,   -- 베팅으로 적립, 당첨금 지급 시 차감. 여기서만 배당이 나온다.
  updated_at  timestamptz not null default now(),
  constraint casino_bank_singleton check (id = 1)
);
insert into public.casino_bank (id, balance) values (1, 0) on conflict (id) do nothing;

alter table public.casino_bank enable row level security;
drop policy if exists "read_casino_bank" on public.casino_bank;
create policy "read_casino_bank" on public.casino_bank for select to authenticated using (true);
-- 쓰기 직접정책 없음 → RPC 전용.

-- ---------- 카지노 지급 헬퍼 ----------
-- 뱅크에서 p_gross(=총 지급 의도액, 세금 포함)를 인출해 플레이어와 잭팟풀에 나눠 지급.
-- 뱅크 잔고가 모자라면 인출액을 잔고까지로 상한(부분 지급) → 뱅크가 돈을 찍어낼 수 없다.
--   · 플레이어 우선 지급(gross-tax), 남는 인출분이 잭팟풀로.
-- 반환: {paid: 실지급액, balance: 플레이어 새 잔액, capped: 상한 여부}
create or replace function public._casino_pay(p_uid uuid, p_gross int, p_tax int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank      bigint;
  v_fund      int;
  v_to_player int;
  v_to_pool   int;
  v_bal       int;
begin
  select balance into v_bank from public.casino_bank where id = 1 for update;
  v_fund := least(greatest(p_gross, 0), greatest(v_bank, 0))::int;  -- 뱅크가 감당할 수 있는 만큼만
  v_to_player := least(greatest(p_gross - p_tax, 0), v_fund);
  v_to_pool := v_fund - v_to_player;

  update public.casino_bank set balance = balance - v_fund, updated_at = now() where id = 1;
  if v_to_pool > 0 then
    update public.jackpot_pool set amount = amount + v_to_pool, updated_at = now() where id = 1;
  end if;

  if v_to_player > 0 then
    v_bal := public._apply_gold(p_uid, v_to_player, 'gamble', '도박 당첨(뱅크 지급)', p_uid);
  else
    v_bal := (select gold_balance from public.profiles where id = p_uid);
  end if;

  return jsonb_build_object('paid', v_to_player, 'balance', v_bal, 'capped', v_fund < p_gross);
end;
$$;

-- ---------- 관리자: 뱅크 잔고 조정(자금 투입/회수) ----------
-- 양수=뱅크에 자금 투입, 음수=회수(소각). 뱅크는 플레이어 공급량이 아니므로 투입해도 인플레 아님.
create or replace function public.adjust_casino_bank(p_amount int)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_new bigint;
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 가능합니다.';
  end if;
  update public.casino_bank set balance = greatest(balance + p_amount, 0), updated_at = now()
    where id = 1 returning balance into v_new;
  return v_new;
end;
$$;

-- ---------- 도박 RPC 재정의 (뱅크롤 + 고배율 카드 너프) ----------
-- 변경점(0032 대비):
--   · 베팅액을 뱅크에 적립(발행 대신 순환).
--   · 당첨금은 _casino_pay 로 뱅크에서만 지급(잔고 상한).
--   · payout_boost·lucky 는 v_mult=2(짝수판)에서만 적용 → 고배율 익스플로잇 차단.
--   · underdog(하위권)·double_next·bailout 은 유지(1회용/약자 보정, 뱅크 상한 적용).

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
  v_mult int := 2;                       -- 동전은 항상 2배(짝수판)
  v_delta int;
  v_pay jsonb;
  v_balance int;
  v_net int;
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
  update public.casino_bank set balance = balance + p_bet, updated_at = now() where id = 1;

  v_outcome := case when random() < 0.5 then 'front' else 'back' end;
  v_win := (v_outcome = p_choice);

  -- 행운의 편자: 짝수판(2배)에서만 패배 10% 구제
  if not v_win and v_mult = 2 and public._has_passive(v_uid, 'lucky') and random() < 0.10 then
    v_win := true; v_outcome := p_choice;
  end if;

  if v_win then
    v_delta := p_bet * v_mult;
    -- 이자꾼(+10%)은 짝수판에서만
    if v_mult = 2 and public._has_passive(v_uid, 'payout_boost') then v_delta := floor(v_delta * 1.1); end if;
    if public._has_passive(v_uid, 'underdog') and public._wealth_bucket(v_uid) = 'bottom' then
      v_delta := floor(v_delta * 1.2);
    end if;
    if public._consume_effect(v_uid, 'double_next') then v_delta := v_delta * 2; end if;
    v_profit := v_delta - p_bet;
    v_tax := public._gamble_house_tax(v_uid, v_profit);
    v_pay := public._casino_pay(v_uid, v_delta, v_tax);
    v_balance := (v_pay->>'balance')::int;
    v_net := (v_pay->>'paid')::int - p_bet;
  elsif public._consume_effect(v_uid, 'bailout') then
    v_pay := public._casino_pay(v_uid, p_bet, 0);   -- 방탄: 뱅크에서 베팅액 환급
    v_balance := (v_pay->>'balance')::int;
    v_net := (v_pay->>'paid')::int - p_bet;
  else
    v_balance := (select gold_balance from public.profiles where id = v_uid);
    v_net := -p_bet;
  end if;

  insert into public.game_plays(game_id, user_id, result, gold_delta, refunded)
  values (null, v_uid,
    jsonb_build_object('game','coinflip','choice',p_choice,'outcome',v_outcome,'win',v_win,'tax',v_tax),
    v_net,
    (not v_win) and v_net = 0);

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
  v_mult int := 6;                        -- 주사위는 6배(고배율) → 상시 패시브 미적용
  v_delta int;
  v_pay jsonb;
  v_balance int;
  v_net int;
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
  update public.casino_bank set balance = balance + p_bet, updated_at = now() where id = 1;

  v_roll := floor(random() * 6)::int + 1;
  v_win := (v_roll = p_guess);

  -- 고배율판이라 행운의 편자 미적용(익스플로잇 차단)
  if not v_win and v_mult = 2 and public._has_passive(v_uid, 'lucky') and random() < 0.10 then
    v_win := true; v_roll := p_guess;
  end if;

  if v_win then
    v_delta := p_bet * v_mult;
    if v_mult = 2 and public._has_passive(v_uid, 'payout_boost') then v_delta := floor(v_delta * 1.1); end if;
    if public._has_passive(v_uid, 'underdog') and public._wealth_bucket(v_uid) = 'bottom' then
      v_delta := floor(v_delta * 1.2);
    end if;
    if public._consume_effect(v_uid, 'double_next') then v_delta := v_delta * 2; end if;
    v_profit := v_delta - p_bet;
    v_tax := public._gamble_house_tax(v_uid, v_profit);
    v_pay := public._casino_pay(v_uid, v_delta, v_tax);
    v_balance := (v_pay->>'balance')::int;
    v_net := (v_pay->>'paid')::int - p_bet;
  elsif public._consume_effect(v_uid, 'bailout') then
    v_pay := public._casino_pay(v_uid, p_bet, 0);
    v_balance := (v_pay->>'balance')::int;
    v_net := (v_pay->>'paid')::int - p_bet;
  else
    v_balance := (select gold_balance from public.profiles where id = v_uid);
    v_net := -p_bet;
  end if;

  insert into public.game_plays(game_id, user_id, result, gold_delta, refunded)
  values (null, v_uid,
    jsonb_build_object('game','dice','guess',p_guess,'roll',v_roll,'win',v_win,'tax',v_tax),
    v_net,
    (not v_win) and v_net = 0);

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
  v_pay jsonb;
  v_balance int;
  v_net int;
  v_profit int;
  v_tax int := 0;
begin
  if p_bet <= 0 then
    raise exception '베팅액은 1 이상이어야 합니다.';
  end if;

  perform public._apply_gold(v_uid, -p_bet, 'gamble', '룰렛 베팅', v_uid);
  update public.casino_bank set balance = balance + p_bet, updated_at = now() where id = 1;

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
    v_win := (v_roll = v_num); v_mult := 10;   -- 숫자뽑기는 10배(고배율) → 상시 패시브 미적용
  else
    raise exception '잘못된 선택입니다.';
  end if;

  -- 행운의 편자: 짝수판(2배)에서만 패배 구제 (숫자뽑기 10배 익스플로잇 차단)
  if not v_win and v_mult = 2 and public._has_passive(v_uid, 'lucky') and random() < 0.10 then
    v_win := true;
  end if;

  if v_win then
    v_delta := p_bet * v_mult;
    if v_mult = 2 and public._has_passive(v_uid, 'payout_boost') then v_delta := floor(v_delta * 1.1); end if;
    if public._has_passive(v_uid, 'underdog') and public._wealth_bucket(v_uid) = 'bottom' then
      v_delta := floor(v_delta * 1.2);
    end if;
    if public._consume_effect(v_uid, 'double_next') then v_delta := v_delta * 2; end if;
    v_profit := v_delta - p_bet;
    v_tax := public._gamble_house_tax(v_uid, v_profit);
    v_pay := public._casino_pay(v_uid, v_delta, v_tax);
    v_balance := (v_pay->>'balance')::int;
    v_net := (v_pay->>'paid')::int - p_bet;
  elsif public._consume_effect(v_uid, 'bailout') then
    v_pay := public._casino_pay(v_uid, p_bet, 0);
    v_balance := (v_pay->>'balance')::int;
    v_net := (v_pay->>'paid')::int - p_bet;
  else
    v_balance := (select gold_balance from public.profiles where id = v_uid);
    v_net := -p_bet;
  end if;

  insert into public.game_plays(game_id, user_id, result, gold_delta, refunded)
  values (null, v_uid,
    jsonb_build_object('game','roulette','choice',p_choice,'roll',v_roll,'win',v_win,'mult',v_mult,'tax',v_tax),
    v_net,
    (not v_win) and v_net = 0);

  return jsonb_build_object('roll', v_roll, 'win', v_win, 'balance', v_balance, 'mult', v_mult);
end;
$$;

-- ---------- 재도전(mulligan) 재정의: 환급도 뱅크에서 ----------
-- 진 베팅은 이미 뱅크에 들어가 있으므로, 무르기 환급도 발행이 아니라 뱅크에서 지급해야 총량 보존.
create or replace function public.use_mulligan()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_play record;
  v_refund int;
  v_pay jsonb;
begin
  select * into v_play
  from public.game_plays
  where user_id = v_uid and gold_delta < 0 and refunded = false
    and (result->>'game') in ('coinflip','dice','roulette')
  order by created_at desc
  limit 1
  for update;

  if v_play.id is null then
    raise exception '무를 도박이 없습니다.';
  end if;
  if not public._consume_effect(v_uid, 'mulligan') then
    raise exception '재도전 카드가 없습니다.';
  end if;

  v_refund := -v_play.gold_delta;                 -- 잃은 베팅액
  v_pay := public._casino_pay(v_uid, v_refund, 0); -- 뱅크에서 환급
  update public.game_plays set refunded = true where id = v_play.id;

  return jsonb_build_object('refund', (v_pay->>'paid')::int, 'balance', (v_pay->>'balance')::int);
end;
$$;

-- ---------- Realtime ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.casino_bank;
  exception when duplicate_object then null; end;
end $$;
