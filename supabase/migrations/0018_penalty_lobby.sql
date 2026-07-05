-- =============================================================
-- 동물 달리기 "대기실(로비)" — 참가자가 선착순으로 동물을 선택.
-- 0017_penalty.sql 실행 후 이 파일을 SQL Editor에서 실행하세요.
--
-- 흐름: 관리자가 동물 N마리로 대기실 열기(status='lobby') →
--       참가자들이 각자 동물 하나씩 선점(한 동물당 한 명) →
--       관리자가 레이스 시작(status='running').
-- 동물 선점은 아래 penalty_claim_animal() RPC(SECURITY DEFINER)로만 가능.
-- =============================================================

-- 1) 슬롯/로비 컬럼 추가
alter table public.penalty_state
  add column if not exists slots int not null default 0,
  add column if not exists lobby jsonb not null default '[]'::jsonb;
-- lobby 원소 형태: {animal, user_id, display_name, avatar_url}  (미선택은 user_id=null)

-- 2) status 체크 제약에 'lobby' 추가 (기존 인라인 제약을 이름 무관하게 찾아 교체)
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.penalty_state'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%status%';
  if c is not null then
    execute format('alter table public.penalty_state drop constraint %I', c);
  end if;
end $$;

alter table public.penalty_state
  add constraint penalty_state_status_check
  check (status in ('idle','lobby','running','revealed'));

-- 3) 동물 선점/해제 RPC — 참가자(로그인 사용자) 누구나 호출.
--    행 잠금(for update)으로 선착순 직렬화. 한 사람은 한 동물만.
--    · 빈 슬롯 탭 → 선점 (내 기존 픽은 자동 해제=이동)
--    · 내 슬롯 다시 탭 → 해제
--    · 남이 고른 슬롯 탭 → 거부
create or replace function public.penalty_claim_animal(p_slot int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_status text;
  v_lobby  jsonb;
  v_len    int;
  v_owner  uuid;
  v_name   text;
  v_avatar text;
  v_new    jsonb := '[]'::jsonb;
  v_elem   jsonb;
  i        int;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  -- 상태 행 잠금 (동시 선점 직렬화)
  select status, lobby into v_status, v_lobby
    from public.penalty_state where id = 1 for update;

  if v_status is distinct from 'lobby' then
    raise exception '지금은 동물을 고를 수 없어요.';
  end if;

  v_len := jsonb_array_length(v_lobby);
  if p_slot < 0 or p_slot >= v_len then
    raise exception '잘못된 선택이에요.';
  end if;

  v_owner := nullif(v_lobby -> p_slot ->> 'user_id', '')::uuid;

  select display_name, avatar_url into v_name, v_avatar
    from public.profiles where id = v_uid;

  for i in 0 .. v_len - 1 loop
    v_elem := v_lobby -> i;

    -- 내 기존 픽은 모두 비움 (이동/해제 처리)
    if (nullif(v_elem ->> 'user_id', '')::uuid) = v_uid then
      v_elem := v_elem
        || jsonb_build_object('user_id', null, 'display_name', null, 'avatar_url', null);
    end if;

    if i = p_slot then
      if v_owner is null then
        -- 빈 슬롯 → 내가 선점
        v_elem := v_elem || jsonb_build_object(
          'user_id', to_jsonb(v_uid::text),
          'display_name', to_jsonb(coalesce(v_name, '익명')),
          'avatar_url', case when v_avatar is null then 'null'::jsonb else to_jsonb(v_avatar) end
        );
      elsif v_owner = v_uid then
        -- 내 슬롯 다시 탭 → 해제 (위에서 이미 비움)
        null;
      else
        raise exception '이미 선택된 동물이에요.';
      end if;
    end if;

    v_new := v_new || jsonb_build_array(v_elem);
  end loop;

  update public.penalty_state
    set lobby = v_new, updated_at = now()
    where id = 1;
end;
$$;

grant execute on function public.penalty_claim_animal(int) to authenticated;
