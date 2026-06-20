-- =============================================================
-- 도박 RPC — 서버에서 결과를 결정해 조작 방지. _apply_gold 재사용.
-- 0001_init.sql 실행 후 이 파일을 실행하세요.
-- =============================================================

-- 동전던지기: 베팅 후 앞/뒤 선택. 적중 시 1:2 (순이익 +베팅), 실패 시 -베팅.
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
begin
  if p_choice not in ('front','back') then
    raise exception '앞(front)/뒤(back) 중 선택하세요.';
  end if;
  if p_bet <= 0 then
    raise exception '베팅액은 1 이상이어야 합니다.';
  end if;

  -- 먼저 베팅액 차감(잔액 부족 시 여기서 거부)
  perform public._apply_gold(v_uid, -p_bet, 'gamble', '동전던지기 베팅', v_uid);

  v_outcome := case when random() < 0.5 then 'front' else 'back' end;
  v_win := (v_outcome = p_choice);

  if v_win then
    v_delta := p_bet * 2;
    v_balance := public._apply_gold(v_uid, v_delta, 'gamble', '동전던지기 당첨', v_uid);
  else
    v_balance := (select gold_balance from public.profiles where id = v_uid);
  end if;

  insert into public.game_plays(game_id, user_id, result, gold_delta)
  values (null, v_uid,
    jsonb_build_object('game','coinflip','choice',p_choice,'outcome',v_outcome,'win',v_win),
    case when v_win then p_bet else -p_bet end);

  return jsonb_build_object('outcome', v_outcome, 'win', v_win, 'balance', v_balance);
end;
$$;

-- 주사위 맞히기: 1~6 중 하나 예측. 적중 시 6배 지급(순이익 +5배), 실패 시 -베팅.
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
  v_balance int;
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

  if v_win then
    v_balance := public._apply_gold(v_uid, p_bet * 6, 'gamble', '주사위 당첨', v_uid);
  else
    v_balance := (select gold_balance from public.profiles where id = v_uid);
  end if;

  insert into public.game_plays(game_id, user_id, result, gold_delta)
  values (null, v_uid,
    jsonb_build_object('game','dice','guess',p_guess,'roll',v_roll,'win',v_win),
    case when v_win then p_bet * 5 else -p_bet end);

  return jsonb_build_object('roll', v_roll, 'win', v_win, 'balance', v_balance);
end;
$$;
