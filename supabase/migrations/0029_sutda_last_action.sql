-- =============================================================
-- 섯다 — 배팅 선택(콜/체크/삥/하프/따당/레이즈/다이)을 공개 표시
-- sutda_players.last_action 에 마지막으로 고른 배팅 옵션을 기록해
-- 모든 참가자가 각자의 프로필행 옆에서 볼 수 있게 한다.
-- 새 판 시작 / 2차 베팅 배분 / 재경기 시 초기화한다.
-- 0009_sutda.sql 실행 후 이 파일을 SQL Editor에서 실행하세요.
-- =============================================================

alter table public.sutda_players
  add column if not exists last_action text;

-- ---------- 2차 베팅 배분: 새 라운드 시작이므로 이전 선택 초기화 ----------
create or replace function public._sutda_deal_round2(p_room int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room       record;
  v_used       int[];
  v_pool       int[];
  v_contenders uuid[];
  v_n          int;
  v_idx        int;
  v_dseat      int;
  v_first      uuid;
begin
  select * into v_room from public.sutda_rooms where id = p_room;

  -- 이미 나간 카드(전원 첫 장) 제외하고 남은 덱에서 뽑는다(중복 방지)
  select array_agg(card1) into v_used
    from public.sutda_hands where room_id = p_room and hand_no = v_room.hand_no;
  select array_agg(c order by random()) into v_pool
    from generate_series(1, 20) c where c <> all(v_used);

  select array_agg(user_id order by seat) into v_contenders
    from public.sutda_players
    where room_id = p_room and in_hand and is_active and not folded;
  v_n := coalesce(array_length(v_contenders, 1), 0);

  for v_idx in 1 .. v_n loop
    update public.sutda_hands
      set card2 = v_pool[v_idx]
      where room_id = p_room and hand_no = v_room.hand_no and user_id = v_contenders[v_idx];
  end loop;

  -- 새 베팅 라운드 → 이전 라운드 배팅 선택 표시 초기화
  update public.sutda_players set last_action = null
    where room_id = p_room and in_hand and is_active and not folded;

  -- 2차 베팅 선 = 딜러 다음의 비폴드 참가자 (없으면 가장 낮은 좌석)
  select seat into v_dseat from public.sutda_players
    where room_id = p_room and user_id = v_room.dealer;
  select user_id into v_first from public.sutda_players
    where room_id = p_room and in_hand and is_active and not folded and seat > coalesce(v_dseat, -1)
    order by seat limit 1;
  if v_first is null then
    select user_id into v_first from public.sutda_players
      where room_id = p_room and in_hand and is_active and not folded
      order by seat limit 1;
  end if;

  update public.sutda_rooms
    set betting_round = 2,
        to_act_remaining = v_n,
        current_turn = v_first,
        turn_deadline = now() + interval '30 seconds',
        updated_at = now()
    where id = p_room;
end;
$$;

-- ---------- 판 시작: 이전 판의 배팅 선택도 초기화 ----------
create or replace function public.sutda_start_hand(p_room int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room record;
  v_deck int[];
  v_dealt uuid[] := '{}';
  v_idx int := 1;
  r record;
  v_n int;
  v_dealer uuid;
  v_first uuid;
begin
  select * into v_room from public.sutda_rooms where id = p_room for update;
  if not found then raise exception '방을 찾을 수 없습니다.'; end if;
  if v_room.created_by <> v_uid and not public.is_admin(v_uid) then
    raise exception '방장만 시작할 수 있습니다.';
  end if;
  if v_room.status = 'betting' then raise exception '이미 진행 중입니다.'; end if;

  if (select count(*) from public.sutda_players where room_id = p_room and is_active) < 2 then
    raise exception '2명 이상이어야 시작할 수 있습니다.';
  end if;

  -- 나가기 예약자는 이번 판부터 제외(안전망)
  update public.sutda_players set is_active = false where room_id = p_room and leave_pending;

  -- 이전 판 상태 초기화
  update public.sutda_players
    set committed = 0, folded = false, in_hand = false, last_action = null,
        revealed_card1 = null, revealed_card2 = null, revealed_rank = null, revealed_label = null
    where room_id = p_room;
  delete from public.sutda_hands where room_id = p_room and hand_no = v_room.hand_no + 1;

  -- 앤티 차감(부족하면 sit-out)
  for r in
    select user_id, seat from public.sutda_players
    where room_id = p_room and is_active order by seat
  loop
    begin
      perform public._apply_gold(r.user_id, -v_room.ante, 'game', '섯다 앤티', r.user_id);
      v_dealt := v_dealt || r.user_id;
    exception when others then
      update public.sutda_players set is_active = false where room_id = p_room and user_id = r.user_id;
    end;
  end loop;

  v_n := coalesce(array_length(v_dealt, 1), 0);
  if v_n < 2 then
    raise exception '앤티를 낼 수 있는 참가자가 2명 미만입니다.';
  end if;

  -- 셔플 후 첫 장만 배분 (마지막 장은 1차 베팅 후)
  select array_agg(c order by random()) into v_deck from generate_series(1, 20) c;
  for v_idx in 1 .. v_n loop
    insert into public.sutda_hands(room_id, hand_no, user_id, card1)
      values (p_room, v_room.hand_no + 1, v_dealt[v_idx], v_deck[v_idx]);
    update public.sutda_players
      set committed = v_room.ante, in_hand = true
      where room_id = p_room and user_id = v_dealt[v_idx];
  end loop;

  -- 딜러 회전 / 선(딜러 다음)
  v_dealer := v_dealt[((v_room.hand_no) % v_n) + 1];
  v_first  := v_dealt[((v_room.hand_no + 1) % v_n) + 1];

  update public.sutda_rooms
    set status = 'betting',
        betting_round = 1,
        hand_no = v_room.hand_no + 1,
        pot = v_room.ante * v_n,
        current_bet = v_room.ante,
        dealer = v_dealer,
        current_turn = v_first,
        to_act_remaining = v_n,
        redeal_used = false,
        turn_deadline = now() + interval '30 seconds',
        last_result = null,
        updated_at = now()
    where id = p_room;
end;
$$;

-- ---------- 베팅 액션: 고른 옵션을 last_action 에 기록 ----------
-- 기존 3인자 시그니처를 제거하고 라벨 인자를 추가한 4인자 버전으로 교체.
drop function if exists public.sutda_action(int, text, int);
create or replace function public.sutda_action(
  p_room int, p_action text, p_amount int default 0, p_label text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room record;
  v_me record;
  v_need int;
  v_raise int;
  v_total int;
  v_contenders int;
  v_balance int;
begin
  select * into v_room from public.sutda_rooms where id = p_room for update;
  if not found then raise exception '방을 찾을 수 없습니다.'; end if;
  if v_room.status <> 'betting' then raise exception '지금은 베팅할 수 없습니다.'; end if;
  if v_room.current_turn <> v_uid then raise exception '당신의 차례가 아닙니다.'; end if;

  select * into v_me from public.sutda_players where room_id = p_room and user_id = v_uid;
  if not found or not v_me.in_hand or v_me.folded or not v_me.is_active then
    raise exception '베팅할 수 없는 상태입니다.';
  end if;

  if p_action = 'fold' then
    update public.sutda_players set folded = true, last_action = '다이'
      where room_id = p_room and user_id = v_uid;
    update public.sutda_rooms set to_act_remaining = greatest(to_act_remaining - 1, 0) where id = p_room;

  elsif p_action = 'call' then
    v_need := v_room.current_bet - v_me.committed;
    if v_need > 0 then
      v_balance := public._apply_gold(v_uid, -v_need, 'game', '섯다 콜', v_uid);
      update public.sutda_players set committed = v_room.current_bet, last_action = '콜'
        where room_id = p_room and user_id = v_uid;
      update public.sutda_rooms set pot = pot + v_need where id = p_room;
    else
      update public.sutda_players set last_action = '체크'
        where room_id = p_room and user_id = v_uid;
    end if;
    update public.sutda_rooms set to_act_remaining = greatest(to_act_remaining - 1, 0) where id = p_room;

  elsif p_action = 'raise' then
    v_need := v_room.current_bet - v_me.committed;        -- 콜 분
    v_raise := p_amount;                                  -- 레이즈 증가분(삥/하프/따당/직접입력)
    if v_raise is null or v_raise < 1 then
      raise exception '레이즈 금액은 1 이상이어야 합니다.';
    end if;
    v_total := v_need + v_raise;
    v_balance := public._apply_gold(v_uid, -v_total, 'game', '섯다 레이즈', v_uid);
    update public.sutda_players
      set committed = v_me.committed + v_total,
          last_action = case when p_label in ('삥', '하프', '따당') then p_label else '레이즈' end
      where room_id = p_room and user_id = v_uid;
    select count(*) into v_contenders
      from public.sutda_players where room_id = p_room and in_hand and is_active and not folded;
    update public.sutda_rooms
      set pot = pot + v_total,
          current_bet = v_me.committed + v_total,
          to_act_remaining = greatest(v_contenders - 1, 0)
      where id = p_room;
  else
    raise exception '잘못된 액션입니다.';
  end if;

  perform public._sutda_advance(p_room);

  select gold_balance into v_balance from public.profiles where id = v_uid;
  return jsonb_build_object('balance', v_balance);
end;
$$;

-- ---------- 타임아웃 자동 다이도 선택으로 표시 ----------
create or replace function public.sutda_timeout(p_room int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room record;
begin
  select * into v_room from public.sutda_rooms where id = p_room for update;
  if not found then return; end if;
  if v_room.status <> 'betting' then return; end if;
  if v_room.turn_deadline is null or now() < v_room.turn_deadline then return; end if;

  update public.sutda_players set folded = true, last_action = '다이'
    where room_id = p_room and user_id = v_room.current_turn;
  update public.sutda_rooms set to_act_remaining = greatest(to_act_remaining - 1, 0) where id = p_room;
  perform public._sutda_advance(p_room);
end;
$$;

-- ---------- 재경기: 새 배팅이 열리므로 이전 선택 초기화 ----------
create or replace function public.sutda_redeal(p_room int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room record;
  v_h record;
  lo int; hi int;
  v_deck int[];
  v_dealt uuid[] := '{}';
  v_idx int;
  v_n int;
  v_first uuid;
  r record;
begin
  select * into v_room from public.sutda_rooms where id = p_room for update;
  if not found then raise exception '방을 찾을 수 없습니다.'; end if;
  if v_room.status <> 'betting' then raise exception '재경기할 수 없습니다.'; end if;
  if v_room.betting_round < 2 then raise exception '마지막 장을 받은 뒤에 가능합니다.'; end if;
  if v_room.redeal_used then raise exception '이미 재경기를 사용했습니다.'; end if;
  if v_room.current_turn <> v_uid then raise exception '당신의 차례에만 가능합니다.'; end if;

  select * into v_h from public.sutda_hands
    where room_id = p_room and hand_no = v_room.hand_no and user_id = v_uid;
  if not found or v_h.card2 is null then raise exception '패가 없습니다.'; end if;
  lo := least(public._sutda_month(v_h.card1), public._sutda_month(v_h.card2));
  hi := greatest(public._sutda_month(v_h.card1), public._sutda_month(v_h.card2));
  if not (lo = 4 and hi = 9) then raise exception '멍텅구리구사(4·9)만 재경기할 수 있습니다.'; end if;

  -- 현재 판 참가자에게 카드만 다시 배분 (앤티/팟/committed 유지)
  select array_agg(user_id order by seat) into v_dealt
    from public.sutda_players where room_id = p_room and in_hand and is_active;
  v_n := coalesce(array_length(v_dealt, 1), 0);

  delete from public.sutda_hands where room_id = p_room and hand_no = v_room.hand_no;
  select array_agg(c order by random()) into v_deck from generate_series(1, 20) c;
  for v_idx in 1 .. v_n loop
    insert into public.sutda_hands(room_id, hand_no, user_id, card1, card2)
      values (p_room, v_room.hand_no, v_dealt[v_idx], v_deck[v_idx*2 - 1], v_deck[v_idx*2]);
  end loop;

  update public.sutda_players set folded = false, last_action = null
    where room_id = p_room and in_hand and is_active;

  v_first := v_dealt[((v_room.hand_no + 1) % v_n) + 1];
  update public.sutda_rooms
    set redeal_used = true,
        to_act_remaining = v_n,
        current_turn = v_first,
        turn_deadline = now() + interval '30 seconds',
        updated_at = now()
    where id = p_room;
end;
$$;
