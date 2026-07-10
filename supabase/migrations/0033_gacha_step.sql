-- =============================================================
-- 가챠(효과카드 뽑기) 증가폭 상향: +50 → +100.
-- 0027 의 draw_effect_card 를 그대로 두고 비용식 한 줄만 바꿔 재정의한다.
-- (뽑을수록 비용이 더 가파르게 오르도록 증가폭을 2배로 조정)
-- 0001~0032 실행 후 이 파일을 실행하세요.
--
--  · 비용식: v_cost := 200 + 100 * v_paid  ⚠ lib/constants.ts GACHA_BASE(200)/GACHA_STEP(100) 와 값 일치
--  · 나머지 로직(무료 3연차·등급확률·중복환급 50%)은 0027 과 동일.
-- =============================================================

create or replace function public.draw_effect_card()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_free   int;
  v_paid   int;
  v_cost   int;
  v_isfree boolean;
  v_r      double precision;
  v_grade  text;
  v_preset public.effect_card_presets%rowtype;
  v_dup    boolean := false;
  v_refund int := 0;
  v_balance int;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  insert into public.player_gacha(user_id) values (v_uid) on conflict do nothing;
  select free_left, paid_count into v_free, v_paid
  from public.player_gacha where user_id = v_uid for update;

  v_isfree := v_free > 0;
  if v_isfree then
    v_cost := 0;
  else
    v_cost := 200 + 100 * v_paid;                     -- 비용 점증. ⚠ lib/constants.ts GACHA_BASE(200)/GACHA_STEP(100) 와 값 일치
    perform public._apply_gold(v_uid, -v_cost, 'gacha', '효과카드 뽑기', v_uid);
  end if;

  -- 등급 추첨: 꽝 40% / 상시 45% / 희귀 15%
  -- ⚠ lib/constants.ts GACHA_ODDS 와 값 일치 (거긴 개별확률 .4/.45/.15, 여긴 누적 임계값 .40/.85 로 환산)
  v_r := random();
  if v_r < 0.40 then
    v_grade := 'blank';
  elsif v_r < 0.85 then
    v_grade := 'passive';
  else
    v_grade := 'consumable';
  end if;

  if v_grade <> 'blank' then
    select * into v_preset from public.effect_card_presets
    where grade = v_grade order by random() limit 1;
  end if;

  if v_grade = 'blank' or v_preset.id is null then
    v_grade := 'blank';
  elsif v_preset.grade = 'passive'
        and exists (
          select 1 from public.player_effect_cards
          where user_id = v_uid and preset_id = v_preset.id
        ) then
    -- 상시 중복 → 카드 대신 소액 환급(뽑기 비용의 절반, 무료뽑기면 0 → 무한이득 방지)
    v_dup := true;
    v_refund := floor(v_cost / 2.0);
    if v_refund > 0 then
      perform public._apply_gold(v_uid, v_refund, 'gacha', '효과카드 중복 환급', v_uid);
    end if;
  else
    insert into public.player_effect_cards(user_id, preset_id)
    values (v_uid, v_preset.id);
  end if;

  -- 뽑기 카운터 갱신
  if v_isfree then
    update public.player_gacha set free_left = free_left - 1 where user_id = v_uid;
  else
    update public.player_gacha set paid_count = paid_count + 1 where user_id = v_uid;
  end if;

  v_balance := (select gold_balance from public.profiles where id = v_uid);

  return jsonb_build_object(
    'blank',    v_grade = 'blank',
    'grade',    case when v_grade = 'blank' then null else v_preset.grade end,
    'key',      case when v_grade = 'blank' then null else v_preset.key end,
    'name',     case when v_grade = 'blank' then null else v_preset.name end,
    'icon',     case when v_grade = 'blank' then null else v_preset.icon end,
    'dup',      v_dup,
    'refund',   v_refund,
    'cost',     v_cost,
    'was_free', v_isfree,
    'balance',  v_balance
  );
end;
$$;
