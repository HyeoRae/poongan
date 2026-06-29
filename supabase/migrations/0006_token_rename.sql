-- 0003: "골드" 명칭을 "풍산토큰"으로 통일.
-- 사용자에게 노출되는 RPC 에러 메시지만 교체한다(컬럼/함수명 등 식별자는 그대로 유지).
-- _apply_gold 는 송금(transfer_gold)·관리자지급·도박(coinflip/dice)에서 모두 재사용되므로
-- 이 함수 하나만 바꾸면 잔액부족 메시지가 전부 갱신된다.
-- 적용: Supabase SQL Editor 에 이 파일 내용을 실행.

create or replace function public._apply_gold(
  p_user uuid, p_amount int, p_type text, p_reason text, p_created_by uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team int;
  v_new  int;
begin
  -- 행 잠금으로 동시성 보호
  select team_id, gold_balance into v_team, v_new
  from public.profiles where id = p_user for update;

  if not found then
    raise exception '대상 사용자를 찾을 수 없습니다.';
  end if;

  v_new := v_new + p_amount;
  if v_new < 0 then
    raise exception '풍산토큰이 부족합니다.';
  end if;

  update public.profiles set gold_balance = v_new where id = p_user;

  insert into public.transactions(user_id, team_id, amount, type, reason, created_by)
  values (p_user, v_team, p_amount, p_type, p_reason, p_created_by);

  return v_new;
end;
$$;
