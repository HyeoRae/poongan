-- =============================================================
-- 0030 leader_team_transactions() 버그 수정.
--
-- 증상: 팀장이 "팀원 거래내역 보기" → "column reference \"id\" is ambiguous".
-- 원인: RETURNS TABLE 출력열(id·amount·type·reason·created_at)이 조인한
--       transactions/profiles 컬럼과 이름이 겹친다. PL/pgSQL 기본값
--       (#variable_conflict error)은 이런 변수-컬럼 동명(同名)을 모호하다고
--       판단해 오류를 던진다.
-- 수정: 함수 본문 맨 앞에 #variable_conflict use_column 을 선언해, 겹치는
--       이름을 항상 "컬럼"으로 해석하도록 한다(우리가 원하는 동작). 시그니처는
--       0030과 동일하므로 CREATE OR REPLACE 로 교체된다(클라이언트 무변경).
-- =============================================================

create or replace function public.leader_team_transactions(p_limit int default 60)
returns table (
  id         bigint,
  uid        uuid,
  name       text,
  amount     int,
  type       text,
  reason     text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_team int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;

  select role into v_role from public.player_roles where user_id = v_uid;
  if v_role is distinct from 'leader' then
    raise exception '팀장만 사용할 수 있습니다.';
  end if;

  select team_id into v_team from public.profiles where id = v_uid;
  if v_team is null then raise exception '소속 팀이 없습니다.'; end if;

  return query
  select t.id, t.user_id, p.display_name, t.amount, t.type::text, t.reason, t.created_at
  from public.transactions t
  join public.profiles p on p.id = t.user_id
  where p.team_id = v_team and p.role = 'player' and p.is_bot = false
  order by t.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 200));
end;
$$;
grant execute on function public.leader_team_transactions(int) to authenticated;
