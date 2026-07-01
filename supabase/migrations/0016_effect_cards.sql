-- =============================================================
-- 효과카드 + 가챠(뽑기) 시스템.
-- 0001~0015 실행 후 이 파일을 실행하세요.
--
--  · 등급: passive(상시) / consumable(1회용) + 꽝(카드 없음).
--  · 획득: 초기 무료 3연차 + 이후 토큰 소모 뽑기(비용 점증). draw_effect_card().
--  · 효과 적용: 도박 RPC 3종 + transfer_gold 를 재정의해 헬퍼로 훅.
--  · 대상지정 소모템: peek_role(관심법), ledger_peek(흥신소), use_mulligan(재도전).
-- =============================================================

-- ---------- 테이블 ----------
create table if not exists public.effect_card_presets (
  id          serial primary key,
  key         text not null unique,
  name        text not null,
  description text not null,
  grade       text not null check (grade in ('passive','consumable')),
  effect_key  text not null,
  icon        text not null default '🎴',
  weight      int  not null default 1
);

create table if not exists public.player_effect_cards (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  preset_id   int  not null references public.effect_card_presets(id) on delete cascade,
  acquired_at timestamptz not null default now(),
  used_at     timestamptz  -- 소모템 사용 시각(상시는 항상 null)
);
create index if not exists player_effect_cards_user_idx
  on public.player_effect_cards(user_id, used_at);

create table if not exists public.player_gacha (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  free_left   int not null default 3,
  paid_count  int not null default 0
);

-- 도박 무르기(재도전) 중복 환급 방지 플래그
alter table public.game_plays add column if not exists refunded boolean not null default false;

-- ---------- RLS ----------
alter table public.effect_card_presets  enable row level security;
alter table public.player_effect_cards  enable row level security;
alter table public.player_gacha          enable row level security;

-- 도감(프리셋)은 공개. 보유/뽑기카운터는 본인만. 쓰기 직접정책 없음 → RPC 전용.
drop policy if exists "read_presets" on public.effect_card_presets;
create policy "read_presets" on public.effect_card_presets for select to authenticated using (true);

drop policy if exists "read_my_cards" on public.player_effect_cards;
create policy "read_my_cards" on public.player_effect_cards for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "read_my_gacha" on public.player_gacha;
create policy "read_my_gacha" on public.player_gacha for select to authenticated
  using (user_id = auth.uid());

-- ---------- 효과 헬퍼 ----------
-- 상시 패시브 보유 여부
create or replace function public._has_passive(p_uid uuid, p_key text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.player_effect_cards pc
    join public.effect_card_presets p on p.id = pc.preset_id
    where pc.user_id = p_uid and p.effect_key = p_key and p.grade = 'passive'
  );
$$;

-- 소모템 1장 소모(가장 오래된 미사용). 소모했으면 true.
create or replace function public._consume_effect(p_uid uuid, p_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  select pc.id into v_id
  from public.player_effect_cards pc
  join public.effect_card_presets p on p.id = pc.preset_id
  where pc.user_id = p_uid and p.effect_key = p_key
    and p.grade = 'consumable' and pc.used_at is null
  order by pc.acquired_at
  limit 1
  for update;

  if v_id is null then
    return false;
  end if;
  update public.player_effect_cards set used_at = now() where id = v_id;
  return true;
end;
$$;

-- ---------- 가챠 RPC ----------
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
    v_cost := 30 + 15 * v_paid;                       -- 비용 점증
    perform public._apply_gold(v_uid, -v_cost, 'gacha', '효과카드 뽑기', v_uid);
  end if;

  -- 등급 추첨: 꽝 40% / 상시 45% / 희귀 15%
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

-- ---------- 대상지정 소모템 ----------
-- 관심법: 대상 1명의 역할 엿보기
create or replace function public.peek_role(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_role text;
begin
  if p_target is null then
    raise exception '대상을 선택하세요.';
  end if;
  if not public._consume_effect(auth.uid(), 'peek') then
    raise exception '관심법 카드가 없습니다.';
  end if;
  select role into v_role from public.player_roles where user_id = p_target;
  return jsonb_build_object('target', p_target, 'role', coalesce(v_role, 'member'));
end;
$$;

-- 흥신소: 대상의 누적 전적 열람(카드가 교차열람 권한을 부여)
create or replace function public.ledger_peek(p_target uuid)
returns table (
  earned bigint, spent bigint, sent bigint, received bigint,
  fee_paid bigint, gamble_net bigint, gacha_spent bigint, tx_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_target is null then
    raise exception '대상을 선택하세요.';
  end if;
  if not public._consume_effect(auth.uid(), 'ledger') then
    raise exception '흥신소 카드가 없습니다.';
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

-- 재도전: 방금 진 도박 무르기(베팅액 환급)
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
  v_balance int;
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

  v_refund := -v_play.gold_delta;  -- 잃은 베팅액
  v_balance := public._apply_gold(v_uid, v_refund, 'gamble', '재도전 환급', v_uid);
  update public.game_plays set refunded = true where id = v_play.id;

  return jsonb_build_object('refund', v_refund, 'balance', v_balance);
end;
$$;

-- ---------- 도박 RPC 재정의 (효과 훅) ----------
-- 공통 효과: lucky(패배 10% 구제) · payout_boost(+10%) · double_next(x2, 당첨 시 소모) · bailout(패배 환급)
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
    if public._consume_effect(v_uid, 'double_next') then v_delta := v_delta * 2; end if;
    v_balance := public._apply_gold(v_uid, v_delta, 'gamble', '동전던지기 당첨', v_uid);
  elsif public._consume_effect(v_uid, 'bailout') then
    v_bailed := true;
    v_balance := public._apply_gold(v_uid, p_bet, 'gamble', '방탄조끼 환급', v_uid);
  else
    v_balance := (select gold_balance from public.profiles where id = v_uid);
  end if;

  -- 방탄으로 이미 환급된 패배는 재도전(mulligan) 대상에서 제외(refunded=true)
  insert into public.game_plays(game_id, user_id, result, gold_delta, refunded)
  values (null, v_uid,
    jsonb_build_object('game','coinflip','choice',p_choice,'outcome',v_outcome,'win',v_win),
    case when v_win then p_bet else -p_bet end,
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
    if public._consume_effect(v_uid, 'double_next') then v_delta := v_delta * 2; end if;
    v_balance := public._apply_gold(v_uid, v_delta, 'gamble', '주사위 당첨', v_uid);
  elsif public._consume_effect(v_uid, 'bailout') then
    v_bailed := true;
    v_balance := public._apply_gold(v_uid, p_bet, 'gamble', '방탄조끼 환급', v_uid);
  else
    v_balance := (select gold_balance from public.profiles where id = v_uid);
  end if;

  insert into public.game_plays(game_id, user_id, result, gold_delta, refunded)
  values (null, v_uid,
    jsonb_build_object('game','dice','guess',p_guess,'roll',v_roll,'win',v_win),
    case when v_win then p_bet * 5 else -p_bet end,
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
    if public._consume_effect(v_uid, 'double_next') then v_delta := v_delta * 2; end if;
    v_balance := public._apply_gold(v_uid, v_delta, 'gamble', '룰렛 당첨', v_uid);
  elsif public._consume_effect(v_uid, 'bailout') then
    v_bailed := true;
    v_balance := public._apply_gold(v_uid, p_bet, 'gamble', '방탄조끼 환급', v_uid);
  else
    v_balance := (select gold_balance from public.profiles where id = v_uid);
  end if;

  insert into public.game_plays(game_id, user_id, result, gold_delta, refunded)
  values (null, v_uid,
    jsonb_build_object('game','roulette','choice',p_choice,'roll',v_roll,'win',v_win,'mult',v_mult),
    case when v_win then p_bet * (v_mult - 1) else -p_bet end,
    v_bailed);

  return jsonb_build_object('roll', v_roll, 'win', v_win, 'balance', v_balance, 'mult', v_mult);
end;
$$;

-- ---------- 송금 RPC 재정의 (효과 훅: 면제/할인) ----------
-- 큰손(fee_half): 수수료 절반 / 무료송금(fee_free): 이번 1회 0(수수료 있을 때만 소모)
create or replace function public.transfer_gold(
  p_to uuid, p_amount int, p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from uuid := auth.uid();
  v_rate numeric := 0.20;
  v_fee  int;
  v_recv int;
begin
  if p_amount <= 0 then
    raise exception '금액은 1 이상이어야 합니다.';
  end if;
  if v_from = p_to then
    raise exception '자기 자신에게는 보낼 수 없습니다.';
  end if;

  if public._has_passive(v_from, 'fee_half') then
    v_rate := 0.10;
  end if;
  v_fee := floor(p_amount * v_rate);
  -- 수수료가 있을 때만 무료송금 카드를 소모(단락평가 미보장 → 중첩 IF)
  if v_fee > 0 then
    if public._consume_effect(v_from, 'fee_free') then
      v_fee := 0;
    end if;
  end if;
  v_recv := p_amount - v_fee;

  perform public._apply_gold(v_from, -v_recv, 'transfer', p_reason, v_from);
  if v_fee > 0 then
    perform public._apply_gold(v_from, -v_fee, 'fee', '송금 수수료', v_from);
  end if;
  perform public._apply_gold(p_to, v_recv, 'transfer', p_reason, v_from);
end;
$$;

-- ---------- 관리자: 특정 효과카드 지급(선물/테스트용) ----------
create or replace function public.admin_grant_card(p_user uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_pid int;
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 가능합니다.';
  end if;
  select id into v_pid from public.effect_card_presets where key = p_key;
  if v_pid is null then
    raise exception '없는 카드 key 입니다: %', p_key;
  end if;
  insert into public.player_effect_cards(user_id, preset_id) values (p_user, v_pid);
end;
$$;

-- ---------- 프리셋 시드(도감) ----------
insert into public.effect_card_presets(key, name, description, grade, effect_key, icon) values
  ('payout_boost', '이자꾼',      '도박 당첨금 +10%',                       'passive',    'payout_boost', '🍀'),
  ('lucky',        '행운의 편자', '도박에서 지면 10% 확률로 구제(승리 전환)', 'passive',    'lucky',        '🐎'),
  ('fee_half',     '큰손',        '송금 수수료 절반(20%→10%)',              'passive',    'fee_half',     '💼'),
  ('double_next',  '몰빵권',      '다음 도박 당첨금 2배 (당첨 시 소모)',      'consumable', 'double_next',  '🎰'),
  ('bailout',      '방탄조끼',    '도박에서 지면 베팅액 환급 (패배 시 소모)', 'consumable', 'bailout',      '🛡️'),
  ('mulligan',     '재도전',      '방금 진 도박 무르기 1회',                 'consumable', 'mulligan',     '🔄'),
  ('peek',         '관심법',      '아무나 1명의 역할 엿보기 1회',            'consumable', 'peek',         '🔍'),
  ('fee_free',     '무료송금',    '다음 송금 수수료 0',                     'consumable', 'fee_free',     '✉️'),
  ('ledger',       '흥신소',      '대상의 누적 전적 열람 1회',               'consumable', 'ledger',       '🔎')
on conflict (key) do nothing;

-- ---------- Realtime ----------
do $$
begin
  begin
    alter publication supabase_realtime add table public.player_effect_cards;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.player_gacha;
  exception when duplicate_object then null; end;
end $$;
