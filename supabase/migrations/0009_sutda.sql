-- =============================================================
-- 섯다 — 실시간 멀티플레이(간소화 1라운드) + 족보(광땡/땡/특수/끗 + 잡이패)
-- 0001~0008 실행 후 이 파일을 SQL Editor에서 실행하세요.
--
-- 논리 덱: 카드 1~20. 월 = ((card-1)/2)+1 (1~10월, 각 2장).
--   광패(1·3·8월의 _1) = card in (1,5,15)
-- 화투 이미지는 프론트 전용 매핑(/hwatu_pack). DB는 논리값만 다룬다.
-- =============================================================

-- ---------- 테이블 ----------
create table if not exists public.sutda_rooms (
  id              serial primary key,
  name            text not null,
  created_by      uuid not null references public.profiles(id) on delete cascade,
  status          text not null default 'waiting'
                    check (status in ('waiting','betting','showdown','closed')),
  ante            int  not null default 100 check (ante > 0),
  pot             int  not null default 0,
  current_bet     int  not null default 0,
  current_turn    uuid references public.profiles(id) on delete set null,
  turn_deadline   timestamptz,
  dealer          uuid references public.profiles(id) on delete set null,
  hand_no         int  not null default 0,
  betting_round   int  not null default 0,  -- 1=첫 장 베팅, 2=마지막 장 추가 베팅
  to_act_remaining int not null default 0,
  redeal_used     boolean not null default false,
  last_result     jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.sutda_players (
  room_id        int  not null references public.sutda_rooms(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  seat           int  not null,
  committed      int  not null default 0,
  folded         boolean not null default false,
  is_active      boolean not null default true,  -- 방에 남아있고 이번 판 참여
  in_hand        boolean not null default false, -- 이번 판에 패를 받았는지
  leave_pending  boolean not null default false, -- 나가기 예약(이 판 끝나면 로비로)
  revealed_card1 smallint,
  revealed_card2 smallint,
  revealed_rank  int,
  revealed_label text,
  joined_at      timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat)
);
create index if not exists sutda_players_room_idx on public.sutda_players(room_id);

create table if not exists public.sutda_hands (
  room_id   int  not null references public.sutda_rooms(id) on delete cascade,
  hand_no   int  not null,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  card1     smallint not null check (card1 between 1 and 20),
  card2     smallint check (card2 between 1 and 20),  -- 마지막 장(추가 베팅 전엔 null)
  primary key (room_id, hand_no, user_id)
);

-- 기존 DB 보정(재실행 안전)
alter table public.sutda_rooms add column if not exists betting_round int not null default 0;
alter table public.sutda_players add column if not exists leave_pending boolean not null default false;
alter table public.sutda_hands alter column card2 drop not null;

-- ---------- 족보 헬퍼 ----------
create or replace function public._sutda_month(card int)
returns int language sql immutable as $$ select ((card - 1) / 2) + 1 $$;

create or replace function public._sutda_is_gwang(card int)
returns boolean language sql immutable as $$ select card in (1, 5, 15) $$;

-- 단일 패 기본 점수(×10). 높을수록 강함. 잡이패는 기본 끗값(쇼다운에서 보정).
create or replace function public._sutda_rank(card1 int, card2 int)
returns int
language plpgsql immutable
as $$
declare
  m1 int := public._sutda_month(card1);
  m2 int := public._sutda_month(card2);
  g1 boolean := public._sutda_is_gwang(card1);
  g2 boolean := public._sutda_is_gwang(card2);
  lo int := least(m1, m2);
  hi int := greatest(m1, m2);
begin
  -- 광땡 (둘 다 광): 38 > 18 > 13
  if g1 and g2 then
    if lo = 3 and hi = 8 then return 10030; end if;
    if lo = 1 and hi = 8 then return 10020; end if;
    if lo = 1 and hi = 3 then return 10010; end if;
  end if;
  -- 땡 (같은 월)
  if m1 = m2 then return 8000 + m1 * 10; end if;
  -- 특수 끗
  if lo = 1 and hi = 2  then return 7050; end if; -- 알리
  if lo = 1 and hi = 4  then return 7040; end if; -- 독사
  if lo = 1 and hi = 9  then return 7030; end if; -- 구삥
  if lo = 4 and hi = 10 then return 7020; end if; -- 장사
  if lo = 4 and hi = 6  then return 7010; end if; -- 세륙
  -- 끗 (잡이패의 기본값도 여기서 자연히 나옴)
  return 6000 + ((m1 + m2) % 10) * 10;
end;
$$;

-- 표시용 라벨 (잡이패 이름 포함)
create or replace function public._sutda_label(card1 int, card2 int)
returns text
language plpgsql immutable
as $$
declare
  m1 int := public._sutda_month(card1);
  m2 int := public._sutda_month(card2);
  g1 boolean := public._sutda_is_gwang(card1);
  g2 boolean := public._sutda_is_gwang(card2);
  lo int := least(m1, m2);
  hi int := greatest(m1, m2);
  k  int := (m1 + m2) % 10;
begin
  if g1 and g2 then
    if lo = 3 and hi = 8 then return '38광땡'; end if;
    if lo = 1 and hi = 8 then return '18광땡'; end if;
    if lo = 1 and hi = 3 then return '13광땡'; end if;
  end if;
  if m1 = m2 then
    if m1 = 10 then return '장땡'; end if;
    return m1 || '땡';
  end if;
  if lo = 1 and hi = 2  then return '알리'; end if;
  if lo = 1 and hi = 4  then return '독사'; end if;
  if lo = 1 and hi = 9  then return '구삥'; end if;
  if lo = 4 and hi = 10 then return '장사'; end if;
  if lo = 4 and hi = 6  then return '세륙'; end if;
  -- 잡이패
  if lo = 4 and hi = 7  then return '암행어사'; end if;
  if lo = 3 and hi = 7  then return '땡잡이'; end if;
  if lo = 4 and hi = 9  then return '멍텅구리구사'; end if;
  -- 끗
  if k = 9 then return '갑오(9끗)'; end if;
  if k = 0 then return '망통'; end if;
  return k || '끗';
end;
$$;

-- ---------- 내부: 마지막 장 배분(추가 베팅 시작) ----------
-- 첫 장 베팅이 끝나면 비폴드 참가자에게 두 번째 카드를 나눠주고 2차 베팅을 연다.
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

-- ---------- 내부: 턴 진행 / 종료 판정 ----------
-- 다음 활성(비폴드) 좌석으로 턴 이동. 활성자 1명이면 즉시 정산.
-- 라운드 종료 시: 1차면 마지막 장 배분(추가 베팅), 2차면 쇼다운.
create or replace function public._sutda_advance(p_room int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room    record;
  v_cur_seat int;
  v_next    uuid;
  v_count   int;
begin
  select * into v_room from public.sutda_rooms where id = p_room;

  select count(*) into v_count
    from public.sutda_players
    where room_id = p_room and in_hand and is_active and not folded;

  if v_count <= 1 then
    perform public._sutda_settle(p_room);
    return;
  end if;

  if v_room.to_act_remaining <= 0 then
    if v_room.betting_round = 1 then
      perform public._sutda_deal_round2(p_room);
    else
      perform public._sutda_settle(p_room);
    end if;
    return;
  end if;

  select seat into v_cur_seat
    from public.sutda_players
    where room_id = p_room and user_id = v_room.current_turn;

  -- 현재 좌석 다음의 활성 비폴드 플레이어 (없으면 wrap)
  select user_id into v_next
    from public.sutda_players
    where room_id = p_room and in_hand and is_active and not folded and seat > v_cur_seat
    order by seat
    limit 1;
  if v_next is null then
    select user_id into v_next
      from public.sutda_players
      where room_id = p_room and in_hand and is_active and not folded
      order by seat
      limit 1;
  end if;

  update public.sutda_rooms
    set current_turn = v_next,
        turn_deadline = now() + interval '30 seconds',
        updated_at = now()
    where id = p_room;
end;
$$;

-- ---------- 내부: 정산(쇼다운) ----------
create or replace function public._sutda_settle(p_room int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room        record;
  r             record;
  v_n           int;
  v_pot         int;
  v_max_ddaeng  int := null;   -- 테이블 최고 땡 점수
  v_max_catch   int := null;   -- 테이블 최고 '잡을 수 있는 광땡'(13/18) 점수
  v_best        int := -1;
  v_winners     uuid[] := '{}';
  v_each        int;
  v_remainder   int;
  v_seat        int;
begin
  select * into v_room from public.sutda_rooms where id = p_room;
  v_pot := v_room.pot;

  select count(*) into v_n
    from public.sutda_players
    where room_id = p_room and in_hand and is_active and not folded;

  -- 전원 다이 → 1명만 남음: 패 비공개, 즉시 승리
  if v_n <= 1 then
    select user_id into r
      from public.sutda_players
      where room_id = p_room and in_hand and is_active and not folded
      limit 1;
    if r.user_id is not null and v_pot > 0 then
      perform public._apply_gold(r.user_id, v_pot, 'game', '섯다 승리', r.user_id);
    end if;
    update public.sutda_rooms
      set status='showdown', current_turn=null, turn_deadline=null, pot=0,
          last_result = jsonb_build_object('winner_id', r.user_id, 'pot', v_pot, 'reason', 'fold'),
          updated_at = now()
      where id = p_room;
    return;
  end if;

  -- 1) 기본 점수 + 패 공개 + 테이블 상태 수집
  for r in
    select p.user_id, p.seat, h.card1, h.card2
    from public.sutda_players p
    join public.sutda_hands h
      on h.room_id = p.room_id and h.hand_no = v_room.hand_no and h.user_id = p.user_id
    where p.room_id = p_room and p.in_hand and p.is_active and not p.folded
  loop
    update public.sutda_players
      set revealed_card1 = r.card1,
          revealed_card2 = r.card2,
          revealed_rank  = public._sutda_rank(r.card1, r.card2),
          revealed_label = public._sutda_label(r.card1, r.card2)
      where room_id = p_room and user_id = r.user_id;

    -- 최고 땡
    if public._sutda_month(r.card1) = public._sutda_month(r.card2) then
      v_max_ddaeng := greatest(coalesce(v_max_ddaeng, 0), 8000 + public._sutda_month(r.card1) * 10);
    end if;
    -- 잡을 수 있는 광땡(13/18광땡, 38 제외)
    if public._sutda_label(r.card1, r.card2) in ('13광땡','18광땡') then
      v_max_catch := greatest(coalesce(v_max_catch, 0), public._sutda_rank(r.card1, r.card2));
    end if;
  end loop;

  -- 2) 잡이패 보정 → 유효점수 산출, 승자 선정
  for r in
    select user_id, revealed_card1 c1, revealed_card2 c2, revealed_rank base
    from public.sutda_players
    where room_id = p_room and in_hand and is_active and not folded
  loop
    declare
      m1 int := public._sutda_month(r.c1);
      m2 int := public._sutda_month(r.c2);
      lo int := least(public._sutda_month(r.c1), public._sutda_month(r.c2));
      hi int := greatest(public._sutda_month(r.c1), public._sutda_month(r.c2));
      eff int := r.base;
    begin
      if lo = 3 and hi = 7 and v_max_ddaeng is not null then
        eff := v_max_ddaeng + 5;        -- 땡잡이
      elsif lo = 4 and hi = 7 and v_max_catch is not null then
        eff := v_max_catch + 5;          -- 암행어사
      end if;

      update public.sutda_players set revealed_rank = eff
        where room_id = p_room and user_id = r.user_id;

      if eff > v_best then
        v_best := eff;
        v_winners := array[r.user_id];
      elsif eff = v_best then
        v_winners := v_winners || r.user_id;
      end if;
    end;
  end loop;

  -- 3) 팟 분배 (동점이면 균등 + 나머지 좌석 순)
  if v_pot > 0 and array_length(v_winners, 1) >= 1 then
    v_each := v_pot / array_length(v_winners, 1);
    v_remainder := v_pot - v_each * array_length(v_winners, 1);
    for r in
      select p.user_id, p.seat
      from public.sutda_players p
      where p.room_id = p_room and p.user_id = any(v_winners)
      order by p.seat
    loop
      perform public._apply_gold(
        r.user_id,
        v_each + (case when v_remainder > 0 then 1 else 0 end),
        'game', '섯다 당첨', r.user_id);
      if v_remainder > 0 then v_remainder := v_remainder - 1; end if;
    end loop;
  end if;

  update public.sutda_rooms
    set status='showdown', current_turn=null, turn_deadline=null, pot=0,
        last_result = jsonb_build_object(
          'winners', to_jsonb(v_winners),
          'pot', v_pot,
          'best', v_best,
          'reason', 'showdown'),
        updated_at = now()
    where id = p_room;
end;
$$;

-- ---------- 공개 RPC ----------

-- 방 생성 + 생성자 자동 착석(seat 0)
create or replace function public.sutda_create_room(p_name text, p_ante int)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room int;
begin
  if coalesce(p_ante, 0) <= 0 then raise exception '앤티는 1 이상이어야 합니다.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception '방 이름을 입력하세요.'; end if;

  insert into public.sutda_rooms(name, created_by, ante)
    values (trim(p_name), v_uid, p_ante)
    returning id into v_room;

  insert into public.sutda_players(room_id, user_id, seat)
    values (v_room, v_uid, 0);

  return v_room;
end;
$$;

-- 방 합류 (대기 중일 때만, 정원 8)
create or replace function public.sutda_join_room(p_room int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room record;
  v_seat int;
  v_cnt  int;
begin
  select * into v_room from public.sutda_rooms where id = p_room for update;
  if not found then raise exception '방을 찾을 수 없습니다.'; end if;
  if v_room.status not in ('waiting', 'showdown') then
    raise exception '판 진행 중에는 입장할 수 없습니다. 잠시 후 다시 시도하세요.';
  end if;

  if exists (select 1 from public.sutda_players where room_id = p_room and user_id = v_uid) then
    -- 이미 참가 → 재활성화(나가기 예약 해제)
    update public.sutda_players set is_active = true, leave_pending = false
      where room_id = p_room and user_id = v_uid;
    return;
  end if;

  select count(*) into v_cnt from public.sutda_players where room_id = p_room and is_active;
  if v_cnt >= 8 then raise exception '정원(8명)이 찼습니다.'; end if;

  select coalesce(max(seat), -1) + 1 into v_seat from public.sutda_players where room_id = p_room;
  insert into public.sutda_players(room_id, user_id, seat) values (p_room, v_uid, v_seat);
end;
$$;

-- 방 나가기
--  · 판 진행 중(betting + 이번 판 참여): 즉시 다이 대신 "나가기 예약" 토글
--    → 이 판은 끝까지 치고, 판이 끝나면(쇼다운) 클라이언트가 다시 호출해 실제로 나간다.
--  · 그 외(대기/결과): 즉시 퇴장.
create or replace function public.sutda_leave_room(p_room int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room record;
  v_me   record;
  v_new_host uuid;
begin
  select * into v_room from public.sutda_rooms where id = p_room for update;
  if not found then return; end if;

  select * into v_me from public.sutda_players where room_id = p_room and user_id = v_uid;
  if not found then return; end if;

  -- 판 진행 중이고 이번 판에 참여 중이면 → 예약 토글(다이 안 함)
  if v_room.status = 'betting' and v_me.in_hand then
    update public.sutda_players
      set leave_pending = not leave_pending
      where room_id = p_room and user_id = v_uid;
    return;
  end if;

  -- 즉시 퇴장
  delete from public.sutda_players where room_id = p_room and user_id = v_uid;

  -- 호스트 이양 / 빈 방 종료
  if v_room.created_by = v_uid then
    select user_id into v_new_host
      from public.sutda_players where room_id = p_room and is_active
      order by seat limit 1;
    if v_new_host is null then
      update public.sutda_rooms set status = 'closed', updated_at = now() where id = p_room;
    else
      update public.sutda_rooms set created_by = v_new_host, updated_at = now() where id = p_room;
    end if;
  end if;
end;
$$;

-- 판 시작 (호스트/관리자) — 셔플·딜·앤티
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
    set committed = 0, folded = false, in_hand = false,
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

-- 베팅 액션: call / raise(하프) / fold
create or replace function public.sutda_action(p_room int, p_action text, p_amount int default 0)
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
    update public.sutda_players set folded = true where room_id = p_room and user_id = v_uid;
    update public.sutda_rooms set to_act_remaining = greatest(to_act_remaining - 1, 0) where id = p_room;

  elsif p_action = 'call' then
    v_need := v_room.current_bet - v_me.committed;
    if v_need > 0 then
      v_balance := public._apply_gold(v_uid, -v_need, 'game', '섯다 콜', v_uid);
      update public.sutda_players set committed = v_room.current_bet where room_id = p_room and user_id = v_uid;
      update public.sutda_rooms set pot = pot + v_need where id = p_room;
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
    update public.sutda_players set committed = v_me.committed + v_total where room_id = p_room and user_id = v_uid;
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

-- 타임아웃: 마감 초과 시 현재 차례 자동 다이 (누구나 호출, 멱등)
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

  update public.sutda_players set folded = true
    where room_id = p_room and user_id = v_room.current_turn;
  update public.sutda_rooms set to_act_remaining = greatest(to_act_remaining - 1, 0) where id = p_room;
  perform public._sutda_advance(p_room);
end;
$$;

-- 멍텅구리구사(4·9) 재경기 — 구사 보유자가 첫 행동 전에, 판당 1회
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

  update public.sutda_players set folded = false
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

-- 방 종료 (호스트/관리자)
create or replace function public.sutda_close_room(p_room int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room record;
begin
  select * into v_room from public.sutda_rooms where id = p_room for update;
  if not found then return; end if;
  if v_room.created_by <> v_uid and not public.is_admin(v_uid) then
    raise exception '방장만 종료할 수 있습니다.';
  end if;
  update public.sutda_rooms set status = 'closed', updated_at = now() where id = p_room;
end;
$$;

-- ---------- RLS ----------
alter table public.sutda_rooms   enable row level security;
alter table public.sutda_players enable row level security;
alter table public.sutda_hands   enable row level security;

drop policy if exists "read_sutda_rooms" on public.sutda_rooms;
create policy "read_sutda_rooms" on public.sutda_rooms for select to authenticated using (true);

drop policy if exists "read_sutda_players" on public.sutda_players;
create policy "read_sutda_players" on public.sutda_players for select to authenticated using (true);

-- 비밀 패: 본인 + 관리자만 (관리자는 모더레이션/참관용 전체 열람)
drop policy if exists "read_sutda_hands" on public.sutda_hands;
create policy "read_sutda_hands" on public.sutda_hands for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- 쓰기 정책 없음 → 모든 변경은 SECURITY DEFINER RPC로만

-- ---------- Realtime ----------
-- 공개 테이블만 발행. sutda_hands 는 절대 추가하지 않는다(관리자도 select로만 조회).
do $$
begin
  begin alter publication supabase_realtime add table public.sutda_rooms;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.sutda_players; exception when duplicate_object then null; end;
end $$;
