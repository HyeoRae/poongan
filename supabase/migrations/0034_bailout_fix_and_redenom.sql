-- =============================================================
-- 인플레이션 대응 2종: (1) 방탄조끼 무한 재도전 차단 (2) 화폐개혁(디노미네이션) 소각.
-- 0001~0033 실행 후 이 파일을 실행하세요.
--
-- 배경(버그): 방탄조끼(bailout)가 "질 때만" 소모돼서, 카드 1장으로
--   이기면 당첨금 먹고 카드 유지 · 지면 전액 환급(손실 0) → "이길 때까지 무한 재도전"
--   = 변수 0, 무손실 화폐 발행기. 스크린샷의 -10억 베팅/+10억 환급 무한루프가 이것.
--
-- 이 마이그레이션이 하는 일
--  1) 방탄조끼를 "베팅 시점에 미리 1회 소모"로 변경 → 이기든 지든 카드 1장 소모.
--     무한 재도전 불가(카드가 바로 사라짐). 지면 여전히 베팅액 환급.
--     0032 의 gamble_coinflip/dice/roulette 를 그대로 두고 bailout 소모 위치만 앞으로 이동.
--  2) 화폐개혁 RPC redenominate(n): 전 계정 잔액을 1/n 로 내림, 차액을 소각(총공급량 감소).
--     잭팟풀도 동일 비율 축소. 관리자 전용. tx type 'redenom' 추가.
-- =============================================================

-- ---------- transactions 종류 확장 ('redenom' 화폐개혁 소각) ----------
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions
  add constraint transactions_type_check
  check (type in ('admin_grant','game','gamble','transfer','steal','shop','fee','gacha','jackpot','redenom'));

-- ---------- 카드 설명 갱신: 방탄조끼는 이제 베팅마다 소모 ----------
update public.effect_card_presets
   set description = '도박 베팅에 걸면 이기든 지든 1회 소모 · 지면 베팅액 환급'
 where key = 'bailout';

-- =============================================================
-- (1) 도박 RPC 재정의 — 방탄조끼 선(先)소모
--     0032 정의와 동일하되, bailout 을 베팅 직후 미리 소모(v_has_bailout)해
--     승패와 무관하게 카드 1장을 쓰도록 바꾼다.
-- =============================================================

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
  v_has_bailout boolean;
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

  -- 방탄조끼: 베팅 시점에 미리 1회 소모(이기든 지든 사용). 무한 재도전 차단.
  v_has_bailout := public._consume_effect(v_uid, 'bailout');

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
  elsif v_has_bailout then
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
  v_has_bailout boolean;
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

  -- 방탄조끼: 베팅 시점에 미리 1회 소모(이기든 지든 사용). 무한 재도전 차단.
  v_has_bailout := public._consume_effect(v_uid, 'bailout');

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
  elsif v_has_bailout then
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
  v_has_bailout boolean;
  v_profit int;
  v_tax int := 0;
begin
  if p_bet <= 0 then
    raise exception '베팅액은 1 이상이어야 합니다.';
  end if;

  perform public._apply_gold(v_uid, -p_bet, 'gamble', '룰렛 베팅', v_uid);

  -- 방탄조끼: 베팅 시점에 미리 1회 소모(이기든 지든 사용). 무한 재도전 차단.
  v_has_bailout := public._consume_effect(v_uid, 'bailout');

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
  elsif v_has_bailout then
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

-- =============================================================
-- (2) 화폐개혁(디노미네이션) — 관리자 전용 즉시 소각
--     전 계정 잔액을 1/p_divisor 로 내림, 차액을 _apply_gold(-burn,'redenom')로 소각.
--     잭팟풀도 동일 비율 축소. 잔액 비율은 그대로라 팀 순위/격차는 보존, 자릿수만 줄어든다.
-- =============================================================
create or replace function public.redenominate(p_divisor int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_uid  uuid;
  v_bal  int;
  v_burn int;
  v_total_burn bigint := 0;
  v_count int := 0;
  v_pool  bigint;
  v_pool_burn bigint;
begin
  if not public.is_admin(v_admin) then
    raise exception '관리자만 가능합니다.';
  end if;
  if p_divisor is null or p_divisor < 2 then
    raise exception '나눔 비율은 2 이상이어야 합니다. (예: 100 → 잔액 1/100)';
  end if;

  -- 잔액 있는 전 계정을 1/n 로 내림, 차액 소각. 행 잠금은 _apply_gold 가 담당.
  for v_uid, v_bal in
    select id, gold_balance from public.profiles
    where gold_balance > 0
    order by id
  loop
    v_burn := v_bal - (v_bal / p_divisor);   -- 정수 나눗셈(내림) → 차액이 소각량
    if v_burn > 0 then
      perform public._apply_gold(
        v_uid, -v_burn, 'redenom',
        '화폐개혁 소각(1/' || p_divisor || ')', v_admin
      );
      v_total_burn := v_total_burn + v_burn;
      v_count := v_count + 1;
    end if;
  end loop;

  -- 잭팟풀도 동일 비율 축소(소각).
  select amount into v_pool from public.jackpot_pool where id = 1 for update;
  if coalesce(v_pool, 0) > 0 then
    v_pool_burn := v_pool - (v_pool / p_divisor);
    update public.jackpot_pool
       set amount = amount - v_pool_burn, updated_at = now()
     where id = 1;
    v_total_burn := v_total_burn + v_pool_burn;
  end if;

  return jsonb_build_object(
    'divisor',  p_divisor,
    'accounts', v_count,
    'burned',   v_total_burn
  );
end;
$$;
